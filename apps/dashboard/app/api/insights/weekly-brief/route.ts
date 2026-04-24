import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, handleApiError, getCorsHeaders } from '@/lib/response'
import { callDashboardAi } from '@/lib/ai-client'

/**
 * Hafta Özeti Brief — dashboard üstü prescriptive AI kartı.
 *
 * Veri toplama (son 7g):
 *   - newCampaigns:     count + örnek 3 başlık (site/kategori ile)
 *   - bonusInflation:   kategori başına median (bu hafta) ve önceki hafta
 *                       median + delta (TL ve %).
 *   - topVersionDiffs:  campaign_versions'tan body uzunluk farkı en yüksek 2.
 *
 * Bu metrikler DeepSeek'e Türkçe prompt ile post edilir; 3 satırlık format
 * beklenir. AI yoksa/down ise endpoint yine 200 döner ama
 * `aiAvailable=false` flag'i ile fallback metinler gönderir; component bunu
 * göstermeli (dashboard kırılmasın).
 *
 * Cache: in-memory 1 saat (basit Map). Multi-instance deploy'da her node
 * kendi cache'ini tutar — kabul edilebilir, çünkü brief idempotent ve
 * 1 brief/saat * $0.0001 ihmal edilebilir.
 */

interface BriefCacheEntry {
  generatedAt: string
  dateFrom: string
  dateTo: string
  topChange: string
  risk: string
  action: string
  aiAvailable: boolean
  /** Geliştirici/debug — frontend göstermez. */
  meta?: {
    newCampaignsCount: number
    inflationCount: number
    versionDiffCount: number
    aiReason?: string
  }
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1h
let cached: BriefCacheEntry | null = null
let cachedAt = 0

function isCacheValid(force: boolean): boolean {
  if (force) return false
  if (!cached) return false
  return Date.now() - cachedAt < CACHE_TTL_MS
}

interface NewCampaignSample {
  id: string
  title: string
  siteName: string
  category: string | null
}

interface CategoryInflation {
  category: string
  currentMedian: number
  previousMedian: number
  deltaAbs: number
  deltaPct: number | null
  sampleSize: number
}

interface VersionDiffSample {
  campaignId: string
  title: string
  siteName: string
  changeKind: string
  bodyLenBefore: number
  bodyLenAfter: number
  diffSize: number
  changedAt: string
}

const categoryExpr = `COALESCE(
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.category')), ''),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.campaign_type')), '')
)`

/**
 * Bonus tutarı — competition route'undaki türetimle aynı kuralı uygular.
 * Tek bonus kaynak alanı (direct_bonus_amount → freebet → percent*deposit)
 */
const effectiveBonusExpr = `
  CASE
    WHEN CAST(NULLIF(TRIM(COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.bonus_amount')),
      JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.bonus_amount'))
    )), '') AS DECIMAL(20,4)) > 0 THEN
      CAST(NULLIF(TRIM(COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.bonus_amount')),
        JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.bonus_amount'))
      )), '') AS DECIMAL(20,4))
    WHEN CAST(NULLIF(TRIM(COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.free_bet_amount')),
      JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.freebet_amount')),
      JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.conditions.freebet_amount'))
    )), '') AS DECIMAL(20,4)) > 0 THEN
      CAST(NULLIF(TRIM(COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.free_bet_amount')),
        JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.freebet_amount')),
        JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.conditions.freebet_amount'))
      )), '') AS DECIMAL(20,4))
    ELSE NULL
  END
`

function asInt(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === 'number' ? value : parseInt(value, 10)
  return Number.isFinite(n) ? n : 0
}

function asFloat(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * MySQL 8'de PERCENTILE_CONT yok; numeric median'ı uygulama tarafında
 * hesaplıyoruz. Küçük veri seti (haftalık) için kabul edilebilir.
 */
function median(values: number[]): number {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function gatherMetrics(): Promise<{
  newCampaigns: NewCampaignSample[]
  newCampaignsCount: number
  bonusInflation: CategoryInflation[]
  topVersionDiffs: VersionDiffSample[]
  dateFrom: string
  dateTo: string
}> {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  // 1) Yeni kampanyalar (last 7d)
  const newCampaignRows = await query<{
    id: string
    title: string
    site_name: string
    category: string | null
  }>(
    `
    SELECT c.id, c.title, s.name AS site_name, ${categoryExpr} AS category
    FROM campaigns c
    JOIN sites s ON s.id = c.site_id
    WHERE c.first_seen_at >= $1
    ORDER BY c.first_seen_at DESC
    LIMIT 500
    `,
    [sevenDaysAgo]
  )

  const newCampaigns: NewCampaignSample[] = newCampaignRows.slice(0, 3).map((row) => ({
    id: row.id,
    title: row.title,
    siteName: row.site_name,
    category: row.category,
  }))

  // 2) Bonus enflasyonu — kategori başına median (bu 7g vs önceki 7g)
  const bonusRows = await query<{
    category: string | null
    bonus: string | number | null
    bucket: 'current' | 'previous'
  }>(
    `
    SELECT
      ${categoryExpr} AS category,
      ${effectiveBonusExpr} AS bonus,
      CASE
        WHEN c.first_seen_at >= $1 THEN 'current'
        ELSE 'previous'
      END AS bucket
    FROM campaigns c
    WHERE c.first_seen_at >= $2
      AND c.first_seen_at < $3
      AND ${categoryExpr} IS NOT NULL
      AND ${categoryExpr} != ''
    `,
    [sevenDaysAgo, fourteenDaysAgo, now]
  )

  const buckets = new Map<string, { current: number[]; previous: number[] }>()
  for (const row of bonusRows) {
    if (!row.category) continue
    const value = asFloat(row.bonus)
    if (value <= 0) continue
    let entry = buckets.get(row.category)
    if (!entry) {
      entry = { current: [], previous: [] }
      buckets.set(row.category, entry)
    }
    if (row.bucket === 'current') entry.current.push(value)
    else entry.previous.push(value)
  }

  const bonusInflation: CategoryInflation[] = []
  for (const [category, entry] of buckets) {
    if (entry.current.length === 0) continue
    const currentMedian = median(entry.current)
    const previousMedian = median(entry.previous)
    const deltaAbs = currentMedian - previousMedian
    const deltaPct =
      previousMedian > 0 ? (deltaAbs / previousMedian) * 100 : null
    bonusInflation.push({
      category,
      currentMedian: Math.round(currentMedian),
      previousMedian: Math.round(previousMedian),
      deltaAbs: Math.round(deltaAbs),
      deltaPct: deltaPct !== null ? Math.round(deltaPct * 10) / 10 : null,
      sampleSize: entry.current.length,
    })
  }
  // En çarpıcı 5 (mutlak delta'ya göre)
  bonusInflation.sort((a, b) => Math.abs(b.deltaAbs) - Math.abs(a.deltaAbs))
  const topInflation = bonusInflation.slice(0, 5)

  // 3) Top 2 değişiklik (campaign_versions) — son 7g, body uzunluk farkı büyük
  const versionRows = await query<{
    campaign_id: string
    title: string | null
    site_name: string
    change_type: string | null
    body: string | null
    prev_body: string | null
    created_at: string | Date
  }>(
    `
    SELECT
      cv.campaign_id,
      c.title,
      s.name AS site_name,
      cv.change_type,
      cv.body,
      LAG(cv.body) OVER (PARTITION BY cv.campaign_id ORDER BY cv.version_no) AS prev_body,
      cv.created_at
    FROM campaign_versions cv
    JOIN campaigns c ON c.id = cv.campaign_id
    JOIN sites s ON s.id = c.site_id
    WHERE cv.created_at >= $1
    `,
    [sevenDaysAgo]
  )

  const ranked = versionRows
    .map((row) => {
      const before = (row.prev_body ?? '').length
      const after = (row.body ?? '').length
      const diff = Math.abs(after - before)
      return {
        campaignId: row.campaign_id,
        title: row.title || '(başlıksız)',
        siteName: row.site_name,
        changeKind: row.change_type || 'edit',
        bodyLenBefore: before,
        bodyLenAfter: after,
        diffSize: diff,
        changedAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row.created_at),
      }
    })
    .filter((r) => r.diffSize > 0)
    .sort((a, b) => b.diffSize - a.diffSize)

  // Aynı kampanyadan birden fazla versiyon olabilir — sadece en büyük olanı al.
  const seen = new Set<string>()
  const topVersionDiffs: VersionDiffSample[] = []
  for (const r of ranked) {
    if (seen.has(r.campaignId)) continue
    seen.add(r.campaignId)
    topVersionDiffs.push(r)
    if (topVersionDiffs.length >= 2) break
  }

  return {
    newCampaigns,
    newCampaignsCount: newCampaignRows.length,
    bonusInflation: topInflation,
    topVersionDiffs,
    dateFrom: isoDate(sevenDaysAgo),
    dateTo: isoDate(now),
  }
}

function buildPrompt(metrics: {
  newCampaigns: NewCampaignSample[]
  newCampaignsCount: number
  bonusInflation: CategoryInflation[]
  topVersionDiffs: VersionDiffSample[]
}): string {
  const sampleStr =
    metrics.newCampaigns.length > 0
      ? metrics.newCampaigns
          .map((c) => `  - "${c.title}" (${c.siteName}${c.category ? ', ' + c.category : ''})`)
          .join('\n')
      : '  (örnek yok)'

  const inflStr =
    metrics.bonusInflation.length > 0
      ? metrics.bonusInflation
          .map((i) => {
            const pct = i.deltaPct !== null ? ` (${i.deltaPct >= 0 ? '+' : ''}${i.deltaPct}%)` : ''
            return `  - ${i.category}: ₺${i.currentMedian} (önceki ₺${i.previousMedian}, Δ ${
              i.deltaAbs >= 0 ? '+' : ''
            }${i.deltaAbs}${pct}) [n=${i.sampleSize}]`
          })
          .join('\n')
      : '  (kayda değer enflasyon yok)'

  const diffStr =
    metrics.topVersionDiffs.length > 0
      ? metrics.topVersionDiffs
          .map(
            (d) =>
              `  - "${d.title}" (${d.siteName}): ${d.changeKind}, body ${d.bodyLenBefore}→${d.bodyLenAfter} karakter`
          )
          .join('\n')
      : '  (önemli değişiklik yok)'

  return `Aşağıdaki veriye dayanarak Türkçe, 3 satırlık bir growth brief üret. Format:
1. TOP DEĞİŞİKLİK: <bir cümle, somut + sayısal>
2. RİSK: <bir cümle>
3. AKSIYON: <prescriptive — örn "Misli 1500'e çıktı; sen 1300'le karşıla VEYA freebet ile diferansiye et">

Veri:
- Yeni kampanyalar (son 7g): toplam ${metrics.newCampaignsCount}, örnek 3:
${sampleStr}
- Bonus median değişimleri (kategori başına, bu hafta vs önceki hafta):
${inflStr}
- Top 2 değişiklik (campaign_versions'tan en büyük diff):
${diffStr}

ÖNEMLİ: Yanıtın TAM 3 satır olsun. Her satır ayrı bir başlık (TOP DEĞİŞİKLİK, RİSK, AKSIYON) ile başlasın. Başka açıklama, intro/outro ekleme.`
}

/**
 * AI cevabını 3 satıra parse eder. Format esnek tutuluyor — başlıkları
 * büyük/küçük harf duyarsız regex ile ayıklıyoruz.
 */
function parseBrief(content: string): { topChange: string; risk: string; action: string } {
  const text = content.trim()
  // Numaralandırma + başlık + iki nokta üst üste, çoklu satır toleranslı.
  const grab = (label: string): string => {
    const re = new RegExp(
      `(?:^|\\n)\\s*(?:\\d+\\.\\s*|[-*]\\s*)?${label}\\s*[:：]\\s*(.+?)(?=\\n\\s*(?:\\d+\\.|[-*]|TOP DE\\u011e\\u0130\\u015e\\u0130KL\\u0130K|R\\u0130SK|AKSIYON|$))`,
      'is'
    )
    const m = text.match(re)
    return m && m[1] ? m[1].trim() : ''
  }
  let topChange = grab('TOP DEĞİŞİKLİK')
  let risk = grab('RİSK')
  let action = grab('AKSIYON')

  // Fallback — eğer başlıklar bulunamazsa satırlara böl.
  if (!topChange && !risk && !action) {
    const lines = text
      .split('\n')
      .map((l) => l.replace(/^\s*\d+[\.)]\s*/, '').trim())
      .filter(Boolean)
    topChange = lines[0] || ''
    risk = lines[1] || ''
    action = lines[2] || ''
  }

  return {
    topChange: topChange || 'Hafta özeti için yeterli veri yok.',
    risk: risk || 'Risk sinyali tespit edilmedi.',
    action: action || 'Aksiyon önerisi için daha fazla veri gerekli.',
  }
}

export async function GET(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get('force') === '1'
    if (isCacheValid(force) && cached) {
      return successResponse(cached)
    }

    const metrics = await gatherMetrics()
    const prompt = buildPrompt(metrics)

    const aiResult = await callDashboardAi(
      [
        {
          role: 'system',
          content:
            'Sen bir spor bahis sektörü growth analistisin. Kısa, somut, Türkçe yanıt verirsin. Cevabın asla 3 satırı geçmez.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.3, max_tokens: 400 }
    )

    let topChange: string
    let risk: string
    let action: string
    let aiAvailable = false
    let aiReason: string | undefined

    if (aiResult.status === 'ok') {
      const parsed = parseBrief(aiResult.content)
      topChange = parsed.topChange
      risk = parsed.risk
      action = parsed.action
      aiAvailable = true
    } else {
      aiReason = aiResult.status
      // Fallback — AI yoksa veriden minimal mesaj üret.
      const topInfl = metrics.bonusInflation[0]
      topChange = topInfl
        ? `${topInfl.category} kategorisinde median bonus ₺${topInfl.previousMedian} → ₺${topInfl.currentMedian} (Δ ${
            topInfl.deltaAbs >= 0 ? '+' : ''
          }${topInfl.deltaAbs}${
            topInfl.deltaPct !== null
              ? `, ${topInfl.deltaPct >= 0 ? '+' : ''}${topInfl.deltaPct}%`
              : ''
          })`
        : `Son 7 günde ${metrics.newCampaignsCount} yeni kampanya.`
      risk = 'AI özeti şu an mevcut değil; sadece ham metrik gösteriliyor.'
      action = 'AI servisi normale döndüğünde kart otomatik güncellenecek.'
    }

    const entry: BriefCacheEntry = {
      generatedAt: new Date().toISOString(),
      dateFrom: metrics.dateFrom,
      dateTo: metrics.dateTo,
      topChange,
      risk,
      action,
      aiAvailable,
      meta: {
        newCampaignsCount: metrics.newCampaignsCount,
        inflationCount: metrics.bonusInflation.length,
        versionDiffCount: metrics.topVersionDiffs.length,
        aiReason,
      },
    }

    cached = entry
    cachedAt = Date.now()

    return successResponse(entry)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) })
}
