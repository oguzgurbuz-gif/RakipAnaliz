import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, execute } from '@/lib/db'
import { successResponse, handleApiError, getCorsHeaders } from '@/lib/response'

/**
 * Wave 1 #1.6 — DeepSeek cost circuit breaker yönetim API'si.
 *
 * GET  → mevcut limit konfigürasyonunu döner (id=1 satırı).
 * PUT  → daily/monthly limit ve pause_on_breach toggle'ını günceller.
 *
 * Middleware tarafından (admin_session veya x-admin-key) zaten korunuyor.
 *
 * NOT: Migration #016 henüz uygulanmadıysa fallback varsayılan değerleri
 * döner; PUT denemesi açık hata mesajıyla başarısız olur.
 */

const limitsSchema = z.object({
  daily_limit_usd: z.number().min(0).max(10000),
  monthly_limit_usd: z.number().min(0).max(100000),
  pause_on_breach: z.boolean(),
})

interface LimitsRow {
  id: number
  daily_limit_usd: string | number
  monthly_limit_usd: string | number
  pause_on_breach: number
  updated_at: string | Date
}

function asNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

export async function GET() {
  try {
    let row: LimitsRow | null = null
    try {
      row = await queryOne<LimitsRow>(
        `SELECT id, daily_limit_usd, monthly_limit_usd, pause_on_breach, updated_at
           FROM ai_cost_limits WHERE id = 1`
      )
    } catch (err) {
      // Tablo yoksa fallback default
      return successResponse({
        dailyLimitUsd: 5,
        monthlyLimitUsd: 100,
        pauseOnBreach: true,
        updatedAt: null,
        migrationPending: true,
      })
    }
    if (!row) {
      return successResponse({
        dailyLimitUsd: 5,
        monthlyLimitUsd: 100,
        pauseOnBreach: true,
        updatedAt: null,
        migrationPending: false,
      })
    }
    return successResponse({
      dailyLimitUsd: asNumber(row.daily_limit_usd),
      monthlyLimitUsd: asNumber(row.monthly_limit_usd),
      pauseOnBreach: Boolean(row.pause_on_breach),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      migrationPending: false,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = limitsSchema.parse(body)

    if (parsed.monthly_limit_usd < parsed.daily_limit_usd) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_LIMITS', message: 'Aylık limit günlük limitten küçük olamaz.' },
        },
        { status: 400 }
      )
    }

    // Upsert id=1
    await execute(
      `INSERT INTO ai_cost_limits (id, daily_limit_usd, monthly_limit_usd, pause_on_breach)
       VALUES (1, $1, $2, $3)
       ON DUPLICATE KEY UPDATE
         daily_limit_usd = VALUES(daily_limit_usd),
         monthly_limit_usd = VALUES(monthly_limit_usd),
         pause_on_breach = VALUES(pause_on_breach)`,
      [parsed.daily_limit_usd, parsed.monthly_limit_usd, parsed.pause_on_breach ? 1 : 0]
    )

    // admin_logs entry — best effort
    try {
      const actor = request.headers.get('x-admin-key') ? 'admin:api-key' : 'admin:session'
      const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null
      await execute(
        `INSERT INTO admin_logs (actor, action, resource_type, resource_id, changes, ip)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          actor,
          'ai_cost_limits_update',
          'ai_cost_limits',
          '1',
          JSON.stringify(parsed),
          ip,
        ]
      )
    } catch {
      /* admin_logs yoksa yut */
    }

    const row = await queryOne<LimitsRow>(
      `SELECT id, daily_limit_usd, monthly_limit_usd, pause_on_breach, updated_at
         FROM ai_cost_limits WHERE id = 1`
    )

    return successResponse({
      dailyLimitUsd: row ? asNumber(row.daily_limit_usd) : parsed.daily_limit_usd,
      monthlyLimitUsd: row ? asNumber(row.monthly_limit_usd) : parsed.monthly_limit_usd,
      pauseOnBreach: row ? Boolean(row.pause_on_breach) : parsed.pause_on_breach,
      updatedAt: row?.updated_at
        ? row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : row.updated_at
        : new Date().toISOString(),
      migrationPending: false,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) })
}
