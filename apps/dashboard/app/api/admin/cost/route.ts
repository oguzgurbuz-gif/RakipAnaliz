import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db'
import { successResponse, handleApiError, getCorsHeaders } from '@/lib/response'

/**
 * AI cost dashboard.
 *
 * Aggregates token usage from `campaign_ai_analyses` and converts it to USD
 * using DeepSeek pricing. Provider/model breakdown is computed from
 * `model_provider` + `model_name`. Pricing constants are centralized below so
 * we can extend them per-model if other providers are added later.
 */

// USD per 1M tokens. DeepSeek standard tier pricing.
const PRICING_PER_MILLION: Record<string, { input: number; output: number }> = {
  'deepseek:default': { input: 0.14, output: 0.28 },
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
}

const DEFAULT_PRICING = { input: 0.14, output: 0.28 }

function priceFor(modelProvider: string | null, modelName: string | null) {
  const byName = modelName ? PRICING_PER_MILLION[modelName] : undefined
  if (byName) return byName
  if (modelProvider && PRICING_PER_MILLION[`${modelProvider}:default`]) {
    return PRICING_PER_MILLION[`${modelProvider}:default`]
  }
  return DEFAULT_PRICING
}

function cost(inTokens: number, outTokens: number, p: { input: number; output: number }) {
  return (inTokens / 1_000_000) * p.input + (outTokens / 1_000_000) * p.output
}

type DailyRow = {
  day: string
  in_tokens: string | number | null
  out_tokens: string | number | null
  calls: string | number | null
}

type ModelRow = {
  model_provider: string | null
  model_name: string | null
  in_tokens: string | number | null
  out_tokens: string | number | null
  calls: string | number | null
}

type TopAnalysisRow = {
  id: string
  campaign_id: string
  campaign_title: string | null
  model_provider: string | null
  model_name: string | null
  tokens_input: number | null
  tokens_output: number | null
  duration_ms: number | null
  created_at: string
}

