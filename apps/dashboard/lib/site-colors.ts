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
 * Fallback öncelikli site listesi — backend'den `sites.is_priority`
 * yüklenemediğinde devreye girer (örn. SSR / fallback path). Yeni
 * callerlar `makeCompareSitesByPriority(prioritySet)` ile backend'den
 * gelen kümeyi geçirmeli. Bu sabit liste sadece güvenlik ağı.
 */
export const FALLBACK_PRIORITY_SITES = ['bitalih', 'hipodrom', 'atyarisi'] as const

/**
 * Verilen priority set'e göre `Array.sort` ile uyumlu bir comparator
 * üretir. Öncelikli siteler önce gelir, kalanlar alphabetical (tr).
 * Set verilmezse `FALLBACK_PRIORITY_SITES` kullanılır.
 */
export function makeCompareSitesByPriority(
  prioritySet: ReadonlySet<string> = new Set(FALLBACK_PRIORITY_SITES)
): (a: string, b: string) => number {
  return (a, b) => {
    const ai = prioritySet.has(a.toLowerCase())
    const bi = prioritySet.has(b.toLowerCase())
    if (ai && !bi) return -1
    if (!ai && bi) return 1
    return a.localeCompare(b, 'tr')
  }
}

/**
 * Tarihsel API — yeni kullanımlar `makeCompareSitesByPriority` üzerinden
 * gitmeli ki backend `is_priority`'si dynamically ele alınsın.
 */
export function compareSitesByPriority(a: string, b: string): number {
  return makeCompareSitesByPriority()(a, b)
}

/** All known sites, priority-first then alphabetical (tr), for legend rendering. */
export function getSiteColorEntries(): Array<{ code: string; color: string }> {
  return Object.keys(SITE_COLORS)
    .sort(compareSitesByPriority)
    .map((code) => ({ code, color: SITE_COLORS[code] }))
}
