import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db'
import { successResponse, handleApiError, getCorsHeaders } from '@/lib/response'

/**
 * Wave 1 #1.2 — Hafta-hafta site bazlı kampanya delta'sı.
 *
 * `from`/`to` aralığı "bu hafta" anlamına gelir; aynı süre kadar geriye
 * `to - duration` ↔ `from - 1ms` aralığı "geçen hafta" sayılır. Her site için
 * iki periyot arasındaki active kampanya hacim farkı (mutlak değer azalan
 * sıralı top 10) döner. Component bunu render eder.
 *
 * Edge: from/to verilmezse default son 7 gün vs önceki 7 gün.
 */
const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

type DeltaRow = {
  site_id: string
  site_name: string
  site_code: string
  current_count: string | number | null
  previous_count: string | number | null
}

function asInt(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === 'number' ? value : parseInt(value, 10)
  return Number.isFinite(n) ? n : 0
}

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(new URLSearchParams(request.nextUrl.search))
    const { from, to, limit } = querySchema.parse(params)

    const dateTo = to ? new Date(to) : new Date()
    const dateFrom = from ? new Date(from) : new Date(dateTo.getTime() - 7 * 24 * 60 * 60 * 1000)
    const periodMs = dateTo.getTime() - dateFrom.getTime()
    const prevTo = new Date(dateFrom.getTime() - 1)
    const prevFrom = new Date(prevTo.getTime() - periodMs)

    // Her site için "ilk görülen" kampanya sayısı bu dönem vs önceki dönem.
    // first_seen_at scrape edildikleri ilk anı tutar; valid_from null bile olsa
    // burada her zaman delta hesaplanabilir.
    const rows = await query<DeltaRow>(
      `
      SELECT
        s.id AS site_id,
        s.name AS site_name,
        s.code AS site_code,
        SUM(CASE WHEN c.first_seen_at >= $1 AND c.first_seen_at <= $2 THEN 1 ELSE 0 END) AS current_count,
        SUM(CASE WHEN c.first_seen_at >= $3 AND c.first_seen_at <= $4 THEN 1 ELSE 0 END) AS previous_count
      FROM sites s
      LEFT JOIN campaigns c ON c.site_id = s.id
      WHERE s.is_active = TRUE
      GROUP BY s.id, s.name, s.code
      `,
      [dateFrom, dateTo, prevFrom, prevTo]
    )

    const enriched = rows
      .map((row) => {
        const current = asInt(row.current_count)
        const previous = asInt(row.previous_count)
        const diff = current - previous
        return {
          siteId: row.site_id,
          siteName: row.site_name,
          siteCode: row.site_code,
          current,
          previous,
          diff,
        }
      })
      // En anlamlı değişiklikler önce: |diff| azalan, sonra current azalan
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || b.current - a.current)
      .slice(0, limit ?? 10)

    return successResponse({
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
      prevFrom: prevFrom.toISOString(),
      prevTo: prevTo.toISOString(),
      topChanges: enriched,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}