function asInt(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === 'number' ? value : parseInt(value, 10)
  return Number.isFinite(n) ? n : 0
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/

const querySchema = z.object({
  // YYYY-MM-DD veya YYYY-MM-DD HH:mm[:ss] kabul ediyoruz; boşluk içeren değerler
  // SQL parametresine girmeden önce normalize edilecek (aşağıda).
  from: z
    .string()
    .trim()
    .refine((v) => ISO_DATE_RE.test(v) || ISO_DATETIME_RE.test(v), 'invalid from')
    .optional(),
  to: z
    .string()
    .trim()
    .refine((v) => ISO_DATE_RE.test(v) || ISO_DATETIME_RE.test(v), 'invalid to')
    .optional(),
})

/**
 * `from`/`to` parametrelerini MySQL DATETIME formatına dönüştürür.
 * - YYYY-MM-DD geldi ise: from → "YYYY-MM-DD 00:00:00", to → "YYYY-MM-DD 23:59:59".
 * - YYYY-MM-DD HH:mm[:ss] geldi ise: olduğu gibi (eksik saniye → ":00" eklenir).
 * "T" ayracı varsa boşluğa çevirir.
 *
 * NOT: Trim ettikten sonra boşluk barındırmasına dikkat — `trim()` + zod
 * doğrulaması girdi sınırında temizliyor; tekrar concat ettikten sonra
 * pattern'e uygun tek bir boşluk olduğundan emin oluyoruz.
 */
function normalizeBoundary(value: string, isEnd: boolean): string {
  const v = value.trim().replace('T', ' ')
  if (ISO_DATE_RE.test(v)) {
    return isEnd ? `${v} 23:59:59` : `${v} 00:00:00`
  }
  // datetime: saniye eksikse ekle.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) {
    return `${v}:00`
  }
  return v
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(new URLSearchParams(request.nextUrl.search))
    const { from, to } = querySchema.parse(searchParams)

    const params: unknown[] = []
    let whereClause: string

    if (from && to) {
      const fromBound = normalizeBoundary(from, false)
      const toBound = normalizeBoundary(to, true)
      whereClause = 'WHERE created_at >= $1 AND created_at <= $2'
      params.push(fromBound, toBound)
    } else if (from) {
      whereClause = 'WHERE created_at >= $1'
      params.push(normalizeBoundary(from, false))
    } else if (to) {
      whereClause = 'WHERE created_at <= $1'
      params.push(normalizeBoundary(to, true))
    } else {
      // Default: son 30 gün (parametresiz mevcut davranışı koru).
      whereClause = 'WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
    }

    const dailyRows = await query<DailyRow>(
      `
      SELECT
        DATE(created_at) AS day,
        SUM(COALESCE(tokens_input, 0)) AS in_tokens,
        SUM(COALESCE(tokens_output, 0)) AS out_tokens,
        COUNT(*) AS calls
      FROM campaign_ai_analyses
      ${whereClause}
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `,
      params
    )

    const modelRows = await query<ModelRow>(
      `
      SELECT
        model_provider,
        model_name,
        SUM(COALESCE(tokens_input, 0)) AS in_tokens,
        SUM(COALESCE(tokens_output, 0)) AS out_tokens,
        COUNT(*) AS calls
      FROM campaign_ai_analyses
      ${whereClause}
      GROUP BY model_provider, model_name
      ORDER BY SUM(COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0)) DESC
    `,
      params
    )

    // Top analyses sorgusunda alias `a.created_at` kullanıyoruz → whereClause
    // alias'sız `created_at` içerdiğinden burada `a.` prefix'li versiyonu
    // tekrar üretiyoruz. (Top sorgusu JOIN içeriyor, ambiguity riski var.)
    const topWhereClause = whereClause.replace(/created_at/g, 'a.created_at')
    const topRows = await query<TopAnalysisRow>(
      `
      SELECT
        a.id,
        a.campaign_id,
        c.title AS campaign_title,
        a.model_provider,
        a.model_name,
        a.tokens_input,
        a.tokens_output,
        a.duration_ms,
        a.created_at
      FROM campaign_ai_analyses a
      LEFT JOIN campaigns c ON c.id = a.campaign_id
      ${topWhereClause}
      ORDER BY (COALESCE(a.tokens_input, 0) + COALESCE(a.tokens_output, 0)) DESC
      LIMIT 10
    `,
      params
    )

    const daily = dailyRows.map((row) => {
      const inTokens = asInt(row.in_tokens)
      const outTokens = asInt(row.out_tokens)
      // Daily totals can mix models; use default DeepSeek pricing for chart simplicity.
      const usd = cost(inTokens, outTokens, DEFAULT_PRICING)
      const dayValue = typeof row.day === 'string'
        ? row.day.slice(0, 10)
        : new Date(row.day as unknown as string).toISOString().slice(0, 10)
      return {
        day: dayValue,
        inTokens,
        outTokens,
        calls: asInt(row.calls),
        usd: Number(usd.toFixed(6)),
      }
    })

    const byModel = modelRows.map((row) => {
      const inTokens = asInt(row.in_tokens)
      const outTokens = asInt(row.out_tokens)
      const p = priceFor(row.model_provider, row.model_name)
      const usd = cost(inTokens, outTokens, p)
      return {
        modelProvider: row.model_provider ?? 'unknown',
        modelName: row.model_name ?? 'unknown',
        inTokens,
        outTokens,
        calls: asInt(row.calls),
        usd: Number(usd.toFixed(6)),
        pricePerMillionInput: p.input,
        pricePerMillionOutput: p.output,
      }
    })

    const topAnalyses = topRows.map((row) => {
      const inTokens = row.tokens_input ?? 0
      const outTokens = row.tokens_output ?? 0
      const p = priceFor(row.model_provider, row.model_name)
      return {
        id: row.id,
        campaignId: row.campaign_id,
        campaignTitle: row.campaign_title,
        modelProvider: row.model_provider ?? 'unknown',
        modelName: row.model_name ?? 'unknown',
        inTokens,
        outTokens,
        durationMs: row.duration_ms,
        createdAt: row.created_at,
        usd: Number(cost(inTokens, outTokens, p).toFixed(6)),
      }
    })

    const totals = daily.reduce(
      (acc, row) => {
        acc.inTokens += row.inTokens
        acc.outTokens += row.outTokens
        acc.calls += row.calls
        acc.usd += row.usd
        return acc
      },
      { inTokens: 0, outTokens: 0, calls: 0, usd: 0 }
    )

    // Geriye dönük uyumluluk: parametresiz çağrı 30 günlük pencere döndürüyor;
    // diğer durumda from/to gün farkı (toplam dahil).
    let windowDays = 30
    if (from || to) {
      const f = from ? normalizeBoundary(from, false).slice(0, 10) : null
      const t = to ? normalizeBoundary(to, true).slice(0, 10) : null
      if (f && t) {
        const diffMs = new Date(`${t}T00:00:00Z`).getTime() - new Date(`${f}T00:00:00Z`).getTime()
        windowDays = Math.max(1, Math.round(diffMs / (24 * 60 * 60 * 1000)) + 1)
      }
    }

    return successResponse({
      windowDays,
      from: from ? normalizeBoundary(from, false) : null,
      to: to ? normalizeBoundary(to, true) : null,
      pricing: {
        defaultInputPerMillionUSD: DEFAULT_PRICING.input,
        defaultOutputPerMillionUSD: DEFAULT_PRICING.output,
        models: PRICING_PER_MILLION,
      },
      totals: {
        inTokens: totals.inTokens,
        outTokens: totals.outTokens,
        calls: totals.calls,
        usd: Number(totals.usd.toFixed(4)),
      },
      daily,
      byModel,
      topAnalyses,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}
