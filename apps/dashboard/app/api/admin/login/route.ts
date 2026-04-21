import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COOKIE_NAME = 'admin_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export async function POST(request: NextRequest) {
  const expectedKey = process.env.ADMIN_API_KEY
  if (!expectedKey) {
    return NextResponse.json(
      { error: 'admin_api_key_not_configured' },
      { status: 500 }
    )
  }

  let providedKey: string | undefined
  try {
    const body = (await request.json()) as { key?: unknown }
    if (typeof body?.key === 'string') {
      providedKey = body.key
    }
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  if (!providedKey) {
    return NextResponse.json({ error: 'missing_key' }, { status: 400 })
  }

  if (!timingSafeEqual(providedKey, expectedKey)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: COOKIE_NAME,
    value: expectedKey,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
  return response
}
