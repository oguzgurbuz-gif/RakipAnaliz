import { logger } from '../utils/logger';
import { getDb } from '../db';
import { createNotification } from './notifications';

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
    const wasInserted = (insertRes.rowCount ?? 0) > 0;
    inserted += insertRes.rowCount ?? 0;

    // Wave 4 — emit a notification only when this scan inserted a brand new
    // ending_soon row. campaign_alerts (campaign_id, alert_type, target_date)
    // is unique, so we trust INSERT IGNORE rowCount as the dedup gate.
    if (wasInserted) {
      // row.valid_to is typed as string but mysql2 may hand us a Date depending
      // on the connection's typeCast settings; normalize defensively.
      const validToRaw: unknown = row.valid_to as unknown;
      const validToIso =
        validToRaw instanceof Date
          ? validToRaw.toISOString()
          : String(validToRaw);
      await createNotification({
        type: 'campaign_end',
        severity: 'medium',
        title: `Kampanya bitiyor: ${row.title ?? 'Kampanya'}`,
        message: `${row.title ?? 'Kampanya'} 7 gün içinde sona eriyor (${validToIso}).`,
        payload: {
          campaign_id: row.id,
          campaign_title: row.title,
          valid_to: validToIso,
        },
        sourceTable: 'campaign_alerts',
        sourceId: `${row.id}:ending_soon:${validToIso.slice(0, 10)}`,
        linkUrl: `/campaigns/${row.id}`,
        dedupeBySource: true,
      });
    }

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
