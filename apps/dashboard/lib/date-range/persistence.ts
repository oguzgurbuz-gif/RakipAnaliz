/**
 * Cookie ve URL persistence helper'ları.
 *
 * Cookie format: `daterange_<scope>` value: `<from>|<to>|<preset>`
 * URL format: `?from=YYYY-MM-DD&to=YYYY-MM-DD&preset=<key>` (preset opsiyonel)
 *
 * Sadece browser'da çalışmak üzere yazıldı; SSR'de cookie okumak için
 * Next.js'in `cookies()` API'si kullanılmalı (bkz. context.tsx).
 */

import {
  type DateRange,
  type DateRangePresetKey,
  detectPreset,
} from './presets'

export const COOKIE_PREFIX = 'daterange_'
export const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 // 1 yıl

export type StoredRange = {
  from: string
  to: string
  preset: DateRangePresetKey
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === 'string' && ISO_DATE.test(value)
}

function isPresetKey(value: string | null | undefined): value is DateRangePresetKey {
  return (
    value === 'today' ||
    value === 'thisWeek' ||
    value === 'thisMonth' ||
    value === 'last7d' ||
    value === 'last30d' ||
    value === 'custom'
  )
}

export function cookieKey(scope: string): string {
  return `${COOKIE_PREFIX}${scope}`
}

export function encodeCookieValue(range: StoredRange): string {
  return `${range.from}|${range.to}|${range.preset}`
}

export function decodeCookieValue(raw: string | null | undefined): StoredRange | null {
  if (!raw) return null
  const decoded = (() => {
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  })()
  const parts = decoded.split('|')
  if (parts.length < 2) return null
  const [from, to, presetRaw] = parts
  if (!isIsoDate(from) || !isIsoDate(to)) return null
  const preset = isPresetKey(presetRaw) ? presetRaw : detectPreset(from, to)
  return { from, to, preset }
}

// ---- Browser cookie helpers (no SSR) ---------------------------------------

function readDocumentCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const target = `${name}=`
  const parts = document.cookie ? document.cookie.split('; ') : []
  for (const part of parts) {
    if (part.startsWith(target)) {
      return part.slice(target.length)
    }
  }
  return null
}

export function getDateRangeCookie(scope: string): StoredRange | null {
  const raw = readDocumentCookie(cookieKey(scope))
  return decodeCookieValue(raw)
}

export function setDateRangeCookie(scope: string, range: StoredRange): void {
  if (typeof document === 'undefined') return
  const value = encodeURIComponent(encodeCookieValue(range))
  document.cookie = `${cookieKey(scope)}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
}

// ---- URL helpers (browser only) --------------------------------------------

export function getDateRangeFromUrl(search?: string): Partial<StoredRange> | null {
  if (typeof window === 'undefined' && !search) return null
  const source = search ?? window.location.search
  const params = new URLSearchParams(source)
  const from = params.get('from')
  const to = params.get('to')
  const presetRaw = params.get('preset')
  if (!isIsoDate(from) || !isIsoDate(to)) return null
  const preset = isPresetKey(presetRaw) ? presetRaw : detectPreset(from, to)
  return { from, to, preset }
}

/**
 * URL'i replaceState ile günceller — Next.js router refresh tetiklemez,
 * sadece adres çubuğu/history kaydını günceller. React state ayrıca
 * provider tarafından zaten yönetiliyor.
 */
export function setDateRangeInUrl(range: DateRange & { preset?: DateRangePresetKey }): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.set('from', range.from)
  url.searchParams.set('to', range.to)
  if (range.preset) {
    url.searchParams.set('preset', range.preset)
  } else {
    url.searchParams.delete('preset')
  }
  window.history.replaceState(window.history.state, '', url.toString())
}
