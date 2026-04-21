import { NextRequest, NextResponse } from 'next/server'

/**
 * Admin auth middleware.
 *
 * Protects:
 *   - /api/admin/*  (except /api/admin/login and /api/admin/logout)
 *   - /admin/*      (except /admin/login)
 *
 * Auth modes (any one passes):
 *   - x-admin-key header equal to ADMIN_API_KEY (server-to-server / CI / curl)
 *   - admin_session httpOnly cookie equal to ADMIN_API_KEY (browser session)
 *
 * On failure:
 *   - API path  -> 401 JSON
 *   - UI path   -> 302 redirect to /admin/login?from=<path>
 */

const PUBLIC_API_PATHS = new Set<string>([
  '/api/admin/login',
  '/api/admin/logout',
])

const PUBLIC_UI_PATHS = new Set<string>([
  '/admin/login',
])

function isApiAdminPath(pathname: string): boolean {
  return pathname.startsWith('/api/admin')
}

function isUiAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

function isAuthorized(request: NextRequest, expectedKey: string): boolean {
  const headerKey = request.headers.get('x-admin-key')
  if (headerKey && timingSafeEqual(headerKey, expectedKey)) {
    return true
  }
  const cookieKey = request.cookies.get('admin_session')?.value
  if (cookieKey && timingSafeEqual(cookieKey, expectedKey)) {
    return true
  }
  return false
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  const isApi = isApiAdminPath(pathname)
  const isUi = isUiAdminPath(pathname)

  if (!isApi && !isUi) {
    return NextResponse.next()
  }

  if (isApi && PUBLIC_API_PATHS.has(pathname)) {
    return NextResponse.next()
  }
  if (isUi && PUBLIC_UI_PATHS.has(pathname)) {
    return NextResponse.next()
  }

  const expectedKey = process.env.ADMIN_API_KEY
  if (!expectedKey) {
    // Fail closed if the key is not configured.
    if (isApi) {
      return NextResponse.json(
        { error: 'admin_api_key_not_configured' },
        { status: 500 }
      )
    }
    const url = request.nextUrl.clone()
    url.pathname = '/admin/login'
    url.search = `?error=not_configured&from=${encodeURIComponent(pathname + search)}`
    return NextResponse.redirect(url)
  }

  if (isAuthorized(request, expectedKey)) {
    return NextResponse.next()
  }

  if (isApi) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401 }
    )
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/admin/login'
  loginUrl.search = `?from=${encodeURIComponent(pathname + search)}`
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/api/admin/:path*',
    '/admin/:path*',
  ],
}
