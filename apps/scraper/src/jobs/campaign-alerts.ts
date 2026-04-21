import { logger } from '../utils/logger';
import { getDb } from '../db';

export interface CampaignAlertsResult {
  endingSoonCandidates: number;
  insertedAlerts: number;
  durationMs: number;
}

interface EndingSoonRow extends Record<string, unknown> {
  id: string;
  title: string;
  valid_to: string;
}

/**
 * Scans for campaigns whose `valid_to` is within the next 7 days and inserts
 * `ending_soon` rows into `campaign_alerts`. The unique constraint
 * (campaign_id, alert_type, target_date) lets us re-run safely — duplicates
 * are silently ignored via INSERT IGNORE.
 *
 * Email delivery is intentionally a TODO: this job currently only persists
 * the alert intent. A follow-up worker can pick rows where `sent_at IS NULL`
 * and dispatch them.
 */
export async function processCampaignAlertsJob(
  _payload: Record<string, unknown> = {}
): Promise<CampaignAlertsResult> {
  const startTime = Date.now();
  const db = getDb();

  logger.info('Campaign alerts scan started');

  // Pull campaigns ending within the next 7 days. We only consider campaigns
  // that still have a valid_to in the future — campaigns already ended are
  // handled by status-recalc and don't need another alert here.
  const candidatesRes = await db.query<EndingSoonRow>(
    `SELECT id, title, valid_to
       FROM campaigns
      WHERE valid_to IS NOT NULL
        AND valid_to BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)`
  );

  const candidates = candidatesRes.rows;
  let inserted = 0;

  for (const row of candidates) {
    // INSERT IGNORE keeps this job idempotent across daily reruns: if an
    // alert already exists for (campaign, type, target_date) we skip it.
    const insertRes = await db.query(
      `INSERT IGNORE INTO campaign_alerts
         (campaign_id, alert_type, target_date, recipient_emails)
       VALUES ($1, 'ending_soon', $2, JSON_ARRAY())`,
      [row.id, row.valid_to]
    );
    inserted += insertRes.rowCount ?? 0;

    // TODO: dispatch email to recipient_emails when delivery worker lands.
    // For now we only persist the intent — see plan in TASKS.md.
  }

  const durationMs = Date.now() - startTime;
  logger.info('Campaign alerts scan completed', {
    endingSoonCandidates: candidates.length,
    insertedAlerts: inserted,
    durationMs,
  });

  return {
    endingSoonCandidates: candidates.length,
    insertedAlerts: inserted,
    durationMs,
  };
}

/**
 * Periodic timer handle for the recurring 24h scan. Mirrors the pattern in
 * momentum-recalc so shutdown / tests can stop the loop cleanly.
 */
let recurringTimer: NodeJS.Timeout | null = null;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Catch-up scan on boot, then a recurring 24h scan. Calling more than once
 * is a no-op for the recurring timer — only the first call schedules it.
 */
export async function startCampaignAlertsSchedule(
  intervalMs: number = ONE_DAY_MS
): Promise<void> {
  try {
    await processCampaignAlertsJob();
  } catch (error) {
    logger.error('Initial campaign alerts scan failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (recurringTimer) {
    logger.debug('Campaign alerts recurring timer already started, skipping');
    return;
  }

  recurringTimer = setInterval(() => {
    processCampaignAlertsJob().catch((error) => {
      logger.error('Recurring campaign alerts scan failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, intervalMs);

  if (typeof recurringTimer.unref === 'function') {
    recurringTimer.unref();
  }

  logger.info('Campaign alerts recurring schedule registered', {
    intervalMs,
    intervalHours: intervalMs / (60 * 60 * 1000),
  });
}

export function stopCampaignAlertsSchedule(): void {
  if (recurringTimer) {
    clearInterval(recurringTimer);
    recurringTimer = null;
    logger.info('Campaign alerts recurring schedule stopped');
  }
}
