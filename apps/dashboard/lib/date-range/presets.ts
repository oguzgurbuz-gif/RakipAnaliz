/**
 * Tarih aralığı preset'leri ve scope-bazlı default'lar.
 *
 * Tarihler local timezone'da YYYY-MM-DD string olarak döner. Saat bilgisi
 * tutmuyoruz; range'ler "from günü 00:00 → to günü 23:59" olarak yorumlanmalı.
 */

export type DateRangePresetKey =
  | 'today'
  | 'thisWeek'
  | 'thisMonth'
  | 'last7d'
  | 'last30d'
  | 'custom'

export type DateRange = {
  from: string
  to: string
}

export const PRESET_LABELS: Record<Exclude<DateRangePresetKey, 'custom'>, string> = {
  today: 'Bugün',
  thisWeek: 'Bu Hafta',
  thisMonth: 'Bu Ay',
  last7d: 'Son 7 Gün',
  last30d: 'Son 30 Gün',
}

export const PRESET_ORDER: Array<Exclude<DateRangePresetKey, 'custom'>> = [
  'today',
  'thisWeek',
  'thisMonth',
  'last7d',
  'last30d',
]

/**
 * Local timezone'da YYYY-MM-DD formatına çevir.
 * (date.toISOString() UTC çeviriyor, biz local istiyoruz.)
 */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * "Bu Hafta" Pazartesi başlangıçlı (TR locale).
 * JS getDay() Pazar=0, Pzt=1, ..., Cmt=6.
 */
function getWeekStart(date: Date): Date {
  const day = date.getDay()
  // Pazar (0) ise 6 gün geri, diğer günler için (day - 1) gün geri.
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(date)
  monday.setDate(date.getDate() - diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date)
  const sunday = new Date(start)
  sunday.setDate(start.getDate() + 6)
  return sunday
}

/**
 * Verilen preset için `{from, to}` döndürür. 'custom' için bugünü döner —
 * çağıranların 'custom' için kendi range'ini koruması beklenir.
 */
export function getPresetRange(preset: DateRangePresetKey, now: Date = new Date()): DateRange {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  switch (preset) {
    case 'today': {
      const iso = toIsoDate(today)
      return { from: iso, to: iso }
    }
    case 'thisWeek': {
      return {
        from: toIsoDate(getWeekStart(today)),
        to: toIsoDate(getWeekEnd(today)),
      }
    }
    case 'thisMonth': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1)
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      return { from: toIsoDate(first), to: toIsoDate(last) }
    }
    case 'last7d': {
      const from = new Date(today)
      from.setDate(today.getDate() - 6) // bugün dahil 7 gün
      return { from: toIsoDate(from), to: toIsoDate(today) }
    }
    case 'last30d': {
      const from = new Date(today)
      from.setDate(today.getDate() - 29) // bugün dahil 30 gün
      return { from: toIsoDate(from), to: toIsoDate(today) }
    }
    case 'custom':
    default: {
      const iso = toIsoDate(today)
      return { from: iso, to: iso }
    }
  }
}

/**
 * Verilen `from`/`to`'nun bilinen bir preset'e karşılık gelip gelmediğini
 * tespit eder. Eşleşme yoksa 'custom' döner.
 */
export function detectPreset(from: string, to: string, now: Date = new Date()): DateRangePresetKey {
  for (const key of PRESET_ORDER) {
    const range = getPresetRange(key, now)
    if (range.from === from && range.to === to) {
      return key
    }
  }
  return 'custom'
}

/**
 * Scope-spesifik default preset'ler. Bağlanmamış scope'lar için 'today'.
 */
export const SCOPE_DEFAULT_PRESET: Record<string, Exclude<DateRangePresetKey, 'custom'>> = {
  home: 'thisWeek',
  calendar: 'thisMonth',
  campaigns: 'thisMonth',
  competition: 'thisMonth',
  reports: 'thisWeek',
  'admin-audit': 'today',
  'admin-cost': 'last30d',
  'insights-bonus': 'last30d',
}

export function getScopeDefaultPreset(scope: string): Exclude<DateRangePresetKey, 'custom'> {
  return SCOPE_DEFAULT_PRESET[scope] ?? 'today'
}

export function getScopeDefaultRange(scope: string, now: Date = new Date()): {
  range: DateRange
  preset: Exclude<DateRangePresetKey, 'custom'>
} {
  const preset = getScopeDefaultPreset(scope)
  return { range: getPresetRange(preset, now), preset }
}
