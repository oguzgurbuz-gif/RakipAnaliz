import { execute, query } from '@/lib/db'

/**
 * Server-side helper for inserting rows into the unified `notifications`
 * table (migration 023). Wave 4 — Notification Center.
 *
 * Other modules call {@link createNotification} as a fire-and-forget side
 * effect after their primary domain action (e.g. inserting a smart_alert,
 * detecting a momentum_shift, persisting a weekly_report). The helper is
 * intentionally tolerant: if migration 023 hasn't been applied yet it
 * swallows the error and logs a warning so the producing job is never broken
 * by missing notification infrastructure.
 *
 * NOTE: dashboard and scraper currently maintain separate notification
 * helper files because they have separate DB pools. The scraper-side helper
 * lives at apps/scraper/src/jobs/notifications.ts and mirrors this signature.
 */

export type NotificationType =
  | 'smart_alert'
  | 'momentum_shift'
  | 'new_competitor'
  | 'campaign_end'
  | 'weekly_report_ready'
  | 'system'

export type NotificationSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface CreateNotificationInput {
  type: NotificationType
  severity: NotificationSeverity
  title: string
  message?: string | null
  payload?: Record<string, unknown> | null
  sourceTable?: string | null
  sourceId?: string | null
  linkUrl?: string | null
  /**
   * Eğer true ise (sourceTable, sourceId) için zaten kayıt varsa yeni
   * notification yaratmaz. Idempotent producerlar için (weekly_report_ready
   * gibi) güvenli.
   */
  dedupeBySource?: boolean
}

export interface CreateNotificationResult {
  inserted: boolean
  reason?: 'migration_pending' | 'duplicate' | 'error'
  error?: string
}

const TITLE_MAX = 500
const LINK_MAX = 500

function clamp(input: string | null | undefined, max: number): string | null {
  if (input == null) return null
  const s = String(input)
  return s.length > max ? s.slice(0, max) : s
}

/**
 * Insert a single notification row. Best-effort — failures are caught and
 * surfaced via the result object so the caller can decide whether to log,
 * retry or ignore.
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<CreateNotificationResult> {
  const title = clamp(input.title, TITLE_MAX) ?? ''
  if (!title) {
    return { inserted: false, reason: 'error', error: 'title is required' }
  }
  const linkUrl = clamp(input.linkUrl ?? null, LINK_MAX)
  const payloadJson =
    input.payload != null ? JSON.stringify(input.payload) : null

  try {
    if (input.dedupeBySource && input.sourceTable && input.sourceId) {
      const existing = await query<{ id: string | number }>(
        `SELECT id FROM notifications
          WHERE source_table = $1 AND source_id = $2
          ORDER BY id DESC LIMIT 1`,
        [input.sourceTable, input.sourceId]
      )
      if (existing.length > 0) {
        return { inserted: false, reason: 'duplicate' }
      }
    }

    await execute(
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
    )
    return { inserted: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      message.includes("doesn't exist") ||
      message.includes('Unknown column') ||
      message.includes('Unknown table')
    ) {
      return { inserted: false, reason: 'migration_pending', error: message }
    }
    return { inserted: false, reason: 'error', error: message }
  }
}

export interface NotificationRow {
  id: string
  notificationType: NotificationType | string
  severity: NotificationSeverity | string
  title: string
  message: string | null
  payload: Record<string, unknown> | null
  readAt: string | null
  archivedAt: string | null
  sourceTable: string | null
  sourceId: string | null
  linkUrl: string | null
  createdAt: string
}

interface RawNotificationRow {
  id: string | number
  notification_type: string
  severity: string
  title: string
  message: string | null
  payload: unknown
  read_at: string | Date | null
  archived_at: string | Date | null
  source_table: string | null
  source_id: string | null
  link_url: string | null
  created_at: string | Date
}

function safeParsePayload(payload: unknown): Record<string, unknown> | null {
  if (!payload) return null
  if (typeof payload === 'object') return payload as Record<string, unknown>
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload)
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }
  return null
}

function isoDate(value: string | Date | null): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return value
}

export function mapNotificationRow(row: RawNotificationRow): NotificationRow {
  return {
    id: String(row.id),
    notificationType: row.notification_type,
    severity: row.severity,
    title: row.title,
    message: row.message ?? null,
    payload: safeParsePayload(row.payload),
    readAt: isoDate(row.read_at),
    archivedAt: isoDate(row.archived_at),
    sourceTable: row.source_table,
    sourceId: row.source_id,
    linkUrl: row.link_url,
    createdAt: isoDate(row.created_at) ?? new Date().toISOString(),
  }
}

/**
 * Lightweight count helper used by the header bell. Excludes archived rows
 * and rows that were already read.
 */
export async function getUnreadNotificationCount(): Promise<{
  count: number
  migrationPending: boolean
}> {
  try {
    const rows = await query<{ c: number | string }>(
      `SELECT COUNT(*) AS c FROM notifications
        WHERE read_at IS NULL AND archived_at IS NULL`
    )
    const c = rows[0]?.c ?? 0
    return { count: typeof c === 'number' ? c : Number(c) || 0, migrationPending: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      message.includes("doesn't exist") ||
      message.includes('Unknown table')
    ) {
      return { count: 0, migrationPending: true }
    }
    throw error
  }
}
