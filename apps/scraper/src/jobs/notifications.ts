import { logger } from '../utils/logger';
import { getDb } from '../db';

/**
 * Scraper-side helper for inserting rows into the unified `notifications`
 * table (migration 023).
 *
 * Mirror of apps/dashboard/lib/notifications.ts. The two helpers exist
 * separately because dashboard and scraper own independent DB pools — but the
 * payload contract is identical so the dashboard renders both producers
 * uniformly.
 *
 * Best-effort semantics: every call is wrapped in try/catch. If migration
 * 023 hasn't applied yet, or any other DB issue occurs, the producer logs a
 * warning and continues — notification creation must never break a primary
 * scraper job.
 *
 * Also publishes a lightweight `notification_created` row to `sse_events`
 * (channel = SSE_CHANNEL || 'bitalih:events') so the dashboard header bell
 * can refresh in near real-time.
 */

export type NotificationType =
  | 'smart_alert'
  | 'momentum_shift'
  | 'new_competitor'
  | 'campaign_end'
  | 'weekly_report_ready'
  | 'system';

export type NotificationSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface CreateNotificationInput {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message?: string | null;
  payload?: Record<string, unknown> | null;
  sourceTable?: string | null;
  sourceId?: string | null;
  linkUrl?: string | null;
  /**
   * Eğer true ise (sourceTable, sourceId) için zaten kayıt varsa yeni
   * notification yaratmaz. Idempotent producerlar için.
   */
  dedupeBySource?: boolean;
}

export interface CreateNotificationResult {
  inserted: boolean;
  reason?: 'migration_pending' | 'duplicate' | 'error' | 'invalid';
  error?: string;
}

const TITLE_MAX = 500;
const LINK_MAX = 500;
const SSE_CHANNEL = process.env.SSE_CHANNEL || 'bitalih:events';

function clamp(input: string | null | undefined, max: number): string | null {
  if (input == null) return null;
  const s = String(input);
  return s.length > max ? s.slice(0, max) : s;
}

export async function createNotification(
  input: CreateNotificationInput
): Promise<CreateNotificationResult> {
  const title = clamp(input.title, TITLE_MAX) ?? '';
  if (!title) {
    return { inserted: false, reason: 'invalid', error: 'title is required' };
  }
  const linkUrl = clamp(input.linkUrl ?? null, LINK_MAX);
  const payloadJson =
    input.payload != null ? JSON.stringify(input.payload) : null;

  const db = getDb();
  try {
    if (input.dedupeBySource && input.sourceTable && input.sourceId) {
      const existing = await db.query<{ id: string | number }>(
        `SELECT id FROM notifications
          WHERE source_table = $1 AND source_id = $2
          ORDER BY id DESC LIMIT 1`,
        [input.sourceTable, input.sourceId]
      );
      if ((existing.rows?.length ?? 0) > 0) {
        return { inserted: false, reason: 'duplicate' };
      }
    }

    await db.query(
      `INSERT INTO notifications
         (notification_type, severity, title, message, payload,
          source_table, source_id, link_url)
       VALUES ($1, $2, $3, $4, CAST($5 AS JSON), $6, $7, $8)`,
      [
        input.type,
        input.severity,
        title,
        input.message ?? null,
        payloadJson,
        input.sourceTable ?? null,
        input.sourceId ?? null,
        linkUrl,
      ]
    );

    // Best-effort SSE publish so the header bell can refresh without polling.
    try {
      await db.query(
        `INSERT INTO sse_events (event_type, event_channel, payload, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [
          'notification_created',
          SSE_CHANNEL,
          JSON.stringify({
            type: input.type,
            severity: input.severity,
            title,
            sourceTable: input.sourceTable ?? null,
            sourceId: input.sourceId ?? null,
            linkUrl,
          }),
        ]
      );
    } catch (sseError) {
      logger.debug('notification_created SSE publish failed (non-fatal)', {
        error:
          sseError instanceof Error ? sseError.message : String(sseError),
      });
    }

    return { inserted: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("doesn't exist") ||
      message.includes('Unknown column') ||
      message.includes('Unknown table')
    ) {
      logger.warn('notifications table missing — skip', {
        type: input.type,
      });
      return { inserted: false, reason: 'migration_pending', error: message };
    }
    logger.warn('createNotification failed (non-fatal)', {
      type: input.type,
      error: message,
    });
    return { inserted: false, reason: 'error', error: message };
  }
}
