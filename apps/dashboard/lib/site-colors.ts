// Per-site color mapping for the calendar / Gantt views.
// Keys are the canonical `site.code` values used by the scraper adapters.
// Colors are picked to be visually distinct on dark+light themes.
export const SITE_COLORS: Record<string, string> = {
  '4nala':         '#ef4444', // red-500
  altiliganyan:    '#f97316', // orange-500
  atyarisi:        '#f59e0b', // amber-500
  bilyoner:        '#22c55e', // green-500
  birebin:         '#10b981', // emerald-500
  ekuri:           '#06b6d4', // cyan-500
  hipodrom:        '#3b82f6', // blue-500
  misli:           '#6366f1', // indigo-500
  nesine:          '#8b5cf6', // violet-500
  oley:            '#ec4899', // pink-500
  sonduzluk:       '#14b8a6', // teal-500
}

const FALLBACK_COLORS = [
  '#64748b', // slate-500
  '#a16207', // yellow-700
  '#0ea5e9', // sky-500
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

/** All known sites, alphabetical, for legend rendering. */
export function getSiteColorEntries(): Array<{ code: string; color: string }> {
  return Object.keys(SITE_COLORS)
    .sort((a, b) => a.localeCompare(b))
    .map((code) => ({ code, color: SITE_COLORS[code] }))
}
