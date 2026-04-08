import { formatDate } from '@/lib/utils'

export function extractBodyDateRange(body: string | null): { start: string | null; end: string | null } {
  if (!body) {
    return { start: null, end: null }
  }

  const matches = [...body.matchAll(/(\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+\d{4}(?:\s*\(saat[:.]?\s*[0-9:.]+\))?)/g)]
    .map((match) => match[1]?.trim())
    .filter(Boolean)

  return {
    start: matches[0] ?? null,
    end: matches[1] ?? null,
  }
}

export function getDateSourceLabel(source: string | null | undefined, fallback: 'stored' | 'body' | 'missing'): string {
  if (source === 'ai') return 'AI'
  if (source === 'manual') return 'Manuel'
  if (source === 'rules') return 'Kural'
  if (source === 'regex') return 'Regex'
  if (source === 'scraper') return 'Scraper'
  if (source) return source
  if (fallback === 'stored') return 'Sistem'
  if (fallback === 'body') return 'Detay metni'
  return 'Belirsiz'
}

export function resolveCampaignDateDisplay(
  dateValue: string | null | undefined,
  source: string | null | undefined,
  body: string | null | undefined,
  side: 'start' | 'end'
): { value: string | null; source: string } {
  const extracted = extractBodyDateRange(body ?? null)
  const bodyValue = side === 'start' ? extracted.start : extracted.end

  if (dateValue) {
    return {
      value: formatDate(dateValue),
      source: getDateSourceLabel(source, 'stored'),
    }
  }

  if (bodyValue) {
    return {
      value: bodyValue,
      source: getDateSourceLabel(source, 'body'),
    }
  }

  return {
    value: null,
    source: getDateSourceLabel(source, 'missing'),
  }
}
