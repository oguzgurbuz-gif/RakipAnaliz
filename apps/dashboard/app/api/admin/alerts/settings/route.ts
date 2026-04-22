import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { execute, queryOne } from '@/lib/db'
import { successResponse, handleApiError, getCorsHeaders } from '@/lib/response'

/**
 * Smart Alert (migration 017) settings management.
 *
 * GET → returns the single-row alert_settings record (id=1) along with a
 *       `migrationPending` flag if the table is missing.
 * PUT → validates and upserts the row.
 *
 * Auth: middleware guards /api/admin/* via x-admin-key or admin_session.
 */

const settingsSchema = z.object({
  slack_webhook_url: z.string().nullable().optional(),
  bonus_change_threshold_pct: z.number().min(1).max(100),
  digest_time_hour: z.number().int().min(0).max(23),
  enabled: z.boolean(),
})

interface AlertSettingsRow {
  id: number
  slack_webhook_url: string | null
  bonus_change_threshold_pct: string | number
  digest_time_hour: number
  enabled: number
  updated_at: string | Date | null
}

function asNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

function shapeRow(row: AlertSettingsRow | null) {
  if (!row) {
    return {
      slackWebhookUrl: '',
      bonusChangeThresholdPct: 20,
      digestTimeHour: 9,
      enabled: true,
      updatedAt: null as string | null,
      migrationPending: false,
    }
  }
  return {
    slackWebhookUrl: row.slack_webhook_url ?? '',
    bonusChangeThresholdPct: asNumber(row.bonus_change_threshold_pct),
    digestTimeHour: Number(row.digest_time_hour),
    enabled: Boolean(row.enabled),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : (row.updated_at as string | null),
    migrationPending: false,
  }
}

export async function GET() {
  try {
    let row: AlertSettingsRow | null = null
    try {
      row = await queryOne<AlertSettingsRow>(
        `SELECT id, slack_webhook_url, bonus_change_threshold_pct,
                digest_time_hour, enabled, updated_at
           FROM alert_settings WHERE id = 1`
      )
    } catch {
      return successResponse({
        slackWebhookUrl: '',
        bonusChangeThresholdPct: 20,
        digestTimeHour: 9,
        enabled: true,
        updatedAt: null,
        migrationPending: true,
      })
    }
    return successResponse(shapeRow(row))
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = settingsSchema.parse(body)

    const trimmedUrl = (parsed.slack_webhook_url ?? '').trim()
    const finalUrl = trimmedUrl.length === 0 ? null : trimmedUrl

    if (finalUrl && !/^https:\/\/hooks\.slack\.com\//i.test(finalUrl)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_WEBHOOK_URL',
            message:
              'Slack webhook URL https://hooks.slack.com/ ile başlamalı. Boş bırakılabilir.',
          },
        },
        { status: 400 }
      )
    }

    await execute(
      `INSERT INTO alert_settings
         (id, slack_webhook_url, bonus_change_threshold_pct, digest_time_hour, enabled)
       VALUES (1, $1, $2, $3, $4)
       ON DUPLICATE KEY UPDATE
         slack_webhook_url = VALUES(slack_webhook_url),
         bonus_change_threshold_pct = VALUES(bonus_change_threshold_pct),
         digest_time_hour = VALUES(digest_time_hour),
         enabled = VALUES(enabled)`,
      [finalUrl, parsed.bonus_change_threshold_pct, parsed.digest_time_hour, parsed.enabled ? 1 : 0]
    )

    // Best-effort admin audit trail (admin_logs is optional).
    try {
      const actor = request.headers.get('x-admin-key') ? 'admin:api-key' : 'admin:session'
      const ip =
        request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        null
      // Don't persist the raw webhook URL in the audit log payload.
      const safePayload = {
        bonus_change_threshold_pct: parsed.bonus_change_threshold_pct,
        digest_time_hour: parsed.digest_time_hour,
        enabled: parsed.enabled,
        slack_webhook_url_set: Boolean(finalUrl),
      }
      await execute(
        `INSERT INTO admin_logs (actor, action, resource_type, resource_id, changes, ip)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [actor, 'alert_settings_update', 'alert_settings', '1', JSON.stringify(safePayload), ip]
      )
    } catch {
      /* admin_logs table optional */
    }

    const row = await queryOne<AlertSettingsRow>(
      `SELECT id, slack_webhook_url, bonus_change_threshold_pct,
              digest_time_hour, enabled, updated_at
         FROM alert_settings WHERE id = 1`
    )
    return successResponse(shapeRow(row))
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}
