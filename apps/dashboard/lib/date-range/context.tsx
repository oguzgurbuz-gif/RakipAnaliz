'use client'

/**
 * Global tarih aralığı context'i.
 *
 * Mimari:
 * - Tek bir DateRangeProvider, scope -> StoredRange map'ini tutar.
 * - Her sayfa `useDateRange(scope)` ile kendi scope'unu izole şekilde okur/yazar.
 * - State öncelik sırası (mount sırasında):
 *     1) URL `?from=&to=&preset=`
 *     2) Cookie `daterange_<scope>`
 *     3) Scope-spesifik default (presets.SCOPE_DEFAULT_PRESET)
 * - setRange / applyPreset:
 *     - In-memory state günceller
 *     - Cookie'ye yazar
 *     - URL'i replaceState ile günceller (Next.js refresh tetiklenmez)
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  type DateRangePresetKey,
  detectPreset,
  getPresetRange,
  getScopeDefaultRange,
} from './presets'
import {
  getDateRangeCookie,
  getDateRangeFromUrl,
  setDateRangeCookie,
  setDateRangeInUrl,
  type StoredRange,
} from './persistence'

type ScopeState = StoredRange

type ScopeMap = Record<string, ScopeState>

type DateRangeContextValue = {
  getScopeState: (scope: string) => ScopeState
  hasScope: (scope: string) => boolean
  setScopeRange: (scope: string, from: string, to: string, preset?: DateRangePresetKey) => void
  applyScopePreset: (scope: string, preset: DateRangePresetKey) => void
  resetScope: (scope: string) => void
  /** Provider mount edildikten sonra true — ilk render hydration için. */
  isHydrated: boolean
}

const DateRangeContext = createContext<DateRangeContextValue | null>(null)

export type DateRangeProviderProps = {
  children: ReactNode
  /**
   * SSR sırasında cookie'lerden okunmuş initial map. Layout'ta `cookies()`
   * ile doldurulup geçirilebilir; verilmezse boş map kullanılır ve client
   * mount sonrası hydration ile doldurulur.
   */
  initialScopes?: ScopeMap
}

export function DateRangeProvider({ children, initialScopes }: DateRangeProviderProps) {
  const [scopes, setScopes] = useState<ScopeMap>(initialScopes ?? {})
  const [isHydrated, setIsHydrated] = useState(false)
  // Hangi scope'ların URL parametrelerini "sahiplendiğini" izle. İlk URL okuyan
  // scope, URL'i kendi state'ine bağlar; sonraki scope'lar URL'i ezmez.
  const urlOwnerRef = useRef<string | null>(null)

  // Client mount sonrası hydration flag.
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  const getScopeState = useCallback(
    (scope: string): ScopeState => {
      const existing = scopes[scope]
      if (existing) return existing
      // Henüz hydrate edilmemiş scope için default range döndür ki
      // first-render'da boş string render edilmesin.
      const { range, preset } = getScopeDefaultRange(scope)
      return { from: range.from, to: range.to, preset }
    },
    [scopes]
  )

  const hasScope = useCallback(
    (scope: string): boolean => Object.prototype.hasOwnProperty.call(scopes, scope),
    [scopes]
  )

  const setScopeRange = useCallback(
    (scope: string, from: string, to: string, preset?: DateRangePresetKey) => {
      const resolvedPreset: DateRangePresetKey = preset ?? detectPreset(from, to)
      const next: ScopeState = { from, to, preset: resolvedPreset }
      setScopes((prev) => ({ ...prev, [scope]: next }))
      setDateRangeCookie(scope, next)

      // URL sahipliği yoksa bu scope'a ver. Aksi halde URL'i sadece sahip yazsın.
      if (urlOwnerRef.current === null) {
        urlOwnerRef.current = scope
      }
      if (urlOwnerRef.current === scope) {
        setDateRangeInUrl({ from, to, preset: resolvedPreset })
      }
    },
    []
  )

  const applyScopePreset = useCallback(
    (scope: string, preset: DateRangePresetKey) => {
      const range = getPresetRange(preset)
      setScopeRange(scope, range.from, range.to, preset)
    },
    [setScopeRange]
  )

  const resetScope = useCallback(
    (scope: string) => {
      const { range, preset } = getScopeDefaultRange(scope)
      setScopeRange(scope, range.from, range.to, preset)
    },
    [setScopeRange]
  )

  const value = useMemo<DateRangeContextValue>(
    () => ({
      getScopeState,
      hasScope,
      setScopeRange,
      applyScopePreset,
      resetScope,
      isHydrated,
    }),
    [getScopeState, hasScope, setScopeRange, applyScopePreset, resetScope, isHydrated]
  )

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>
}

