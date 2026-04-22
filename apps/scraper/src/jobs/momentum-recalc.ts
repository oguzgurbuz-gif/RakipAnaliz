import { logger } from '../utils/logger';
import { getDb } from '../db';
import { createNotification } from './notifications';

export interface MomentumRecalcResult {
  sitesUpdated: number;
  directionCounts: {
    up: number;
    down: number;
    stable: number;
  };
  durationMs: number;
}

/**
 * Snapshot of a site's momentum BEFORE/AFTER recalculation, used to detect
 * direction changes for logging purposes.
 */
interface SiteMomentumSnapshot extends Record<string, unknown> {
  id: string;
  code: string;
  momentum_score: number;
  momentum_direction: 'up' | 'down' | 'stable';
  momentum_last_7_days: number;
  momentum_prev_7_days: number;
}

/**
 * Recalculates momentum metrics for every site by comparing the last-7-days
 * vs previous-7-days campaign volume. Mirrors the logic of migration
 * 010_calculate_momentum.sql but is idempotent and re-runnable.
 *
 * Logs:
 *  - total sites updated
 *  - direction breakdown (up / down / stable)
 *  - sites whose direction transitioned (up <-> down <-> stable)
 */
export async function processMomentumRecalcJob(
  _payload: Record<string, unknown> = {}
): Promise<MomentumRecalcResult> {
  const startTime = Date.now();
  const db = getDb();

  logger.info('Momentum recalculation started');

  // Snapshot BEFORE update so we can diff direction changes.
  const beforeRes = await db.query<SiteMomentumSnapshot>(
    `SELECT id, code, momentum_score, momentum_direction,
            momentum_last_7_days, momentum_prev_7_days
       FROM sites`
  );
  const beforeMap = new Map<string, SiteMomentumSnapshot>();
  for (const row of beforeRes.rows) {
    beforeMap.set(String(row.id), {
      ...row,
      momentum_score: Number(row.momentum_score),
      momentum_last_7_days: Number(row.momentum_last_7_days),
      momentum_prev_7_days: Number(row.momentum_prev_7_days),
    });
  }

  // Step 1: refresh the rolling 7-day windows from campaigns.
  const windowRes = await db.query(
    `UPDATE sites s
        SET momentum_last_7_days = (
              SELECT COUNT(*) FROM campaigns c
               WHERE c.site_id = s.id
                 AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            ),
            momentum_prev_7_days = (
              SELECT COUNT(*) FROM campaigns c
               WHERE c.site_id = s.id
                 AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                 AND c.first_seen_at <  DATE_SUB(NOW(), INTERVAL  7 DAY)
            ),
            momentum_updated_at = CURRENT_TIMESTAMP(6)`
  );

  // Step 2: derive momentum_score + direction from those windows.
  const scoreRes = await db.query(
    `UPDATE sites s
        SET momentum_score = CASE
              WHEN momentum_prev_7_days > 0
                THEN ROUND((momentum_last_7_days - momentum_prev_7_days)
                           / momentum_prev_7_days * 100)
              WHEN momentum_last_7_days > 0 THEN 100
              ELSE 0
            END,
            momentum_direction = CASE
              WHEN momentum_prev_7_days > 0
                   AND (momentum_last_7_days - momentum_prev_7_days)
                       / momentum_prev_7_days >=  0.20 THEN 'up'
              WHEN momentum_prev_7_days > 0
                   AND (momentum_last_7_days - momentum_prev_7_days)
                       / momentum_prev_7_days <= -0.20 THEN 'down'
              ELSE 'stable'
            END,
            momentum_updated_at = CURRENT_TIMESTAMP(6)`
  );

  // Snapshot AFTER for diffing.
  const afterRes = await db.query<SiteMomentumSnapshot>(
    `SELECT id, code, momentum_score, momentum_direction,
            momentum_last_7_days, momentum_prev_7_days
       FROM sites`
  );

  const directionCounts = { up: 0, down: 0, stable: 0 };
  const transitions: Array<{
    code: string;
    from: string;
    to: string;
    score: number;
  }> = [];

  for (const row of afterRes.rows) {
    const direction = row.momentum_direction;
    if (direction === 'up' || direction === 'down' || direction === 'stable') {
      directionCounts[direction]++;
    }
    const prev = beforeMap.get(String(row.id));
    if (prev && prev.momentum_direction !== direction) {
      transitions.push({
        code: row.code,
        from: prev.momentum_direction,
        to: direction,
        score: Number(row.momentum_score),
      });
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info('Momentum recalculation completed', {
    sitesUpdated: afterRes.rows.length,
    windowAffected: windowRes.rowCount,
    scoreAffected: scoreRes.rowCount,
    directionCounts,
    transitions: transitions.length,
    durationMs,
  });

  if (transitions.length > 0) {
    logger.info('Momentum direction transitions', { transitions });
  }

  // Wave 4 — emit notification for every meaningful direction transition
  // (we filter out *_to_stable to avoid noise; up<->down is the high-signal
  // shift the sales/competitive teams care about).
  for (const t of transitions) {
    const isMeaningful =
      (t.from === 'up' && t.to === 'down') ||
      (t.from === 'down' && t.to === 'up') ||
      (t.from === 'stable' && (t.to === 'up' || t.to === 'down'));
    if (!isMeaningful) continue;

    const arrow =
      t.to === 'up' ? '↑' : t.to === 'down' ? '↓' : '→';
    const label =
      t.to === 'up'
        ? 'momentum yükselişe geçti'
        : t.to === 'down'
          ? 'momentum düşüşe geçti'
          : 'momentum sabitlendi';

    await createNotification({
      type: 'momentum_shift',
      severity: 'medium',
      title: `${t.code}: ${label} ${arrow}`,
      message: `Momentum yönü ${t.from} → ${t.to} (skor ${t.score})`,
      payload: {
        site_code: t.code,
        from_direction: t.from,
        to_direction: t.to,
        score: t.score,
      },
      sourceTable: 'sites.momentum',
      sourceId: `${t.code}:${t.from}->${t.to}:${new Date()
        .toISOString()
        .slice(0, 10)}`,
      linkUrl: `/competition/sites/${encodeURIComponent(t.code)}`,
      // Same site flipping back-and-forth in a single day still produces 2
      // distinct sourceIds (different transition strings) — but two recalc
      // runs on the same day with the same transition will dedupe.
      dedupeBySource: true,
    });
  }

  return {
    sitesUpdated: afterRes.rows.length,
    directionCounts,
    durationMs,
  };
}

/**
 * Periodic timer handle for the recurring 24h recalculation. Exposed so tests
 * (or graceful shutdown paths) can stop the loop.
 */
let recurringTimer: NodeJS.Timeout | null = null;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Runs an immediate catch-up recalculation and then schedules a recurring run
 * every 24 hours. Safe to call multiple times — re-invocations are no-ops.
 */
export async function startMomentumRecalcSchedule(
  intervalMs: number = ONE_DAY_MS
): Promise<void> {
  // Catch-up run on startup. Errors are logged but swallowed so they don't
  // crash the scraper boot sequence.
  try {
    await processMomentumRecalcJob();
  } catch (error) {
    logger.error('Initial momentum recalculation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (recurringTimer) {
    logger.debug('Momentum recurring timer already started, skipping');
    return;
  }

  recurringTimer = setInterval(() => {
    processMomentumRecalcJob().catch((error) => {
      logger.error('Recurring momentum recalculation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, intervalMs);

  // Don't keep the Node event loop alive solely for this timer.
  if (typeof recurringTimer.unref === 'function') {
    recurringTimer.unref();
  }

  logger.info('Momentum recurring schedule registered', {
    intervalMs,
    intervalHours: intervalMs / (60 * 60 * 1000),
  });
}

export function stopMomentumRecalcSchedule(): void {
  if (recurringTimer) {
    clearInterval(recurringTimer);
    recurringTimer = null;
    logger.info('Momentum recurring schedule stopped');
  }
}
