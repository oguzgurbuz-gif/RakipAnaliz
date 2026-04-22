// Per-site color mapping for the calendar / Gantt views.
// Keys are the canonical `site.code` values used by the scraper adapters.
// Renkler at-yarışı odaklı 3 öncelikli site için sabit (mavi/kırmızı/turuncu)
// olacak şekilde seçildi; geri kalanlar görsel olarak ayırt edilebilir
// kalibrasyonda. Hex değerleri Tailwind 500 paletinden geliyor.
export const SITE_COLORS: Record<string, string> = {
  // Öncelikli 3 site — kullanıcı talimatı: sabit, ayırt edilebilir.
  bitalih:         '#3b82f6', // blue-500
  hipodrom:        '#ef4444', // red-500
  atyarisi:        '#f59e0b', // amber-500
  // Diğer aktif siteler — çakışmayan, dağıtılmış renkler.
  misli:           '#10b981', // emerald-500
  sonduzluk:       '#8b5cf6', // violet-500
  altiliganyan:    '#ec4899', // pink-500
  ekuri:           '#14b8a6', // teal-500
  // Geri kalan siteler (legacy / tali) — yine ayırt edilebilir tonlar.
  '4nala':         '#f97316', // orange-500
  bilyoner:        '#22c55e', // green-500
  birebin:         '#6366f1', // indigo-500
  nesine:          '#a855f7', // purple-500
  oley:            '#0ea5e9', // sky-500
}

const FALLBACK_COLORS = [
  '#64748b', // slate-500
  '#a16207', // yellow-700
  '#84cc16', // lime-500
  '#d946ef', // fuchsia-500
  '#f43f5e', // rose-500
]

/** Stable hash → fallback color for unknown site codes. */
function hashCode(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/** Returns hex color for a site code, falling back to a stable hash bucket. */
export function getSiteColor(code: string | null | undefined): string {
  if (!code) return '#94a3b8' // slate-400
  const known = SITE_COLORS[code]
  if (known) return known
  return FALLBACK_COLORS[hashCode(code) % FALLBACK_COLORS.length]
}

/**
 * Öncelikli siteler — Gantt accordion'ları, OverlapHeatmap satırları ve
 * Site Renk Lejantı bu sırada başlatılır. Kalan siteler alphabetical (tr)
 * olarak eklenir.
 */
export const PRIORITY_SITES = ['bitalih', 'hipodrom', 'atyarisi'] as const

/**
 * `compareSitesByPriority(a, b)` — `Array.sort` ile uyumlu comparator.
 * Önce öncelikli site listesi sırasında, sonra alphabetical (tr).
 */
export function compareSitesByPriority(a: string, b: string): number {
  const ai = PRIORITY_SITES.indexOf(a.toLowerCase() as (typeof PRIORITY_SITES)[number])
  const bi = PRIORITY_SITES.indexOf(b.toLowerCase() as (typeof PRIORITY_SITES)[number])
  if (ai === -1 && bi === -1) return a.localeCompare(b, 'tr')
  if (ai === -1) return 1
  if (bi === -1) return -1
  return ai - bi
}

/** All known sites, priority-first then alphabetical (tr), for legend rendering. */
export function getSiteColorEntries(): Array<{ code: string; color: string }> {
  return Object.keys(SITE_COLORS)
    .sort(compareSitesByPriority)
    .map((code) => ({ code, color: SITE_COLORS[code] }))
}
