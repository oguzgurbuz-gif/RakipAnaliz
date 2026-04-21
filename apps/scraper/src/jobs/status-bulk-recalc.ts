import { logger } from '../utils/logger';
import { getDb } from '../db';
import { recalculateAllCampaignStatuses } from '../db/queries';

export interface StatusBulkRecalcResult {
  updatedCount: number;
  counts: { active: number; expired: number; hidden: number; other: number };
  durationMs: number;
}

/**
 * Bulk-recalculates `campaigns.status` for every row using the same CASE
 * rules as the per-campaign `recalculateCampaignStatus` query in
 * `db/queries.ts`:
 *   - is_visible_on_last_scrape = 0  -> 'hidden'
 *   - valid_to IS NOT NULL AND valid_to < NOW()  -> 'expired'
 *   - otherwise                       -> 'active'
 *
 * Runs a single SQL UPDATE so it scales to large tables and stays consistent
 * with NOW() across all rows. Idempotent and safe to re-run.
 *
 * Mirrors the structure of `processMomentumRecalcJob` so it can be wired
 * into the JobScheduler as a job type and/or run on a recurring timer at
 * boot.
 */
export async function processStatusBulkRecalcJob(
  _payload: Record<string, unknown> = {}
): Promise<StatusBulkRecalcResult> {
  const startTime = Date.now();
  const db = getDb();

  logger.info('Campaign status bulk recalculation started');

  const { updatedCount, counts } = await recalculateAllCampaignStatuses(db);

  const durationMs = Date.now() - startTime;

  logger.info('Campaign status bulk recalculation completed', {
    updatedCount,
    counts,
    durationMs,
  });

  return { updatedCount, counts, durationMs };
}

/**
 * Periodic timer handle for the recurring 1h recalculation. Exposed so
 * graceful-shutdown paths (and tests) can stop the loop.
 */
let recurringTimer: NodeJS.Timeout | null = null;

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Runs an immediate catch-up bulk recalculation and then schedules a
 * recurring run every hour. Status flips quickly when `valid_to` crosses
 * NOW(), so 1h is short enough to keep the dashboard accurate without
 * thrashing the DB. Safe to call multiple times — re-invocations are no-ops.
 */
export async function startStatusBulkRecalcSchedule(
  intervalMs: number = ONE_HOUR_MS
): Promise<void> {
  // Catch-up run on startup. Errors are logged but swallowed so they don't
  // crash the scraper boot sequence.
  try {
    await processStatusBulkRecalcJob();
  } catch (error) {
    logger.error('Initial campaign status bulk recalculation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (recurringTimer) {
    logger.debug('Status bulk recurring timer already started, skipping');
    return;
  }

  recurringTimer = setInterval(() => {
    processStatusBulkRecalcJob().catch((error) => {
      logger.error('Recurring campaign status bulk recalculation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, intervalMs);

  // Don't keep the Node event loop alive solely for this timer.
  if (typeof recurringTimer.unref === 'function') {
    recurringTimer.unref();
  }

  logger.info('Status bulk recurring schedule registered', {
    intervalMs,
    intervalHours: intervalMs / (60 * 60 * 1000),
  });
}

export function stopStatusBulkRecalcSchedule(): void {
  if (recurringTimer) {
    clearInterval(recurringTimer);
    recurringTimer = null;
    logger.info('Status bulk recurring schedule stopped');
  }
}
