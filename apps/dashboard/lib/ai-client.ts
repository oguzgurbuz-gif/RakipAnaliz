/**
 * Dashboard tarafı DeepSeek mini-client.
 *
 * Scraper'daki `apps/scraper/src/ai/client.ts` ile aynı protokole konuşur,
 * ama kendi cost-guard kontrolünü yapar (dashboard process scraper helper'ını
 * import edemez — ayrı runtime). Çağıran tipik olarak `weekly-brief` gibi
 * "hafif" 1/saat çağrılarda kullanır.
 *
 * Davranış:
 * - DEEPSEEK_API_KEY yoksa `ai_unavailable` döner (kart UI "AI özeti şu an
 *   mevcut değil" gösterir).
 * - `ai_cost_limits` (Wave 1 #1.6) eşiği aşılmışsa `ai_paused` döner.
 * - Network/HTTP hatasında `ai_failed` döner; brief endpoint'i hata fırlatmaz,
 *   bu yüzden dashboard kırılmaz.
 */
import { query, queryOne } from '@/lib/db'

export type DashboardAiResult =
  | { status: 'ok'; content: string; tokensInput: number; tokensOutput: number }
  | { status: 'ai_unavailable'; reason: string }
  | { status: 'ai_paused'; reason: 'daily' | 'monthly'; todayUsd: number; monthUsd: number }
  | { status: 'ai_failed'; reason: string }

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatOptions {
  temperature?: number
  max_tokens?: number
  response_format?: { type: 'json_object' | 'text' }
}

const DEFAULT_INPUT_PER_MILLION = 0.14
const DEFAULT_OUTPUT_PER_MILLION = 0.28
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
}

function priceFor(modelName: string | null): { input: number; output: number } {
  if (modelName && MODEL_PRICING[modelName]) return MODEL_PRICING[modelName]
  return { input: DEFAULT_INPUT_PER_MILLION, output: DEFAULT_OUTPUT_PER_MILLION }
}

function asNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

interface CostLimitsRow {
  daily_limit_usd: string | number
  monthly_limit_usd: string | number
  pause_on_breach: number
}

interface SpendRow {
  model_name: string | null
  in_tokens: string | number | null
  out_tokens: string | number | null
}

async function totalSpendUsdSince(sinceIso: string): Promise<number> {
  const rows = await query<SpendRow>(
    `SELECT model_name,
            SUM(COALESCE(tokens_input, 0)) AS in_tokens,
            SUM(COALESCE(tokens_output, 0)) AS out_tokens
       FROM campaign_ai_analyses
      WHERE created_at >= $1
      GROUP BY model_name`,
    [sinceIso]
  )
  let usd = 0
  for (const row of rows) {
    const inTok = asNumber(row.in_tokens)
    const outTok = asNumber(row.out_tokens)
    const p = priceFor(row.model_name)
    usd += (inTok / 1_000_000) * p.input + (outTok / 1_000_000) * p.output
  }
  return usd
}

async function checkBudget(): Promise<
  | { paused: false; todayUsd: number; monthUsd: number }
  | { paused: true; reason: 'daily' | 'monthly'; todayUsd: number; monthUsd: number }
> {
  let limits: CostLimitsRow | null = null
  try {
    limits = await queryOne<CostLimitsRow>(
      `SELECT daily_limit_usd, monthly_limit_usd, pause_on_breach
         FROM ai_cost_limits WHERE id = 1`
    )
  } catch {
    // Tablo yoksa silently allow.
    return { paused: false, todayUsd: 0, monthUsd: 0 }
  }

  const dailyLimit = limits ? asNumber(limits.daily_limit_usd) : 0
  const monthlyLimit = limits ? asNumber(limits.monthly_limit_usd) : 0
  const pauseOnBreach = limits ? Boolean(limits.pause_on_breach) : false

  const now = new Date()
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate()
    ).padStart(2, '0')} 00:00:00`

  const [todayUsd, monthUsd] = await Promise.all([
    totalSpendUsdSince(fmt(todayStart)),
    totalSpendUsdSince(fmt(monthStart)),
  ])

  const dailyBreached = dailyLimit > 0 && todayUsd >= dailyLimit
  const monthlyBreached = monthlyLimit > 0 && monthUsd >= monthlyLimit

  if (pauseOnBreach && (dailyBreached || monthlyBreached)) {
    return {
      paused: true,
      reason: dailyBreached ? 'daily' : 'monthly',
      todayUsd,
      monthUsd,
    }
  }
  return { paused: false, todayUsd, monthUsd }
}

/**
 * DeepSeek'i (text response) çağırır. Hata durumunda exception fırlatmaz —
 * caller `result.status` ile karar verir.
 */
export async function callDashboardAi(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<DashboardAiResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const apiUrl =
    process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions'
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

  if (!apiKey) {
    return { status: 'ai_unavailable', reason: 'DEEPSEEK_API_KEY not configured' }
  }

  // Cost guard
  try {
    const budget = await checkBudget()
    if (budget.paused) {
      return {
        status: 'ai_paused',
        reason: budget.reason,
        todayUsd: budget.todayUsd,
        monthUsd: budget.monthUsd,
      }
    }
  } catch {
    // Cost guard sorgusu başarısız olursa AI çağrısına izin ver — sessizce
    // devam et, ama console'a yaz.
    console.warn('[ai-client] cost guard query failed; proceeding without limit check')
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? 0.3,
    response_format: options.response_format ?? { type: 'text' },
  }
  if (options.max_tokens) body.max_tokens = options.max_tokens

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { status: 'ai_failed', reason: `HTTP ${res.status}: ${errText.slice(0, 200)}` }
    }

    const json: any = await res.json()
    const content: string | undefined = json?.choices?.[0]?.message?.content
    if (!content) {
      return { status: 'ai_failed', reason: 'No content in DeepSeek response' }
    }
    return {
      status: 'ok',
      content,
      tokensInput: Number(json?.usage?.prompt_tokens ?? 0),
      tokensOutput: Number(json?.usage?.completion_tokens ?? 0),
    }
  } catch (err) {
    return {
      status: 'ai_failed',
      reason: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
