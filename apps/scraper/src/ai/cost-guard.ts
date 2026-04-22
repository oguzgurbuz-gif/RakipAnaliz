import { query, queryOne } from '../db';
import { logger } from '../utils/logger';

/**
 * Wave 1 #1.6 — DeepSeek cost circuit breaker.
 *
 * `checkCostLimit()` günlük/aylık tahmini USD harcamasını
 * `campaign_ai_analyses.tokens_input` + `tokens_output` üzerinden hesaplar
 * ve `ai_cost_limits` tablosundaki eşiklerle karşılaştırır.
 *
 * Geri dönüş:
 *   { paused: false } → güvenli, AI çağrısı yapılabilir
 *   { paused: true }  → limit aşıldı; pause_on_breach=true ise çağıran skip
 *                       etmeli
 *
 * `pause_on_breach=false` ise `paused: false` döner ama log'da uyarı düşer.
 *
 * NOT: Migration #016 henüz uygulanmadıysa fonksiyon güvenli tarafta kalır
 * ve `{ paused: false }` döner (silently no-op). Production'da migration
 * boot'ta uygulandığı için bu durum sadece eski snapshot'ta görülür.
 */

// Default DeepSeek pricing (USD per 1M token). Dashboard tarafıyla aynı sabit.
const DEFAULT_INPUT_PER_MILLION = 0.14;
const DEFAULT_OUTPUT_PER_MILLION = 0.28;

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
};

interface AiCostLimitsRow {
  daily_limit_usd: string | number;
  monthly_limit_usd: string | number;
  pause_on_breach: number;
}

interface SpendRow {
  total_in: string | number | null;
  total_out: string | number | null;
}

interface CostGuardResult {
  paused: boolean;
  reason?: 'daily' | 'monthly';
  todayUsd: number;
  monthUsd: number;
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
}

function asNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function priceFor(modelName: string | null): { input: number; output: number } {
  if (modelName && MODEL_PRICING[modelName]) return MODEL_PRICING[modelName];
  return { input: DEFAULT_INPUT_PER_MILLION, output: DEFAULT_OUTPUT_PER_MILLION };
}

/**
 * Belirli bir aralıktaki toplam USD harcamasını model bazında hesaplar
 * (model_name'e göre fiyatlama). MySQL'de aggregate burada yapıyoruz çünkü
 * pricing JS tarafında.
 */
async function totalSpendUsdSince(sinceIso: string): Promise<number> {
  type ModelSpend = { model_name: string | null; in_tokens: string | number | null; out_tokens: string | number | null };
  const rows = await query<ModelSpend>(
    `SELECT model_name,
            SUM(COALESCE(tokens_input, 0)) AS in_tokens,
            SUM(COALESCE(tokens_output, 0)) AS out_tokens
       FROM campaign_ai_analyses
      WHERE created_at >= $1
      GROUP BY model_name`,
    [sinceIso]
  );

  let usd = 0;
  for (const row of rows) {
    const inTok = asNumber(row.in_tokens);
    const outTok = asNumber(row.out_tokens);
    const p = priceFor(row.model_name);
    usd += (inTok / 1_000_000) * p.input + (outTok / 1_000_000) * p.output;
  }
  return usd;
}

let warnedMissingTable = false;

export async function checkCostLimit(): Promise<CostGuardResult> {
  let limits: AiCostLimitsRow | null = null;
  try {
    limits = await queryOne<AiCostLimitsRow>(
      `SELECT daily_limit_usd, monthly_limit_usd, pause_on_breach
         FROM ai_cost_limits
        WHERE id = 1`
    );
  } catch (err) {
    // Migration uygulanmadıysa veya tablo yoksa: silently allow.
    if (!warnedMissingTable) {
      warnedMissingTable = true;
      logger.warn('ai_cost_limits tablosu bulunamadı; cost guard devre dışı', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return {
      paused: false,
      todayUsd: 0,
      monthUsd: 0,
      dailyLimitUsd: 0,
      monthlyLimitUsd: 0,
    };
  }

  const dailyLimit = limits ? asNumber(limits.daily_limit_usd) : 0;
  const monthlyLimit = limits ? asNumber(limits.monthly_limit_usd) : 0;
  const pauseOnBreach = limits ? Boolean(limits.pause_on_breach) : false;

  // YYYY-MM-DD 00:00:00 UTC
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} 00:00:00`;

  const [todayUsd, monthUsd] = await Promise.all([
    totalSpendUsdSince(fmt(todayStart)),
    totalSpendUsdSince(fmt(monthStart)),
  ]);

  const dailyBreached = dailyLimit > 0 && todayUsd >= dailyLimit;
  const monthlyBreached = monthlyLimit > 0 && monthUsd >= monthlyLimit;

  if (dailyBreached || monthlyBreached) {
    const reason: 'daily' | 'monthly' = dailyBreached ? 'daily' : 'monthly';
    const message =
      reason === 'daily'
        ? `AI günlük limit aşıldı: $${todayUsd.toFixed(4)} / $${dailyLimit.toFixed(2)}`
        : `AI aylık limit aşıldı: $${monthUsd.toFixed(4)} / $${monthlyLimit.toFixed(2)}`;

    if (pauseOnBreach) {
      logger.warn(message, { reason, todayUsd, monthUsd, dailyLimit, monthlyLimit });
      // Best-effort admin_logs entry; başarısız olursa sessizce geç.
      try {
        await query(
          `INSERT INTO admin_logs (actor, action, resource_type, resource_id, changes)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            'system:cost-guard',
            'ai_cost_breach',
            'ai_cost_limits',
            '1',
            JSON.stringify({ reason, todayUsd, monthUsd, dailyLimit, monthlyLimit }),
          ]
        );
      } catch {
        /* admin_logs yoksa yut */
      }
      return {
        paused: true,
        reason,
        todayUsd,
        monthUsd,
        dailyLimitUsd: dailyLimit,
        monthlyLimitUsd: monthlyLimit,
      };
    } else {
      logger.warn(`${message} (pause_on_breach kapalı; AI çağrısına izin veriliyor)`);
    }
  }

  return {
    paused: false,
    todayUsd,
    monthUsd,
    dailyLimitUsd: dailyLimit,
    monthlyLimitUsd: monthlyLimit,
  };
}

/**
 * AI client tarafından callDeepSeek başında çağırılır. Limit aşıldıysa
 * `CostLimitExceededError` fırlatır; çağıran try/catch ile yakalayıp skip
 * etmelidir (ai-analysis-batch, content-analysis vs).
 */
export class CostLimitExceededError extends Error {
  constructor(
    public readonly result: CostGuardResult
  ) {
    const reason = result.reason ?? 'unknown';
    super(
      `AI cost limit exceeded (${reason}): today=$${result.todayUsd.toFixed(4)} ` +
        `month=$${result.monthUsd.toFixed(4)}; daily=$${result.dailyLimitUsd.toFixed(2)} ` +
        `monthly=$${result.monthlyLimitUsd.toFixed(2)}`
    );
    this.name = 'CostLimitExceededError';
  }
}

export async function ensureCostBudget(): Promise<void> {
  const result = await checkCostLimit();
  if (result.paused) {
    throw new CostLimitExceededError(result);
  }
}
