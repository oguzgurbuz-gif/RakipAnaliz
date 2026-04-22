import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { queryOne } from '@/lib/db'
import { successResponse, handleApiError, getCorsHeaders, errorResponse } from '@/lib/response'

/**
 * Slack webhook test endpoint. Posts a one-off bağlantı testi message so the
 * user can verify the webhook before relying on the real-time pusher.
 *
 * Body (optional): { url: string } — overrides the saved URL. Useful for
 *   testing a draft URL the user hasn't saved yet.
 *
 * Auth: middleware-protected.
 */

const testSchema = z.object({
  url: z.string().url().optional(),
})

interface SettingsRow {
  slack_webhook_url: string | null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = testSchema.parse(body)

    let webhookUrl = (parsed.url ?? '').trim()
    if (!webhookUrl) {
      try {
        const row = await queryOne<SettingsRow>(
          `SELECT slack_webhook_url FROM alert_settings WHERE id = 1`
        )
        webhookUrl = (row?.slack_webhook_url ?? '').trim()
      } catch {
        return errorResponse(
          'MIGRATION_PENDING',
          'alert_settings tablosu yok — migration 017 henüz uygulanmamış.',
          400
        )
      }
    }

    if (!webhookUrl) {
      return errorResponse(
        'NO_WEBHOOK_URL',
        'Slack webhook URL boş. Önce kaydet ya da request body içinde { url } gönder.',
        400
      )
    }

    if (!/^https:\/\/hooks\.slack\.com\//i.test(webhookUrl)) {
      return errorResponse(
        'INVALID_WEBHOOK_URL',
        'Webhook URL https://hooks.slack.com/ ile başlamalı.',
        400
      )
    }

    const slackBody = {
      text: 'RakipAnaliz Smart Alert sistemi: bağlantı testi başarılı.',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*RakipAnaliz · Smart Alert*\nBağlantı testi başarılı. Webhook URL doğru çalışıyor.',
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Test zamanı: ${new Date().toISOString()}`,
            },
          ],
        },
      ],
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackBody),
    })
    const text = await res.text().catch(() => '')

    if (!res.ok) {
      return errorResponse(
        'SLACK_REJECTED',
        `Slack ${res.status}: ${text.slice(0, 200) || 'no body'}`,
        502
      )
    }

    return successResponse({
      ok: true,
      status: res.status,
      message: 'Slack bağlantı testi başarıyla gönderildi.',
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}
