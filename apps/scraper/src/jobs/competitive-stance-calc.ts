import { logger } from '../utils/logger';
import { getDb } from '../db';

/**
 * Result aggregate of a single stance recalculation pass. Returned to the
 * caller (and surfaced in logs) so dashboards / smoke tests can verify the
 * AGGRESSIVE / NEUTRAL / DEFENSIVE distribution after each run.
 */
export interface CompetitiveStanceCalcResult {
  sitesUpdated: number;
  stanceCounts: {
    aggressive: number;
    neutral: number;
    defensive: number;
    unknown: number;
  };
  /** Sites whose stance label transitioned vs the previous snapshot. */
  transitions: Array<{
    code: string;
    from: SiteStance;
    to: SiteStance;
    velocityDelta: number;
    score: number;
  }>;
  durationMs: number;
}

type SiteStance = 'aggressive' | 'neutral' | 'defensive' | 'unknown';

interface SiteStanceSnapshot extends Record<string, unknown> {
  id: string;
  code: string;
  stance: SiteStance;
  stance_score: number | null;
  stance_velocity_delta: number;
}

/**
 * One-row velocity / bonus aggregate computed per site for the rolling
 * last-7d vs last-4w windows.
 */
interface SiteVelocityRow extends Record<string, unknown> {
  id: string;
  code: string;
  last_7d_count: number;
  last_28d_count: number;
  avg_bonus_7d: number | null;
  avg_bonus_28d: number | null;
}

/**
 * Velocity delta thresholds. >+2 yeni kampanya / hafta = AGGRESSIVE,
 * <-2 = DEFENSIVE; aksi NEUTRAL. 7g penceresinin dışında daha hassas
 * (ör. >0.5) kullanmak yanlış pozitiflere yol açıyordu.
 */
const AGGRESSIVE_THRESHOLD = 2;
const DEFENSIVE_THRESHOLD = -2;

/**
 * Bonus enflasyonu kapısı: avg_bonus_7d / avg_bonus_28d - 1 > BONUS_DELTA_BOOST
 * AGGRESSIVE'i güçlendirmek için stance_score üzerine bir bonus puan ekler.
 */
const BONUS_DELTA_BOOST = 0.2;

/**
 * Mevcut momentum-recalc pattern'inin birebir kuzeni: önce snapshot al,
 * sonra tek SQL ile sites tablosunun stance kolonlarını güncelle, sonra diff
 * için tekrar oku. UI badge'i bu kolonlardan beslenir.
 */
