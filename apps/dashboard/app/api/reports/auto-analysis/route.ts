import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne } from '@/lib/db'
import {
  successResponse,
  handleApiError,
  errorResponse,
  getCorsHeaders,
} from '@/lib/response'
import { callDashboardAi } from '@/lib/ai-client'
import {
  validateAutoAnalysis,
  computeDiff,
  emptyDiffResult,
  type DiffResult,
  type WeeklyReportSnapshot,
} from '@bitalih/shared/reports'

/**
 * D6 — Auto analysis
 *
 * Verilen `from` / `to` aralığı için:
 *   1) Scrape durumu (son run completed mı?)
 *   2) Bu döneme ait weekly_report var mı?
 *   3) Dönemin agregalarını topla (campaigns + campaign_ai_analyses + campaign_versions)
 *   4) DeepSeek'e 6 başlıklı Türkçe prose rapor ürettir
 *
 * Kullanım amacı: Reports sayfasında "bu hafta henüz rapor yok ama veri var"
 * durumunda AI ile anlık özet üretmek. Brief (dashboard üstü 3 satır) ile
 * farkı: bu endpoint daha uzun/derin, dönem-bazlı ve kullanıcı tarafından
 * tetiklenir (sayfaya girince).
 *
 * Cache: 1 saat in-memory, anahtar `from_to`. `?force=1` bypass.
 */

const dateRegex = /^\d{4}-\d{2}-\d{2}$/
const querySchema = z.object({
  from: z.string().regex(dateRegex, 'from YYYY-MM-DD olmalı'),
  to: z.string().regex(dateRegex, 'to YYYY-MM-DD olmalı'),
  force: z.string().optional(),
})

// AnalysisSections is the persisted shape consumed by auto-analysis-card
// (kept identical to the prior interface so the UI doesn't change). The
// optional `confidence` field rides along but is not yet rendered.
interface AnalysisSections {
  summary: string
  topMovers: string
  bonusInsights: string
  categoryInsights: string
  riskFlags: string
  recommendations: string
  confidence?: number
}

