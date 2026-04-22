import { logger } from '../utils/logger';
import { getDb } from '../db';

/**
 * Slack pusher for smart_alerts (migration 017).
 *
 * Strategy:
 *   - high   : pushed immediately on the next 5-minute tick (one Slack
 *              message per alert).
 *   - medium : batched into a daily digest at alert_settings.digest_time_hour
 *              UTC (default 09:00).
 *   - low    : batched into a weekly digest on Mondays at digest_time_hour.
 *
 * After a successful push the row is marked `pushed_to_slack=TRUE` and
 * `pushed_to_slack_at=NOW()` so re-runs are idempotent.
 *
 * If `slack_webhook_url` is empty the job is a no-op (a single warn line is
 * emitted at most once per tick) — users are expected to paste their own
 * webhook URL via /admin/alerts.
 */

interface AlertSettingsRow extends Record<string, unknown> {
  slack_webhook_url: string | null;
  bonus_change_threshold_pct: string | number;
  digest_time_hour: number;
  enabled: number;
}

interface SmartAlertRow extends Record<string, unknown> {
  id: string | number;
  alert_type: 'bonus_change' | 'category_change' | 'new_campaign' | 'kvkk_change';
  severity: 'low' | 'medium' | 'high';
  campaign_id: string | null;
  site_id: string | null;
  title: string | null;
  description: string | null;
  payload: unknown;
  created_at: string | Date;
}

const TICK_MS = 5 * 60 * 1000;

let recurringTimer: NodeJS.Timeout | null = null;
let lastDailyDigestKey: string | null = null;
let lastWeeklyDigestKey: string | null = null;

async function loadSettings(): Promise<AlertSettingsRow | null> {
  const db = getDb();
  try {
    const res = await db.query<AlertSettingsRow>(
      `SELECT slack_webhook_url, bonus_change_threshold_pct, digest_time_hour, enabled
         FROM alert_settings WHERE id = 1`
    );
    return res.rows[0] ?? null;
  } catch (err) {
    logger.warn('alert_settings unavailable, slack pusher idle', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function parsePayload(payload: unknown): Record<string, unknown> {
  if (!payload) return {};
  if (typeof payload === 'object') return payload as Record<string, unknown>;
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function severityEmoji(severity: string): string {
  if (severity === 'high') return '🚨';
  if (severity === 'medium') return '🔔';
  return 'ℹ️';
}

function alertTypeLabel(t: string): string {
  switch (t) {
    case 'bonus_change':
      return 'Bonus Değişikliği';
    case 'category_change':
      return 'Kategori Değişikliği';
    case 'new_campaign':
      return 'Yeni Kampanya';
    case 'kvkk_change':
      return 'KVKK Değişikliği';
    default:
      return t;
  }
}

/**
 * Renders a single alert as a Slack Block Kit message body. Falls back to
 * `text` only when no rich blocks are needed (Slack still renders the text
 * if blocks fail).
 */
function renderSingleAlertBlocks(row: SmartAlertRow): unknown {
  const payload = parsePayload(row.payload);
  const emoji = severityEmoji(row.severity);
  const typeLabel = alertTypeLabel(row.alert_type);

  const headline = row.title ?? `${typeLabel} (${row.severity})`;
  const detailLines: string[] = [];

  if (row.description) detailLines.push(row.description);

  if (row.alert_type === 'bonus_change') {
    const oldV = payload.old as number | null | undefined;
    const newV = payload.new as number | null | undefined;
    const deltaPct = payload.delta_pct as number | null | undefined;
    if (oldV != null && newV != null && deltaPct != null) {
      detailLines.push(
        `*Eski:* ${oldV} TL  →  *Yeni:* ${newV} TL  (*Δ:* ${deltaPct >= 0 ? '+' : ''}${deltaPct}%)`
      );
    }
  } else if (row.alert_type === 'category_change') {
    const oldC = payload.old as string | null | undefined;
    const newC = payload.new as string | null | undefined;
    detailLines.push(`*${oldC ?? '-'}* → *${newC ?? '-'}*`);
  }

  const url = (payload.campaign_url as string | null | undefined) ?? null;
  if (url) detailLines.push(`<${url}|Kampanya linki>`);

  const text = `${emoji} *${headline}*\n${detailLines.join('\n')}`;

  return {
    text,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `${emoji} *${headline}*` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: detailLines.join('\n') || ' ' },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*${typeLabel}* · severity: \`${row.severity}\` · ${new Date(row.created_at).toISOString()}`,
          },
        ],
      },
    ],
  };
}