export type UseDateRangeResult = {
  from: string
  to: string
  preset: DateRangePresetKey
  setRange: (from: string, to: string) => void
  applyPreset: (preset: DateRangePresetKey) => void
  reset: () => void
  isHydrated: boolean
}

/**
 * Scope-specific tarih aralığı hook'u.
 *
 * Her sayfa farklı bir `scope` (örn: 'calendar', 'campaigns', 'reports',
 * 'admin-audit', 'admin-cost') geçer. Aynı scope farklı sayfalarda da
 * paylaşılabilir, böylece kullanıcı seçimi sayfa geçişinde korunur.
 */
export function useDateRange(scope: string): UseDateRangeResult {
  const ctx = useContext(DateRangeContext)
  if (!ctx) {
    throw new Error('useDateRange must be used within DateRangeProvider')
  }

  const { getScopeState, hasScope, setScopeRange, applyScopePreset, resetScope, isHydrated } = ctx
  const initializedRef = useRef(false)

  // Initial render'da SSR scope state'i var mıydı? Sonradan değişiklikler
  // (cookie/URL) initial bilgisini bozmasın diye ref'te tut.
  const initialHasScopeRef = useRef(false)
  if (!initializedRef.current) {
    initialHasScopeRef.current = hasScope(scope)
  }

  // Scope'un hydration'ı: URL > cookie > default.
  // SSR initialScopes ile zaten gelmişse (state'te scope mevcutsa) URL'i
  // kontrol et — URL varsa onu uygula, yoksa state olduğu gibi kalsın.
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const urlRange = getDateRangeFromUrl()
    if (
      urlRange &&
      typeof urlRange.from === 'string' &&
      typeof urlRange.to === 'string'
    ) {
      const preset =
        urlRange.preset ?? detectPreset(urlRange.from, urlRange.to)
      setScopeRange(scope, urlRange.from, urlRange.to, preset)
      return
    }

    // SSR'den scope geldiyse, daha fazla iş yapma.
    if (initialHasScopeRef.current) return

    const cookieRange = getDateRangeCookie(scope)
    if (cookieRange) {
      setScopeRange(scope, cookieRange.from, cookieRange.to, cookieRange.preset)
      return
    }

    const { range, preset } = getScopeDefaultRange(scope)
    setScopeRange(scope, range.from, range.to, preset)
    // setScopeRange ve scope referansı stabil; effect tek seferlik çalışmalı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  const state = getScopeState(scope)

  const setRange = useCallback(
    (from: string, to: string) => {
      setScopeRange(scope, from, to)
    },
    [scope, setScopeRange]
  )

  const applyPreset = useCallback(
    (preset: DateRangePresetKey) => {
      applyScopePreset(scope, preset)
    },
    [scope, applyScopePreset]
  )

  const reset = useCallback(() => {
    resetScope(scope)
  }, [scope, resetScope])

  return {
    from: state.from,
    to: state.to,
    preset: state.preset,
    setRange,
    applyPreset,
    reset,
    isHydrated,
  }
}

export { DateRangeContext }
