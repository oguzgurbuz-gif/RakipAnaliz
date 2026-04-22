import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db'
import { successResponse, handleApiError, getCorsHeaders } from '@/lib/response'

/**
 * Win/Loss Tracker — Bitalih'in haftalık sıralama değişimi.
 *
 * Veri kaynağı: ranking_snapshots (migration 021). Scraper her gün 04:00 UTC
 * 4 metric için her site'in (campaign_count, avg_bonus, category_diversity,
 * momentum) o günkü ham değerini ve sıralamasını yazar.
 *
 * Query params:
 *   from, to (YYYY-MM-DD) — opsiyonel; verilmezse "bu hafta vs geçen hafta".
 *   to default = bugün, from default = bugün - 7g, prev = from - 7g (eşit pencere).
 *
 * Response:
 *   - bitalihPosition:
 *       current:  { metric → { rank, value, total } }
 *       previous: { metric → { rank, value, total } }
 *   - wins:      Bitalih'in geçtiği site listesi
 *                [{ siteCode, siteName, metric, oldRank, newRank, byHowMuch }]
 *   - losses:    Bitalih'i geçen site listesi
 *   - bigMovers: Bitalih dışında en çok yer değiştiren site'ler (mutlak delta DESC,
 *                first 5)
 *
 * Snapshot eksikse: o günün en yakın snapshot'ı kullanılır (aynı veya öncesindeki
 * en geç tarih). Hiç snapshot yoksa boş response döner.
 */

const dateRegex = /^\d{4}-\d{2}-\d{2}$/
const querySchema = z.object({
  from: z.string().regex(dateRegex).optional(),
  to: z.string().regex(dateRegex).optional(),
})

const METRICS = [
  'campaign_count',
  'avg_bonus',
  'category_diversity',
  'momentum',
] as const
type Metric = (typeof METRICS)[number]

interface SnapshotRow {
  snapshot_date: string | Date
  site_id: string
  site_code: string
  site_name: string
  metric: Metric
  rank_value: string | number
  rank_position: number
  total_sites: number
}

interface MetricSnapshot {
  rank: number
  value: number
  total: number
}

export interface WinLossEntry {
  siteId: string
  siteCode: string
  siteName: string
  metric: Metric
  oldRank: number
  newRank: number
  byHowMuch: number
}

export interface BigMover {
  siteId: string
  siteCode: string
  siteName: string
  metric: Metric
  oldRank: number
  newRank: number
  delta: number
}

export interface WinLossResponse {
  dateFrom: string
  dateTo: string
  prevDateFrom: string
  prevDateTo: string
  hasData: boolean
  bitalihPosition: {
    current: Partial<Record<Metric, MetricSnapshot>>
    previous: Partial<Record<Metric, MetricSnapshot>>
  }
  wins: WinLossEntry[]
  losses: WinLossEntry[]
  bigMovers: BigMover[]
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function asNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

function toIsoDate(v: string | Date): string {
  if (v instanceof Date) return isoDate(v)
  // MySQL DATE → "2026-04-21" (zaten ISO). Time gelirse sadece tarih kısmı.
  return String(v).slice(0, 10)
}

/**
 * Verilen referans tarih için en yakın anchor günü bulur (o gün veya öncesindeki
 * en geç snapshot tarihi). Snapshot job henüz koşmadıysa veya catch-up tamam
 * değilse, "bu hafta" anchor'ı dünün snapshot'ına düşebilir.
 */
async function findNearestSnapshotDate(referenceDate: string): Promise<string | null> {
  const rows = await query<{ snapshot_date: string | Date }>(
    `SELECT snapshot_date FROM ranking_snapshots
      WHERE snapshot_date <= $1
      ORDER BY snapshot_date DESC
      LIMIT 1`,
    [referenceDate]
  )
  if (rows.length === 0) return null
  return toIsoDate(rows[0].snapshot_date)
}

async function loadSnapshot(snapshotDate: string): Promise<SnapshotRow[]> {
  return query<SnapshotRow>(
    `SELECT rs.snapshot_date, rs.site_id, s.code AS site_code, s.name AS site_name,
            rs.metric, rs.rank_value, rs.rank_position, rs.total_sites
       FROM ranking_snapshots rs
       JOIN sites s ON s.id = rs.site_id
      WHERE rs.snapshot_date = $1`,
    [snapshotDate]
  )
}

/**
 * (siteId, metric) → SnapshotRow lookup. Aynı (date, site, metric)
 * UNIQUE olduğu için collision yok.
 */
function buildIndex(rows: SnapshotRow[]): Map<string, SnapshotRow> {
  const m = new Map<string, SnapshotRow>()
  for (const r of rows) {
    m.set(`${r.site_id}::${r.metric}`, r)
  }
  return m
}

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(new URLSearchParams(request.nextUrl.search))
    const parsed = querySchema.parse(params)

    // Pencere hesabı:
    //   to    = parsed.to    veya bugün
    //   from  = parsed.from  veya to - 7g
    //   prev pencere = aynı uzunlukta from'dan geri (anchor: from - 1g)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    const toDate = parsed.to ? parsed.to : isoDate(today)
    const fromDate = parsed.from
      ? parsed.from
      : isoDate(new Date(Date.parse(toDate) - 7 * 24 * 60 * 60 * 1000))

    const windowMs = Math.max(
      24 * 60 * 60 * 1000,
      Date.parse(toDate) - Date.parse(fromDate)
    )
    const prevToDate = isoDate(new Date(Date.parse(fromDate) - 24 * 60 * 60 * 1000))
    const prevFromDate = isoDate(new Date(Date.parse(prevToDate) - windowMs))

