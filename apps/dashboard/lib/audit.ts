import type { NextRequest } from 'next/server'
import { query } from '@/lib/db'

/**
 * Admin audit logging helper.
 *
 * Records administrative actions into the `admin_logs` table created by
 * migration 015_admin_logs.sql. Failures are logged but never thrown, so the
 * caller's primary mutation is never blocked by an audit write.
 */

export type AuditAction =
  | 'site.toggle'
  | 'job.retry'
  | 'scrape.trigger'
  | 'ai.reindex'
  | 'campaign.status.recalc'
  | string

export type AuditResourceType =
  | 'site'
  | 'job'
  | 'scrape_run'
  | 'campaign'
  | 'system'
  | string

export interface LogActionInput {
  actor: string
  action: AuditAction
  resourceType: AuditResourceType
  resourceId?: string | null
  changes?: Record<string, unknown> | null
  ip?: string | null
}

/**
 * Best-effort extraction of the actor from an incoming request.
 *
 * The middleware already gates admin routes via the `x-admin-key` header or
 * the `admin_session` cookie, so we do not have a real user identity. We label
 * everything as `admin`, but include hints (header/cookie) for forensic value.
 */
export function getActorFromRequest(request: NextRequest): string {
  const hasHeader = Boolean(request.headers.get('x-admin-key'))
  const hasCookie = Boolean(request.cookies.get('admin_session')?.value)
  if (hasHeader) return 'admin:header'
  if (hasCookie) return 'admin:cookie'
  return 'admin'
}

export function getIpFromRequest(request: NextRequest): string | null {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first.slice(0, 64)
  }
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.slice(0, 64)
  return null
}

/**
 * Persist a single audit entry. Never throws.
 */
export async function logAction(input: LogActionInput): Promise<void> {
  try {
    const changesJson = input.changes ? JSON.stringify(input.changes) : null
    await query(
      `INSERT INTO admin_logs (actor, action, resource_type, resource_id, changes, ip)
       VALUES ($1, $2, $3, $4, CAST($5 AS JSON), $6)`,
      [
        input.actor.slice(0, 255),
        input.action.slice(0, 64),
        input.resourceType.slice(0, 64),
        input.resourceId ? input.resourceId.slice(0, 36) : null,
        changesJson,
        input.ip ? input.ip.slice(0, 64) : null,
      ]
    )
  } catch (error) {
    // Audit logging must never break the primary action.
    // eslint-disable-next-line no-console
    console.error('[audit] Failed to record admin log entry:', error)
  }
}

/**
 * Convenience wrapper that derives actor + ip from the request.
 */
export async function logRequestAction(
  request: NextRequest,
  partial: Omit<LogActionInput, 'actor' | 'ip'>
): Promise<void> {
  await logAction({
    ...partial,
    actor: getActorFromRequest(request),
    ip: getIpFromRequest(request),
  })
}