interface AutoAnalysisPayload {
  period: { from: string; to: string }
  dataReady: boolean
  lastScrapeAt: string | null
  hasExistingReport: boolean
  analysis: AnalysisSections | null
  notes: string[]
  // BE-11: diff vs. previous week. Always present when the analysis ran;
  // null when we couldn't run a comparison (no prior report). UI is not
  // surfacing this yet — kept in the payload for log/debug visibility.
  diff: DiffResult | null
  generatedAt: string
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 saat
const cache = new Map<string, { at: number; data: AutoAnalysisPayload }>()

function readCache(key: string, force: boolean): AutoAnalysisPayload | null {
  if (force) return null
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at >= CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return hit.data
}

function writeCache(key: string, data: AutoAnalysisPayload): void {
  cache.set(key, { at: Date.now(), data })
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const categoryExpr = `COALESCE(
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.category')), ''),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.campaign_type')), '')
)`

/** competition/route.ts'teki effective_bonus_amount ile aynı sırayla. */
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

function median(values: number[]): number {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

interface PeriodMetrics {
  from: string
  to: string
  totals: {
    totalCampaigns: number
    activeCampaigns: number
    newCampaigns: number
    endedCampaigns: number
  }
  bonus: {
    sampleSize: number
    min: number
    median: number
    max: number
    avg: number
  }
  topSites: Array<{
    siteName: string
    campaignCount: number
    activeCount: number
    avgBonus: number
  }>
  topCategories: Array<{ category: string; count: number; medianBonus: number }>
  versionActivity: {
    campaignsChanged: number
    totalVersions: number
    bonusChangeCount: number
  }
}

async function gatherPeriodMetrics(from: string, to: string): Promise<PeriodMetrics> {
  const fromStart = `${from} 00:00:00`
  const toEnd = `${to} 23:59:59`

  // 1) Campaign totals — dönemdeki first_seen_at / status
  const totalsRow = await queryOne<{
    total_campaigns: string | number | null
    active_campaigns: string | number | null
    new_campaigns: string | number | null
    ended_campaigns: string | number | null
  }>(
    `
    SELECT
      COUNT(*) AS total_campaigns,
      SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) AS active_campaigns,
      SUM(CASE WHEN c.first_seen_at >= $1 AND c.first_seen_at <= $2 THEN 1 ELSE 0 END) AS new_campaigns,
      SUM(CASE WHEN c.valid_to IS NOT NULL AND c.valid_to >= $3 AND c.valid_to <= $4 THEN 1 ELSE 0 END) AS ended_campaigns
    FROM campaigns c
    WHERE (c.first_seen_at <= $5)
      AND (c.last_seen_at IS NULL OR c.last_seen_at >= $6)
    `,
    [fromStart, toEnd, fromStart, toEnd, toEnd, fromStart]
  )

  // 2) Bonus stats — effective bonus distribution
  const bonusRows = await query<{ bonus: string | number | null }>(
    `
    SELECT ${effectiveBonusExpr} AS bonus
    FROM campaigns c
    WHERE c.first_seen_at <= $1
      AND (c.last_seen_at IS NULL OR c.last_seen_at >= $2)
    `,
    [toEnd, fromStart]
  )
  const bonusValues = bonusRows
    .map((r) => asFloat(r.bonus))
    .filter((v) => v > 0)
    .sort((a, b) => a - b)
  const bonusSample = bonusValues.length
  const bonusMin = bonusSample > 0 ? bonusValues[0] : 0
  const bonusMax = bonusSample > 0 ? bonusValues[bonusSample - 1] : 0
  const bonusMedian = median(bonusValues)
  const bonusAvg =
    bonusSample > 0 ? bonusValues.reduce((s, v) => s + v, 0) / bonusSample : 0

  // 3) Top sites — kampanya sayısı + ortalama bonus
  const siteRows = await query<{
    site_name: string
    campaign_count: string | number
    active_count: string | number
    avg_bonus: string | number | null
  }>(
    `
    SELECT
      s.name AS site_name,
      COUNT(*) AS campaign_count,
      SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) AS active_count,
      AVG(${effectiveBonusExpr}) AS avg_bonus
    FROM campaigns c
    JOIN sites s ON s.id = c.site_id
    WHERE c.first_seen_at <= $1
      AND (c.last_seen_at IS NULL OR c.last_seen_at >= $2)
    GROUP BY s.id, s.name
    ORDER BY campaign_count DESC
    LIMIT 10
    `,
    [toEnd, fromStart]
  )

  // 4) Top categories — kategori başına kampanya + median bonus
  const categoryRows = await query<{
    category: string | null
    count: string | number
    bonus: string | number | null
  }>(
    `
    SELECT
      ${categoryExpr} AS category,
      ${effectiveBonusExpr} AS bonus
    FROM campaigns c
    WHERE c.first_seen_at <= $1
      AND (c.last_seen_at IS NULL OR c.last_seen_at >= $2)
      AND ${categoryExpr} IS NOT NULL
      AND ${categoryExpr} != ''
    `,
    [toEnd, fromStart]
  )
  const catBuckets = new Map<string, number[]>()
  const catCount = new Map<string, number>()
  for (const row of categoryRows) {
    if (!row.category) continue
    catCount.set(row.category, (catCount.get(row.category) ?? 0) + 1)
    const v = asFloat(row.bonus)
    if (v > 0) {
      const arr = catBuckets.get(row.category) ?? []
      arr.push(v)
      catBuckets.set(row.category, arr)
    }
  }
  const topCategories = Array.from(catCount.entries())
    .map(([category, count]) => ({
      category,
      count,
      medianBonus: Math.round(median(catBuckets.get(category) ?? [])),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // 5) Version activity — dönemdeki değişiklikler
  const versionRow = await queryOne<{
    campaigns_changed: string | number | null
    total_versions: string | number | null
    bonus_change_count: string | number | null
  }>(
    `
    SELECT
      COUNT(DISTINCT cv.campaign_id) AS campaigns_changed,
      COUNT(*) AS total_versions,
      SUM(CASE
        WHEN cv.change_type IN ('bonus_change', 'amount_change', 'value_change') THEN 1
        WHEN JSON_EXTRACT(cv.diff_summary, '$.bonus_amount') IS NOT NULL THEN 1
        ELSE 0
      END) AS bonus_change_count
    FROM campaign_versions cv
    WHERE cv.created_at >= $1 AND cv.created_at <= $2
    `,
    [fromStart, toEnd]
  )

  return {
    from,
    to,
    totals: {
      totalCampaigns: asInt(totalsRow?.total_campaigns),
      activeCampaigns: asInt(totalsRow?.active_campaigns),
      newCampaigns: asInt(totalsRow?.new_campaigns),
      endedCampaigns: asInt(totalsRow?.ended_campaigns),
    },
    bonus: {
      sampleSize: bonusSample,
      min: Math.round(bonusMin),
      median: Math.round(bonusMedian),
      max: Math.round(bonusMax),
      avg: Math.round(bonusAvg),
    },
    topSites: siteRows.map((r) => ({
      siteName: r.site_name,
      campaignCount: asInt(r.campaign_count),
      activeCount: asInt(r.active_count),
      avgBonus: Math.round(asFloat(r.avg_bonus)),
    })),
    topCategories,
    versionActivity: {
      campaignsChanged: asInt(versionRow?.campaigns_changed),
      totalVersions: asInt(versionRow?.total_versions),
      bonusChangeCount: asInt(versionRow?.bonus_change_count),
    },
  }
}

// ---------------------------------------------------------------------------
// AI prompt
// ---------------------------------------------------------------------------

function buildUserPrompt(metrics: PeriodMetrics): string {
  return `Aşağıdaki rekabet verisine dayanarak Türkçe bir rapor üret.

Dönem: ${metrics.from} → ${metrics.to}

VERİ (JSON):
${JSON.stringify(metrics, null, 2)}

İSTENEN: Tam olarak 6 alan içeren BİR JSON nesnesi döndür. Hiçbiri boş olmasın. Her biri 2-4 cümle akıcı TÜRKÇE prose olsun. ASLA madde işareti (-, *, numaralandırma) KULLANMA. JSON anahtarları:

{
  "summary": "Dönemin genel özeti; kampanya hacmi, aktif/yeni sayısı, genel hareket.",
  "topMovers": "Hangi siteler öne çıktı, hangileri geriledi. Somut rakamlarla.",
  "bonusInsights": "Bonus dağılımı (min/median/max), varsa artış/azalış trendi.",
  "categoryInsights": "En yoğun kategoriler, kategori bazlı bonus median yorumu.",
  "riskFlags": "Dikkat çeken anomaliler: sıra dışı bonus, yüksek versiyon trafiği vb.",
  "recommendations": "2-3 somut aksiyon önerisi (Bitalih perspektifinden).",
  "confidence": 0.0..1.0 arası bir sayı (çıktıya olan güveniniz)
}

Sadece JSON döndür. Başka açıklama, markdown, kod bloğu ekleme.`
}

/**
 * BE-11: build a snapshot of the just-computed period for diff comparison.
 * Categories come from `topCategories` (the AI route already aggregates
 * them); volume from `totals.totalCampaigns`.
 */
function snapshotFromMetrics(
  metrics: PeriodMetrics,
  aiConfidence: number | null
): WeeklyReportSnapshot {
  return {
    totalCampaigns: metrics.totals.totalCampaigns,
    categories: metrics.topCategories.map((c) => c.category),
    aiConfidence,
  }
}

/**
 * BE-11: previous-week comparison. Looks for the most recent stored
 * weekly_report row whose period_end is strictly before this period's
 * `from`. Falls back to an empty diff result when nothing is found or
 * the lookup throws.
 */
async function loadPreviousSnapshot(
  fromDate: string
): Promise<WeeklyReportSnapshot | null> {
  try {
    const row = await queryOne<{
      report_payload: unknown
      by_site: string | null
      campaign_count: string | number | null
      diff_metadata: unknown
    }>(
      `
      SELECT report_payload, by_site, campaign_count, diff_metadata
      FROM weekly_reports
      WHERE COALESCE(period_end, report_week_end) IS NOT NULL
        AND COALESCE(period_end, report_week_end) < $1
      ORDER BY COALESCE(period_end, report_week_end) DESC
      LIMIT 1
      `,
      [fromDate]
    )
    if (!row) return null

    const payload =
      (row.report_payload as Record<string, unknown> | null | undefined) ?? {}
    const summary =
      (payload.summary as Record<string, unknown> | undefined) ?? {}
    const totalCampaigns =
      (typeof summary.totalCampaigns === 'number' && summary.totalCampaigns) ||
      asInt(row.campaign_count) ||
      0

    let categories: string[] = []
    const bySite = payload.by_site ?? payload.bySite
    if (Array.isArray(bySite)) {
      categories = bySite
        .map((s) => (s as Record<string, unknown>).siteCode)
        .filter((c): c is string => typeof c === 'string' && c.length > 0)
    } else if (typeof row.by_site === 'string') {
      try {
        const parsed = JSON.parse(row.by_site) as Array<Record<string, unknown>>
        if (Array.isArray(parsed)) {
          categories = parsed
            .map((s) => s.siteCode as string | undefined)
            .filter((c): c is string => typeof c === 'string' && c.length > 0)
        }
      } catch {
        categories = []
      }
    }

    const prevDiff =
      (row.diff_metadata as Record<string, unknown> | null | undefined) ?? {}
    const prevDetails =
      (prevDiff.details as Record<string, unknown> | undefined) ?? {}
    const prevAiConfidence =
      typeof prevDetails.currentAiConfidence === 'number'
        ? prevDetails.currentAiConfidence
        : null

    return {
      totalCampaigns,
      categories: Array.from(new Set(categories)),
      aiConfidence: prevAiConfidence,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const sp = Object.fromEntries(new URLSearchParams(request.nextUrl.search))
    const parsed = querySchema.safeParse(sp)
    if (!parsed.success) {
      return errorResponse(
        'VALIDATION_ERROR',
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400
      )
    }
    const { from, to, force } = parsed.data
    if (from > to) {
      return errorResponse('VALIDATION_ERROR', 'from tarihi to tarihinden büyük olamaz', 400)
    }

    const cacheKey = `${from}_${to}`
    const bypass = force === '1' || force === 'true'
    const cached = readCache(cacheKey, bypass)
    if (cached) {
      return successResponse(cached)
    }

    const notes: string[] = []

    // 1) Scrape durumu
    const lastRun = await queryOne<{
      status: string
      started_at: string | Date | null
      completed_at: string | Date | null
    }>(
      `
      SELECT status, started_at, completed_at
      FROM scrape_runs
      ORDER BY started_at DESC
      LIMIT 1
      `
    ).catch(() => null)

    // Scraper tarafı 'success' | 'partial' | 'failed' yazıyor; eski kod
    // bazı yerde 'completed' da kullanıyor. "Çekim tamamlandı mı?" anlamında
    // running ve failed olmayan her şeyi hazır sayıyoruz.
    const READY_STATUSES = new Set(['completed', 'success', 'partial'])
    const dataReady = lastRun ? READY_STATUSES.has(lastRun.status) : false
    const lastScrapeAt = lastRun?.completed_at
      ? lastRun.completed_at instanceof Date
        ? lastRun.completed_at.toISOString()
        : String(lastRun.completed_at)
      : lastRun?.started_at
        ? lastRun.started_at instanceof Date
          ? lastRun.started_at.toISOString()
          : String(lastRun.started_at)
        : null

    if (!lastRun) {
      notes.push('scrape_runs tablosu boş ya da erişilemedi; veri hazırlığı doğrulanamadı.')
    } else if (!dataReady) {
      notes.push(
        `Son scrape run durumu: ${lastRun.status}. Analiz yapılmadı; çekim tamamlanınca tekrar deneyin.`
      )
    }

    // 2) Bu döneme ait weekly_report var mı?
    const existing = await queryOne<{ cnt: string | number }>(
      `
      SELECT COUNT(*) AS cnt
      FROM weekly_reports
      WHERE (
        (COALESCE(period_start, report_week_start) <= $1)
        AND (COALESCE(period_end, report_week_end) >= $2)
      )
      `,
      [to, from]
    ).catch(() => null)
    const hasExistingReport = asInt(existing?.cnt) > 0

    // 3) Early exit: veri hazır değilse analiz üretme
    if (!dataReady) {
      const payload: AutoAnalysisPayload = {
        period: { from, to },
        dataReady: false,
        lastScrapeAt,
        hasExistingReport,
        analysis: null,
        notes,
        diff: null,
        generatedAt: new Date().toISOString(),
      }
      // Bu cevabı cache'e koyMA — kullanıcı 5 dk sonra tekrar denerse scrape
      // tamamlanmış olabilir.
      return successResponse(payload)
    }

    // 4) Metrikleri topla + AI çağrısı
    let metrics: PeriodMetrics
    try {
      metrics = await gatherPeriodMetrics(from, to)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      notes.push(`Metrik toplama hatası: ${reason}`)
      const payload: AutoAnalysisPayload = {
        period: { from, to },
        dataReady,
        lastScrapeAt,
        hasExistingReport,
        analysis: null,
        notes,
        diff: null,
        generatedAt: new Date().toISOString(),
      }
      return successResponse(payload)
    }

    const aiResult = await callDashboardAi(
      [
        {
          role: 'system',
          content:
            'Sen bir spor bahis sektörü rekabet analistisin. Türkçe, profesyonel, akıcı prose yazarsın. Madde işareti kullanmazsın. Sadece istenen JSON formatında cevap verirsin.',
        },
        { role: 'user', content: buildUserPrompt(metrics) },
      ],
      { temperature: 0.3, max_tokens: 1500, response_format: { type: 'json_object' } }
    )

    let analysis: AnalysisSections | null = null
    if (aiResult.status === 'ok') {
      // BE-11: zod validation. On schema failure we log (server-side) and
      // surface a precise reason to the user instead of the prior generic
      // "JSON olarak parse edilemedi" message. No DLQ here — interactive
      // endpoint, no retry queue; the UI's "tekrar dene" button is the
      // human-driven retry path.
      const validation = validateAutoAnalysis(aiResult.content)
      if (validation.ok) {
        analysis = {
          summary: validation.data.summary,
          topMovers: validation.data.topMovers,
          bonusInsights: validation.data.bonusInsights,
          categoryInsights: validation.data.categoryInsights,
          riskFlags: validation.data.riskFlags,
          recommendations: validation.data.recommendations,
          confidence: validation.data.confidence,
        }
      } else {
        // eslint-disable-next-line no-console -- intentional structured log
        console.warn('[auto-analysis] AI schema validation failed', {
          period: { from, to },
          reason: validation.reason,
          issues: validation.issues,
          snippet: validation.raw,
        })
        notes.push(`AI yanıtı şema doğrulamasını geçemedi: ${validation.reason}`)
      }
    } else {
      switch (aiResult.status) {
        case 'ai_unavailable':
          notes.push(`AI çağrısı başarısız: yapılandırma eksik (${aiResult.reason})`)
          break
        case 'ai_paused':
          notes.push(
            `AI çağrısı duraklatıldı: ${aiResult.reason} limit aşıldı (bugün $${aiResult.todayUsd.toFixed(
              2
            )}, bu ay $${aiResult.monthUsd.toFixed(2)}).`
          )
          break
        case 'ai_failed':
          notes.push(`AI çağrısı başarısız: ${aiResult.reason}`)
          break
      }
    }

    // BE-11: diff vs. previous week. Always computed when metrics exist
    // (analysis can be null — diff still tracks volume/category swings).
    const currentSnapshot = snapshotFromMetrics(
      metrics,
      typeof analysis?.confidence === 'number' ? analysis.confidence : null
    )
    const prevSnapshot = await loadPreviousSnapshot(from)
    const diff: DiffResult = prevSnapshot
      ? computeDiff(currentSnapshot, prevSnapshot)
      : emptyDiffResult(currentSnapshot)

    if (diff.hasAnomaly) {
      // eslint-disable-next-line no-console -- intentional structured log
      console.warn('[auto-analysis] Diff flagged anomalies', {
        period: { from, to },
        flags: diff.flags,
        previousTotal: diff.details.previousTotal,
        currentTotal: diff.details.currentTotal,
        totalDeltaRatio: diff.details.totalDeltaRatio,
        addedCategories: diff.details.addedCategories,
        removedCategories: diff.details.removedCategories,
        aiConfidenceDelta: diff.details.aiConfidenceDelta,
      })
    }

    const payload: AutoAnalysisPayload = {
      period: { from, to },
      dataReady,
      lastScrapeAt,
      hasExistingReport,
      analysis,
      notes,
      diff,
      generatedAt: new Date().toISOString(),
    }

    // Sadece başarılı (analysis != null) cevabı cache'le — fallback'leri
    // sürekli cache'lemek istemiyoruz; kullanıcı tekrar denerse yeniden dene.
    if (analysis) {
      writeCache(cacheKey, payload)
    }

    return successResponse(payload)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) })
}