    // Anchor: pencere SONU snapshot'ı = "şu an pozisyonu", pencere ÖNCESI =
    // "geçen hafta pozisyonu". Eksik snapshot'larda en yakın geçmiş güne düşer.
    const currentAnchor = await findNearestSnapshotDate(toDate)
    const previousAnchor = await findNearestSnapshotDate(prevToDate)

    const empty: WinLossResponse = {
      dateFrom: fromDate,
      dateTo: toDate,
      prevDateFrom: prevFromDate,
      prevDateTo: prevToDate,
      hasData: false,
      bitalihPosition: { current: {}, previous: {} },
      wins: [],
      losses: [],
      bigMovers: [],
    }

    if (!currentAnchor || !previousAnchor) {
      return successResponse(empty)
    }

    const [currentRows, previousRows] = await Promise.all([
      loadSnapshot(currentAnchor),
      loadSnapshot(previousAnchor),
    ])

    if (currentRows.length === 0 || previousRows.length === 0) {
      return successResponse(empty)
    }

    const currentIdx = buildIndex(currentRows)
    const previousIdx = buildIndex(previousRows)

    // Bitalih site_id — currentRows'tan code='bitalih'i bul.
    const bitalihRow = currentRows.find((r) => r.site_code === 'bitalih') ??
      previousRows.find((r) => r.site_code === 'bitalih')
    if (!bitalihRow) {
      // Bitalih hiç snapshot'a girmemiş — boş + flag.
      return successResponse(empty)
    }
    const bitalihId = bitalihRow.site_id

    // Bitalih pozisyonu (her metric için).
    const bitalihPosition: WinLossResponse['bitalihPosition'] = {
      current: {},
      previous: {},
    }
    for (const metric of METRICS) {
      const cur = currentIdx.get(`${bitalihId}::${metric}`)
      const prv = previousIdx.get(`${bitalihId}::${metric}`)
      if (cur) {
        bitalihPosition.current[metric] = {
          rank: cur.rank_position,
          value: asNumber(cur.rank_value),
          total: cur.total_sites,
        }
      }
      if (prv) {
        bitalihPosition.previous[metric] = {
          rank: prv.rank_position,
          value: asNumber(prv.rank_value),
          total: prv.total_sites,
        }
      }
    }

    // Wins/Losses — Bitalih'in metric başına geçtiği/yeni geçildiği site'ler.
    const wins: WinLossEntry[] = []
    const losses: WinLossEntry[] = []

    for (const metric of METRICS) {
      const bCur = bitalihPosition.current[metric]
      const bPrv = bitalihPosition.previous[metric]
      if (!bCur || !bPrv) continue

      // Diğer site'ler için aynı metric'te eski/yeni rank.
      const siteIds = new Set<string>()
      for (const r of currentRows) if (r.metric === metric) siteIds.add(r.site_id)
      for (const r of previousRows) if (r.metric === metric) siteIds.add(r.site_id)

      for (const otherId of siteIds) {
        if (otherId === bitalihId) continue
        const oCur = currentIdx.get(`${otherId}::${metric}`)
        const oPrv = previousIdx.get(`${otherId}::${metric}`)
        if (!oCur || !oPrv) continue

        const wasAhead = oPrv.rank_position < bPrv.rank
        const isAhead = oCur.rank_position < bCur.rank

        if (wasAhead && !isAhead) {
          // Other site Bitalih'in önündeydi, artık değil → WIN (Bitalih geçti).
          wins.push({
            siteId: otherId,
            siteCode: oCur.site_code,
            siteName: oCur.site_name,
            metric,
            oldRank: oPrv.rank_position,
            newRank: oCur.rank_position,
            byHowMuch: bPrv.rank - bCur.rank, // Bitalih kaç sıra çıktı
          })
        } else if (!wasAhead && isAhead) {
          // Other site arkadaydı, şimdi öne geçti → LOSS.
          losses.push({
            siteId: otherId,
            siteCode: oCur.site_code,
            siteName: oCur.site_name,
            metric,
            oldRank: oPrv.rank_position,
            newRank: oCur.rank_position,
            byHowMuch: bCur.rank - bPrv.rank, // Bitalih kaç sıra düştü
          })
        }
      }
    }

    // Big movers — Bitalih dışında, herhangi bir metric'te en çok rank
    // değiştiren site'ler. Aynı site farklı metric'lerden çoklu kayıt
    // alabilir; en büyük mutlak delta'ya göre sırala, ilk 5'i tut.
    const movers: BigMover[] = []
    for (const metric of METRICS) {
      const siteIds = new Set<string>()
      for (const r of currentRows) if (r.metric === metric) siteIds.add(r.site_id)

      for (const sid of siteIds) {
        if (sid === bitalihId) continue
        const cur = currentIdx.get(`${sid}::${metric}`)
        const prv = previousIdx.get(`${sid}::${metric}`)
        if (!cur || !prv) continue
        const delta = cur.rank_position - prv.rank_position
        if (delta === 0) continue
        movers.push({
          siteId: sid,
          siteCode: cur.site_code,
          siteName: cur.site_name,
          metric,
          oldRank: prv.rank_position,
          newRank: cur.rank_position,
          delta,
        })
      }
    }
    movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    const bigMovers = movers.slice(0, 5)

    // Wins/losses sırası — en büyük etki önce.
    wins.sort((a, b) => b.byHowMuch - a.byHowMuch)
    losses.sort((a, b) => b.byHowMuch - a.byHowMuch)

    const response: WinLossResponse = {
      dateFrom: currentAnchor,
      dateTo: currentAnchor,
      prevDateFrom: previousAnchor,
      prevDateTo: previousAnchor,
      hasData: true,
      bitalihPosition,
      wins,
      losses,
      bigMovers,
    }

    return successResponse(response)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}
