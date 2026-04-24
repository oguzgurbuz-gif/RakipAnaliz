import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db'
import { successResponse, handleApiError, getCorsHeaders } from '@/lib/response'

/**
 * Bonus Index — pazar genelinde bonus enflasyonu tablosu.
 *
 * Query params:
 *   from, to (YYYY-MM-DD) — opsiyonel; verilmezse son 30g.
 *   category               — opsiyonel; tek kategoriye filtre.
 *
 * Response:
 *   - kpi: { todayMedian, todayP90, outlierCount }
 *   - perCategory: [{ category, median, p90, sampleSize, outlierCount, sparkline: [{week, median}] }]
 *   - weeklyAll: [{ week, perCategory: { [cat]: median } }]   son 8 hafta
 *   - topOutliers: [{ campaignId, title, siteName, siteCode, category, bonusAmount }]
 *
 * Median/P90 SQL'de değil JS'te hesaplanır; MySQL 8'de PERCENTILE_CONT yok ve
 * dataset haftalık/kategori bazlı küçük olduğu için kabul edilebilir.
 */

const dateRegex = /^\d{4}-\d{2}-\d{2}$/
const querySchema = z.object({
  from: z.string().regex(dateRegex).optional(),
  to: z.string().regex(dateRegex).optional(),
  category: z.string().min(1).optional(),
  compareYoY: z.enum(['0', '1']).optional(),
})

const categoryExpr = `COALESCE(
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.category')), ''),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.campaign_type')), '')
)`

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