export async function processCompetitiveStanceCalcJob(
  _payload: Record<string, unknown> = {}
): Promise<CompetitiveStanceCalcResult> {
  const startTime = Date.now();
  const db = getDb();

  logger.info('Competitive stance calculation started');

  // Snapshot BEFORE so we can diff transitions for log breadcrumbs.
  const beforeRes = await db.query<SiteStanceSnapshot>(
    `SELECT id, code, stance, stance_score, stance_velocity_delta
       FROM sites`
  );
  const beforeMap = new Map<string, SiteStanceSnapshot>();
  for (const row of beforeRes.rows) {
    beforeMap.set(String(row.id), {
      ...row,
      stance_score:
        row.stance_score == null ? null : Number(row.stance_score),
      stance_velocity_delta: Number(row.stance_velocity_delta),
    });
  }

  // Velocity + bonus aggregates per site. Bonus value extraction mirrors the
  // /api/competition CTE — bonus_amount (direct) öncelikli, yoksa max_bonus
  // fallback'ı. Daha karmaşık (freebet / percentage * min_deposit) hesabı
  // yapmıyoruz çünkü bu job sadece 7g vs 28g ortalama trend'ini görmek
  // için — relative değişim mutlak doğruluktan önce gelir.
  //
  // Korelasyonlu derived tablo MySQL'in optimizer_switch'ine bağlı kalmasın
  // diye AVG'i conditional CASE içinde inline ediyoruz; her satır site_id'ye
  // göre filtrelenir. AVG NULL'ları görmezden gelir, dolayısıyla effective
  // bonus alınamayan kampanyalar ortalamayı bozmaz.
  const velocityRes = await db.query<SiteVelocityRow>(
    `SELECT
        s.id,
        s.code,
        SUM(
          CASE WHEN c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
               THEN 1 ELSE 0 END
        ) AS last_7d_count,
        SUM(
          CASE WHEN c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 28 DAY)
               THEN 1 ELSE 0 END
        ) AS last_28d_count,
        AVG(
          CASE WHEN c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            THEN
              CASE
                WHEN CAST(NULLIF(TRIM(COALESCE(
                  JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.bonus_amount')),
                  JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.bonus_amount'))
                )), '') AS DECIMAL(20,4)) > 0
                  THEN CAST(NULLIF(TRIM(COALESCE(
                    JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.bonus_amount')),
                    JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.bonus_amount'))
                  )), '') AS DECIMAL(20,4))
                WHEN CAST(NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.max_bonus'))), '') AS DECIMAL(20,4)) > 0
                  THEN CAST(NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.max_bonus'))), '') AS DECIMAL(20,4))
                ELSE NULL
              END
            ELSE NULL
          END
        ) AS avg_bonus_7d,
        AVG(
          CASE WHEN c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 28 DAY)
            THEN
              CASE
                WHEN CAST(NULLIF(TRIM(COALESCE(
                  JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.bonus_amount')),
                  JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.bonus_amount'))
                )), '') AS DECIMAL(20,4)) > 0
                  THEN CAST(NULLIF(TRIM(COALESCE(
                    JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.bonus_amount')),
                    JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.bonus_amount'))
                  )), '') AS DECIMAL(20,4))
                WHEN CAST(NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.max_bonus'))), '') AS DECIMAL(20,4)) > 0
                  THEN CAST(NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.max_bonus'))), '') AS DECIMAL(20,4))
                ELSE NULL
              END
            ELSE NULL
          END
        ) AS avg_bonus_28d
       FROM sites s
       LEFT JOIN campaigns c
         ON c.site_id = s.id
        AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 28 DAY)
       GROUP BY s.id, s.code`
  );

  const stanceCounts = {
    aggressive: 0,
    neutral: 0,
    defensive: 0,
    unknown: 0,
  };
  const transitions: CompetitiveStanceCalcResult['transitions'] = [];

  // Per-site classification + UPDATE. We loop in JS so the bonus-boost rule
  // (multi-column comparison) stays readable; sites count is O(10s), not a
  // hot path. Each UPDATE is parameterised and isolated.
  for (const row of velocityRes.rows) {
    const last7d = Number(row.last_7d_count) || 0;
    const last28d = Number(row.last_28d_count) || 0;
    const last4wAvg = last28d / 4;
    const velocityDeltaRaw = last7d - last4wAvg;
    // INT column — yuvarlanmış değer UI'da gösterilir.
    const velocityDelta = Math.round(velocityDeltaRaw);

    const avgBonus7d =
      row.avg_bonus_7d == null ? null : Number(row.avg_bonus_7d);
    const avgBonus28d =
      row.avg_bonus_28d == null ? null : Number(row.avg_bonus_28d);

    let bonusBoost = 0;
    if (avgBonus7d != null && avgBonus28d != null && avgBonus28d > 0) {
      const ratio = avgBonus7d / avgBonus28d - 1;
      if (ratio > BONUS_DELTA_BOOST) {
        // Boost büyüklüğü ratio'ya orantılı; AGGRESSIVE'i pekiştirmek için.
        bonusBoost = Math.min(5, ratio * 5);
      }
    }

    let stance: SiteStance;
    if (last28d === 0 && last7d === 0) {
      // Hiç kampanya yoksa anlamlı bir tutum çıkmaz.
      stance = 'unknown';
    } else if (velocityDeltaRaw > AGGRESSIVE_THRESHOLD) {
      stance = 'aggressive';
    } else if (velocityDeltaRaw < DEFENSIVE_THRESHOLD) {
      stance = 'defensive';
    } else if (bonusBoost > 0 && velocityDeltaRaw >= 0) {
      // Velocity nötr ama bonus enflasyonu var — bu da AGGRESSIVE sinyali.
      stance = 'aggressive';
    } else {
      stance = 'neutral';
    }

    // stance_score: ham velocity_delta + bonus_boost. NEUTRAL/UNKNOWN için de
    // saklanır ki dashboard ileride sıralama yapabilsin.
    const stanceScore = Number(
      (velocityDeltaRaw + bonusBoost).toFixed(2)
    );

    stanceCounts[stance] += 1;

    await db.query(
      `UPDATE sites
          SET stance = $1,
              stance_score = $2,
              stance_velocity_delta = $3,
              stance_updated_at = CURRENT_TIMESTAMP
        WHERE id = $4`,
      [stance, stanceScore, velocityDelta, row.id]
    );

    const prev = beforeMap.get(String(row.id));
    if (prev && prev.stance !== stance) {
      transitions.push({
        code: row.code,
        from: prev.stance,
        to: stance,
        velocityDelta,
        score: stanceScore,
      });
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info('Competitive stance calculation completed', {
    sitesUpdated: velocityRes.rows.length,
    stanceCounts,
    transitions: transitions.length,
    durationMs,
  });

  if (transitions.length > 0) {
    logger.info('Competitive stance transitions', { transitions });
  }

  return {
    sitesUpdated: velocityRes.rows.length,
    stanceCounts,
    transitions,
    durationMs,
  };
}

/**
 * Periodic timer handle for the recurring 24h recalculation. Exposed so
 * graceful shutdown can stop the loop.
 */
let recurringTimer: NodeJS.Timeout | null = null;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Catch-up run on boot + 24h recurring interval. Mirrors the pattern of
 * `startMomentumRecalcSchedule` so operators can reason about the two jobs
 * together.
 */
export async function startCompetitiveStanceSchedule(
  intervalMs: number = ONE_DAY_MS
): Promise<void> {
  try {
    await processCompetitiveStanceCalcJob();
  } catch (error) {
    logger.error('Initial competitive stance calculation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (recurringTimer) {
    logger.debug('Competitive stance recurring timer already started, skipping');
    return;
  }

  recurringTimer = setInterval(() => {
    processCompetitiveStanceCalcJob().catch((error) => {
      logger.error('Recurring competitive stance calculation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, intervalMs);

  if (typeof recurringTimer.unref === 'function') {
    recurringTimer.unref();
  }

  logger.info('Competitive stance recurring schedule registered', {
    intervalMs,
    intervalHours: intervalMs / (60 * 60 * 1000),
  });
}

export function stopCompetitiveStanceSchedule(): void {
  if (recurringTimer) {
    clearInterval(recurringTimer);
    recurringTimer = null;
    logger.info('Competitive stance recurring schedule stopped');
  }
}
