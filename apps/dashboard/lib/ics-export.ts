// Lightweight RFC 5545 ICS generator for campaign date ranges.
// We intentionally do not depend on the `ics` npm package — calendars are
// simple all-day VEVENTs and the spec is small enough to emit by hand,
// which avoids adding a runtime dep.

export type IcsCampaignInput = {
  id: string
  title: string
  validFrom: string | null
  validTo: string | null
  siteName?: string | null
  category?: string | null
  url?: string | null
}

function escapeIcsText(value: string): string {
  // RFC 5545 §3.3.11: backslash, semicolon, comma must be escaped; CRLF → \n
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** YYYYMMDD for VALUE=DATE all-day events. */
function toIcsDate(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function toIcsTimestamp(d: Date): string {
  // YYYYMMDDTHHMMSSZ in UTC for DTSTAMP.
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

function addDays(input: string | Date, days: number): Date {
  const d = typeof input === 'string' ? new Date(input) : new Date(input)
  d.setDate(d.getDate() + days)
  return d
}

/**
 * Builds an ICS document containing one VEVENT per campaign with a usable
 * start date. Campaigns missing both dates are skipped. Per RFC 5545, an
 * all-day VEVENT's DTEND is exclusive, so we add +1 day.
 */
export function buildCampaignsIcs(campaigns: IcsCampaignInput[]): string {
  const now = new Date()
  const dtstamp = toIcsTimestamp(now)

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RakipAnaliz//Campaign Calendar//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Rakip Analiz - Kampanyalar',
  ]

  for (const c of campaigns) {
    const startSource = c.validFrom ?? c.validTo
    if (!startSource) continue
    const start = toIcsDate(startSource)
    if (!start) continue

    // End date: validTo (inclusive) → +1 day for ICS exclusive DTEND.
    // If only validFrom is known, treat as a 1-day event.
    const endSource = c.validTo ?? c.validFrom
    const endDateExclusive = endSource
      ? toIcsDate(addDays(endSource, 1))
      : toIcsDate(addDays(startSource, 1))

    const summaryParts = [c.siteName, c.title].filter(Boolean) as string[]
    const summary = escapeIcsText(summaryParts.join(' — ') || c.title)
    const descParts = [
      c.category ? `Kategori: ${c.category}` : null,
      c.url ? `URL: ${c.url}` : null,
    ].filter(Boolean) as string[]

    lines.push(
      'BEGIN:VEVENT',
      `UID:campaign-${c.id}@rakipanaliz`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${endDateExclusive}`,
      `SUMMARY:${summary}`,
    )
    if (descParts.length) {
      lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`)
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  // RFC 5545 mandates CRLF line endings.
  return lines.join('\r\n') + '\r\n'
}

/** Triggers a browser download for the given ICS string. SSR-safe no-op. */
export function downloadIcs(filename: string, ics: string): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revoke so Safari can finish the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