function asFloat(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function percentile(values: number[], p: number): number {
  const sorted = values.slice().sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const rank = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return sorted[lo]
  const frac = rank - lo
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac
}

/**
 * `2026-04-21` Tuesday → "Pazartesi başlangıçlı hafta" YYYY-Www etiketi.
 * Local timezone'da hesaplanır (DB UTC değerinden).
 */
function weekOf(date: Date): string {
  const day = date.getUTCDay()
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(date)
  monday.setUTCDate(date.getUTCDate() - diff)
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`
}

interface Row {
  campaignId: string
  title: string
  siteName: string
  siteCode: string
  category: string
  bonus: number
  firstSeen: Date
}

interface CategorySummary {
  category: string
  median: number
  p90: number
  outlierCount: number
  totalBonusVolume: number
}

interface WindowAggregate {
  median: number
  p90: number
  outlierCount: number
  sampleSize: number
  perCategory: Record<
    string,
    { median: number; p90: number; outlierCount: number; totalBonusVolume: number }
  >
}

async function fetchRows(dateFrom: Date, dateTo: Date, category?: string): Promise<Row[]> {
  const conditions: string[] = []
  const sqlParams: unknown[] = []
  sqlParams.push(dateFrom)
  conditions.push(`c.first_seen_at >= $${sqlParams.length}`)
  sqlParams.push(dateTo)
  conditions.push(`c.first_seen_at <= $${sqlParams.length}`)
  if (category) {
    sqlParams.push(category)
    conditions.push(`${categoryExpr} = $${sqlParams.length}`)
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`

  const rows = await query<{
    campaign_id: string
    title: string
    site_name: string
    site_code: string
    category: string | null
    bonus: string | number | null
    first_seen_at: string | Date
  }>(
    `
      SELECT
        c.id AS campaign_id,
        c.title,
        s.name AS site_name,
        s.code AS site_code,
        ${categoryExpr} AS category,
        ${effectiveBonusExpr} AS bonus,
        c.first_seen_at
      FROM campaigns c
      JOIN sites s ON s.id = c.site_id
      ${whereClause}
      `,
    sqlParams
  )

  return rows
    .map((r) => {
      const seen = r.first_seen_at instanceof Date ? r.first_seen_at : new Date(r.first_seen_at)
      return {
        campaignId: r.campaign_id,
        title: r.title,
        siteName: r.site_name,
        siteCode: r.site_code,
        category: r.category || '',
        bonus: asFloat(r.bonus),
        firstSeen: seen,
      }
    })
    .filter((r) => r.bonus > 0 && r.category && !Number.isNaN(r.firstSeen.getTime()))
}

function aggregateWindow(rows: Row[]): WindowAggregate {
  const allBonus = rows.map((r) => r.bonus)
  const m = median(allBonus)
  const p90 = percentile(allBonus, 90)
  const outlierThreshold = p90 * 1.5
  const outlierCount = allBonus.filter((b) => b > outlierThreshold).length

  const byCategory = new Map<string, Row[]>()
  for (const row of rows) {
    const list = byCategory.get(row.category) || []
    list.push(row)
    byCategory.set(row.category, list)
  }

  const perCategory: WindowAggregate['perCategory'] = {}
  for (const [cat, rs] of byCategory.entries()) {
    const bonuses = rs.map((r) => r.bonus)
    const catMedian = median(bonuses)
    const catP90 = percentile(bonuses, 90)
    const localOutlier = catP90 * 1.5
    const catOutlierCount = bonuses.filter((b) => b > localOutlier).length
    const totalVolume = bonuses.reduce((acc, b) => acc + b, 0)
    perCategory[cat] = {
      median: Math.round(catMedian),
      p90: Math.round(catP90),
      outlierCount: catOutlierCount,
      totalBonusVolume: Math.round(totalVolume),
    }
  }

  return {
    median: Math.round(m),
    p90: Math.round(p90),
    outlierCount,
    sampleSize: rows.length,
    perCategory,
  }
}

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(new URLSearchParams(request.nextUrl.search))
    const parsed = querySchema.parse(params)

    const dateTo = parsed.to ? new Date(`${parsed.to}T23:59:59Z`) : new Date()
    const dateFrom = parsed.from
      ? new Date(`${parsed.from}T00:00:00Z`)
      : new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Sparkline için son 8 hafta (date range'den bağımsız, her zaman bugünden geriye)
    const eightWeeksAgo = new Date()
    eightWeeksAgo.setUTCDate(eightWeeksAgo.getUTCDate() - 7 * 8)

    // Tüm veri (sparkline + range) — eightWeeksAgo'dan dateTo'ya kadar
    const minDate = dateFrom < eightWeeksAgo ? dateFrom : eightWeeksAgo
    const allRows = await fetchRows(minDate, dateTo, parsed.category)

    // ----- Range içindeki rows -----
    const inRange = allRows.filter(
      (r) => r.firstSeen >= dateFrom && r.firstSeen <= dateTo
    )

    const windowAgg = aggregateWindow(inRange)
    const todayMedian = windowAgg.median
    const todayP90 = windowAgg.p90
    const outlierCount = windowAgg.outlierCount

    // ----- Per kategori (range içindeki) -----
    const byCategory = new Map<string, Row[]>()
    for (const row of inRange) {
      const list = byCategory.get(row.category) || []
      list.push(row)
      byCategory.set(row.category, list)
    }

    // ----- Sparkline data (son 8 hafta) — kategori başına haftalık median -----
    interface WeeklyBucket {
      [category: string]: { [week: string]: number[] }
    }
    const weekly: WeeklyBucket = {}
    const weeksSet = new Set<string>()

    // Son 8 hafta etiketlerini oluştur (kronolojik)
    const weekLabels: string[] = []
    for (let i = 7; i >= 0; i--) {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - i * 7)
      const w = weekOf(d)
      weekLabels.push(w)
      weeksSet.add(w)
    }

    for (const row of allRows) {
      if (row.firstSeen < eightWeeksAgo) continue
      const w = weekOf(row.firstSeen)
      if (!weeksSet.has(w)) continue
      if (!weekly[row.category]) weekly[row.category] = {}
      if (!weekly[row.category][w]) weekly[row.category][w] = []
      weekly[row.category][w].push(row.bonus)
    }

    const perCategory = Array.from(byCategory.entries())
      .map(([category, rs]) => {
        const bonuses = rs.map((r) => r.bonus)
        const m = median(bonuses)
        const p90 = percentile(bonuses, 90)
        const localOutlier = p90 * 1.5
        const catOutlierCount = bonuses.filter((b) => b > localOutlier).length
        const sparkline = weekLabels.map((w) => ({
          week: w,
          median: weekly[category]?.[w]
            ? Math.round(median(weekly[category][w]))
            : 0,
        }))
        return {
          category,
          median: Math.round(m),
          p90: Math.round(p90),
          sampleSize: rs.length,
          outlierCount: catOutlierCount,
          sparkline,
        }
      })
      .sort((a, b) => b.median - a.median)

    // Tüm kategoriler için weeklyAll (line chart için flat)
    const weeklyAll = weekLabels.map((w) => {
      const point: { week: string; [k: string]: number | string } = { week: w }
      for (const cat of byCategory.keys()) {
        const arr = weekly[cat]?.[w]
        point[cat] = arr ? Math.round(median(arr)) : 0
      }
      return point
    })

    // ----- categoryBreakdown — totalBonusVolume dahil, median desc -----
    const categoryBreakdown: CategorySummary[] = Array.from(byCategory.entries())
      .map(([category, rs]) => {
        const bonuses = rs.map((r) => r.bonus)
        const m = median(bonuses)
        const p90 = percentile(bonuses, 90)
        const localOutlier = p90 * 1.5
        const catOutlierCount = bonuses.filter((b) => b > localOutlier).length
        const totalVolume = bonuses.reduce((acc, b) => acc + b, 0)
        return {
          category,
          median: Math.round(m),
          p90: Math.round(p90),
          outlierCount: catOutlierCount,
          totalBonusVolume: Math.round(totalVolume),
        }
      })
      .sort((a, b) => b.median - a.median)

    // ----- Top outliers (P90'ı global olarak kıran top 5) -----
    const topOutliers = inRange
      .filter((r) => r.bonus > todayP90 && todayP90 > 0)
      .sort((a, b) => b.bonus - a.bonus)
      .slice(0, 5)
      .map((r) => ({
        campaignId: r.campaignId,
        title: r.title,
        siteName: r.siteName,
        siteCode: r.siteCode,
        category: r.category,
        bonusAmount: Math.round(r.bonus),
      }))

    // ----- YoY (opsiyonel) — 52 hafta öncesi aynı pencere -----
    let yoy: {
      dateFrom: string
      dateTo: string
      median: number
      p90: number
      outlierCount: number
      sampleSize: number
      perCategory: Record<
        string,
        { median: number; p90: number; outlierCount: number; totalBonusVolume: number }
      >
    } | null = null

    if (parsed.compareYoY === '1') {
      const weekMs = 7 * 24 * 60 * 60 * 1000
      const yoyFrom = new Date(dateFrom.getTime() - 52 * weekMs)
      const yoyTo = new Date(dateTo.getTime() - 52 * weekMs)

      const yoyRows = await fetchRows(yoyFrom, yoyTo, parsed.category)
      if (yoyRows.length > 0) {
        const yoyAgg = aggregateWindow(yoyRows)
        yoy = {
          dateFrom: yoyFrom.toISOString().slice(0, 10),
          dateTo: yoyTo.toISOString().slice(0, 10),
          median: yoyAgg.median,
          p90: yoyAgg.p90,
          outlierCount: yoyAgg.outlierCount,
          sampleSize: yoyAgg.sampleSize,
          perCategory: yoyAgg.perCategory,
        }
      }
    }

    return successResponse({
      dateFrom: dateFrom.toISOString().slice(0, 10),
      dateTo: dateTo.toISOString().slice(0, 10),
      categoryFilter: parsed.category ?? null,
      kpi: {
        todayMedian: Math.round(todayMedian),
        todayP90: Math.round(todayP90),
        outlierCount,
        sampleSize: inRange.length,
      },
      perCategory,
      weeklyAll,
      categories: Array.from(byCategory.keys()).sort(),
      topOutliers,
      categoryBreakdown,
      yoy,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) })
}