function renderDigestBlocks(rows: SmartAlertRow[], headlinePrefix: string): unknown {
  const lines = rows.map((row) => {
    const payload = parsePayload(row.payload);
    const url = (payload.campaign_url as string | null | undefined) ?? null;
    const linkText = row.title ?? alertTypeLabel(row.alert_type);
    return `• ${severityEmoji(row.severity)} ${url ? `<${url}|${linkText}>` : linkText}`;
  });

  const text = `${headlinePrefix} (${rows.length} alert)\n${lines.join('\n')}`;
  return {
    text,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${headlinePrefix}* — ${rows.length} alert` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: lines.join('\n') || ' ' },
      },
    ],
  };
}

async function postToSlack(webhookUrl: string, body: unknown): Promise<{ ok: boolean; status: number; bodyText: string }> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  return { ok: res.ok, status: res.status, bodyText: text };
}

async function markPushed(ids: Array<string | number>): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  // mysql2 supports passing an array bound to a placeholder, but the project
  // uses a postgres-style $N converter; build an explicit IN list.
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  await db.query(
    `UPDATE smart_alerts
        SET pushed_to_slack = 1,
            pushed_to_slack_at = CURRENT_TIMESTAMP(6)
      WHERE id IN (${placeholders})`,
    ids
  );
}

async function fetchUnpushed(severity: 'high' | 'medium' | 'low', limit: number): Promise<SmartAlertRow[]> {
  const db = getDb();
  const res = await db.query<SmartAlertRow>(
    `SELECT id, alert_type, severity, campaign_id, site_id, title, description, payload, created_at
       FROM smart_alerts
      WHERE pushed_to_slack = 0 AND severity = $1
      ORDER BY created_at ASC
      LIMIT $2`,
    [severity, limit]
  );
  return res.rows;
}

/**
 * Push every unpushed `high` severity alert as its own Slack message.
 * Returns the number of alerts pushed.
 */
async function pushHighSeverity(webhookUrl: string): Promise<number> {
  const rows = await fetchUnpushed('high', 50);
  if (rows.length === 0) return 0;

  const pushedIds: Array<string | number> = [];
  for (const row of rows) {
    try {
      const body = renderSingleAlertBlocks(row);
      const res = await postToSlack(webhookUrl, body);
      if (!res.ok) {
        logger.warn('Slack push failed for high alert', {
          id: row.id,
          status: res.status,
          body: res.bodyText.slice(0, 200),
        });
        continue;
      }
      pushedIds.push(row.id);
    } catch (err) {
      logger.warn('Slack push threw for high alert', {
        id: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  await markPushed(pushedIds);
  return pushedIds.length;
}

/**
 * Push a digest message containing every unpushed alert at the given
 * severity. Marks all included rows as pushed only if the Slack POST
 * succeeded.
 */
async function pushDigest(
  webhookUrl: string,
  severity: 'medium' | 'low',
  headline: string
): Promise<number> {
  const rows = await fetchUnpushed(severity, 200);
  if (rows.length === 0) return 0;
  try {
    const body = renderDigestBlocks(rows, headline);
    const res = await postToSlack(webhookUrl, body);
    if (!res.ok) {
      logger.warn('Slack digest push failed', {
        severity,
        status: res.status,
        body: res.bodyText.slice(0, 200),
      });
      return 0;
    }
    await markPushed(rows.map((r) => r.id));
    return rows.length;
  } catch (err) {
    logger.warn('Slack digest push threw', {
      severity,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/**
 * Public entry point — runs one tick of the pusher. High alerts are flushed
 * every call; medium/low digests only fire once per matching window so
 * users don't get spammed if the timer ticks more than once in the same hour.
 */
export async function pushPendingAlerts(now: Date = new Date()): Promise<{
  high: number;
  medium: number;
  low: number;
}> {
  const settings = await loadSettings();
  if (!settings || !settings.enabled) {
    return { high: 0, medium: 0, low: 0 };
  }

  const webhookUrl = (settings.slack_webhook_url ?? '').trim();
  if (!webhookUrl) {
    logger.debug('Slack webhook URL not configured, skipping push');
    return { high: 0, medium: 0, low: 0 };
  }

  const digestHour = Number(settings.digest_time_hour ?? 9);
  const isDigestHour = now.getUTCHours() === digestHour;

  // Tick keys ensure each digest window only fires once even if the timer
  // runs every 5 minutes inside the digest hour.
  const dailyKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
  const weeklyKey = `${now.getUTCFullYear()}-W${getIsoWeek(now)}`;
  const isMonday = now.getUTCDay() === 1; // 0=Sun, 1=Mon

  const high = await pushHighSeverity(webhookUrl);

  let medium = 0;
  if (isDigestHour && lastDailyDigestKey !== dailyKey) {
    medium = await pushDigest(webhookUrl, 'medium', 'Günlük Smart Alert Özeti');
    lastDailyDigestKey = dailyKey;
  }

  let low = 0;
  if (isDigestHour && isMonday && lastWeeklyDigestKey !== weeklyKey) {
    low = await pushDigest(webhookUrl, 'low', 'Haftalık Smart Alert Özeti');
    lastWeeklyDigestKey = weeklyKey;
  }

  if (high > 0 || medium > 0 || low > 0) {
    logger.info('Slack alerts pushed', { high, medium, low });
  }
  return { high, medium, low };
}

function getIsoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Send a one-off test message to the given webhook. Used by the dashboard
 * "Test Et" button so the user can verify their webhook before relying on
 * the production scheduler.
 */
export async function sendSlackTestMessage(webhookUrl: string): Promise<{
  ok: boolean;
  status: number;
  bodyText: string;
}> {
  const body = {
    text: 'RakipAnaliz Smart Alert sistemi: bağlantı testi başarılı.',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*RakipAnaliz · Smart Alert*\nBağlantı testi başarılı. Webhook URL doğru çalışıyor.',
        },
      },
    ],
  };
  return postToSlack(webhookUrl, body);
}

/**
 * Catch-up push on boot, then a recurring 5-minute timer. Mirrors the
 * momentum-recalc / campaign-alerts scheduling pattern.
 */
export async function startSlackPusherSchedule(intervalMs: number = TICK_MS): Promise<void> {
  try {
    await pushPendingAlerts();
  } catch (err) {
    logger.error('Initial slack push failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (recurringTimer) {
    logger.debug('Slack pusher recurring timer already started, skipping');
    return;
  }

  recurringTimer = setInterval(() => {
    pushPendingAlerts().catch((err) => {
      logger.error('Recurring slack push failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, intervalMs);

  if (typeof recurringTimer.unref === 'function') {
    recurringTimer.unref();
  }

  logger.info('Slack pusher recurring schedule registered', {
    intervalMs,
    intervalMinutes: intervalMs / 60_000,
  });
}

export function stopSlackPusherSchedule(): void {
  if (recurringTimer) {
    clearInterval(recurringTimer);
    recurringTimer = null;
    logger.info('Slack pusher recurring schedule stopped');
  }
}
