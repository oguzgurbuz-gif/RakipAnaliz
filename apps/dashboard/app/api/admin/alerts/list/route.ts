import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, handleApiError, getCorsHeaders } from '@/lib/response'

/**
 * Smart Alerts list endpoint (migration 017). Returns the most recent rows
 * from `smart_alerts` with optional filtering on type, severity and pushed
 * status. Designed for the /admin/alerts table.
 *
 * Query string:
 *   - type      : alert_type filter ('bonus_change' | 'category_change' | …)
 *   - severity  : 'low' | 'medium' | 'high'
 *   - pushed    : '1' | '0' (pushed_to_slack)
 *   - limit     : 1..200 (default 50)
 *
 * Auth: middleware-protected.
 */

interface SmartAlertRow {
  id: string | number
  alert_type: string
  severity: string
  campaign_id: string | null
  site_id: string | null
  title: string | null
  description: string | null
  payload: unknown
  pushed_to_slack: number
  pushed_to_slack_at: string | Date | null
  created_at: string | Date
  site_name: string | null
  site_code: string | null
}

const ALLOWED_TYPES = new Set(['bonus_change', 'category_change', 'new_campaign', 'kvkk_change'])
const ALLOWED_SEVERITIES = new Set(['low', 'medium', 'high'])

function safeParsePayload(payload: unknown): Record<string, unknown> {
  if (!payload) return {}
  if (typeof payload === 'object') return payload as Record<string, unknown>
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const typeParam = searchParams.get('type')
    const severityParam = searchParams.get('severity')
    const pushedParam = searchParams.get('pushed')
    const limitRaw = searchParams.get('limit')
    const limit = Math.min(Math.max(parseInt(limitRaw ?? '50', 10) || 50, 1), 200)

    const where: string[] = []
    const params: unknown[] = []
    let i = 1

    if (typeParam && ALLOWED_TYPES.has(typeParam)) {
      where.push(`a.alert_type = $${i++}`)
      params.push(typeParam)
    }
    if (severityParam && ALLOWED_SEVERITIES.has(severityParam)) {
      where.push(`a.severity = $${i++}`)
      params.push(severityParam)
    }
    if (pushedParam === '1' || pushedParam === '0') {
      where.push(`a.pushed_to_slack = $${i++}`)
      params.push(pushedParam === '1' ? 1 : 0)
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

    let rows: SmartAlertRow[] = []
    let migrationPending = false
    try {
      rows = await query<SmartAlertRow>(
        `SELECT a.id, a.alert_type, a.severity, a.campaign_id, a.site_id,
                a.title, a.description, a.payload,
                a.pushed_to_slack, a.pushed_to_slack_at, a.created_at,
                s.name AS site_name, s.code AS site_code
           FROM smart_alerts a
           LEFT JOIN sites s ON s.id = a.site_id
           ${whereSql}
          ORDER BY a.created_at DESC
          LIMIT $${i}`,
        [...params, limit]
      )
    } catch {
      migrationPending = true
    }

    const data = rows.map((row) => {
      const payload = safeParsePayload(row.payload)
      return {
        id: String(row.id),
        alertType: row.alert_type,
        severity: row.severity,
        campaignId: row.campaign_id,
        siteId: row.site_id,
        siteName: row.site_name,
        siteCode: row.site_code,
        title: row.title,
        description: row.description,
        payload,
        pushedToSlack: Boolean(row.pushed_to_slack),
        pushedToSlackAt:
          row.pushed_to_slack_at instanceof Date
            ? row.pushed_to_slack_at.toISOString()
            : (row.pushed_to_slack_at as string | null),
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : (row.created_at as string),
      }
    })

    return successResponse({ alerts: data, migrationPending })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}
