import { parseDateText, parseFlexibleDate } from '../normalizers/date';
import { logger } from '../utils/logger';

export interface DateExtractionRule {
  pattern: RegExp;
  extract: (match: RegExpMatchArray, context?: string) => Date | null;
  priority: number;
  examples: string[];
}

export interface ExtractionResult {
  startDate: Date | null;
  endDate: Date | null;
  confidence: number;
  matchedRule: string | null;
  rawTexts: { start: string | null; end: string | null };
}

const TURKISH_MONTHS = 'Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık';
const TURKISH_MONTHS_SHORT = 'Oca|Şub|Mar|Nis|May|Haz|Tem|Ağu|Eyl|Eki|Kas|Ara';

const DATE_RANGE_RULES: DateExtractionRule[] = [
  {
    pattern: /(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4})\s*[–-]\s*(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4})/,
    extract: (m) => {
      const start = parseDateText(m[1]);
      const end = parseDateText(m[2]);
      if (start && end) {
        return start;
      }
      return end;
    },
    priority: 100,
    examples: ['01.01.2024 - 31.12.2024', '15/03/2024 - 20/03/2024'],
  },
  {
    pattern: /(\d{1,2}\s+(${TURKISH_MONTHS})\s+\d{4})\s*[–-]\s*(\d{1,2}\s+(${TURKISH_MONTHS})\s+\d{4})/i,
    extract: (m) => parseDateText(m[1]),
    priority: 95,
    examples: ['1 Ocak 2024 - 31 Aralık 2024', '20 Mart - 31 Mart 2026'],
  },
  {
    pattern: /(\d{1,2}\s+(${TURKISH_MONTHS})\s+\d{4})\s*[–-]\s*(\d{1,2}\s+(${TURKISH_MONTHS_SHORT})\.?\s+\d{4})/i,
    extract: (m) => parseDateText(m[1]),
    priority: 94,
    examples: ['1 Ocak 2026 - 31 Ara 2026'],
  },
  {
    pattern: /(\d{1,2}\.\d{1,2}\.)\s*(\d{4})?\s*[–-]\s*(\d{1,2}\.\d{1,2}\.)\s*(\d{4})?/,
    extract: (m) => parseDateText(m[1] + (m[2] || new Date().getFullYear().toString())),
    priority: 85,
    examples: ['01.01. - 31.12. 2024'],
  },
  {
    pattern: /(${TURKISH_MONTHS})\s+(\d{1,2})\s*[-–]\s*(${TURKISH_MONTHS})\s+(\d{1,2}),?\s*(\d{4})/i,
    extract: (m) => {
      const monthMap: Record<string, number> = {
        'Ocak': 0, 'Şubat': 1, 'Mart': 2, 'Nisan': 3, 'Mayıs': 4, 'Haziran': 5,
        'Temmuz': 6, 'Ağustos': 7, 'Eylül': 8, 'Ekim': 9, 'Kasım': 10, 'Aralık': 11,
        'Oca': 0, 'Şub': 1, 'Mar': 2, 'Nis': 3, 'May': 4, 'Haz': 5,
        'Tem': 6, 'Ağu': 7, 'Eyl': 8, 'Eki': 9, 'Kas': 10, 'Ara': 11,
      };
      const month = monthMap[m[1]];
      const day = parseInt(m[2], 10);
      const year = parseInt(m[5], 10);
      if (month !== undefined && day && year) {
        return new Date(year, month, day);
      }
      return null;
    },
    priority: 92,
    examples: ['Ocak 1 - Aralık 31, 2026', 'Mart 20 - Mart 31 2026'],
  },
];

const RELATIVE_DATE_RULES: DateExtractionRule[] = [
  {
    pattern: /(\d+)\s*(gün|day|days|hafta|week|weeks)\s*(önce|ago|sonra|later)?/i,
    extract: (m) => {
      const value = parseInt(m[1], 10);
      const unit = m[2].toLowerCase();
      const direction = m[3]?.toLowerCase();

      const isPast = direction === 'önce' || direction === 'ago' || !direction;
      const multiplier = isPast ? -1 : 1;

      let days = 0;
      if (unit.startsWith('gün') || unit.startsWith('day')) {
        days = value;
      } else if (unit.startsWith('hafta') || unit.startsWith('week')) {
        days = value * 7;
      }

      const date = new Date();
      date.setDate(date.getDate() + days * multiplier);
      return date;
    },
    priority: 50,
    examples: ['30 gün önce', '7 days ago', '2 hafta sonra'],
  },
  {
    pattern: /(yarın|yesterday|bugün|tomorrow|today)\b/i,
    extract: (m) => {
      const term = m[1].toLowerCase();
      const date = new Date();

      if (term === 'yesterday' || term === 'yarın') {
        date.setDate(date.getDate() - 1);
      } else if (term === 'tomorrow' || term === 'yarın' && false) {
        date.setDate(date.getDate() + 1);
      }

      return date;
    },
    priority: 40,
    examples: ['bugün', 'yarın', 'yesterday'],
  },
  {
    pattern: /(ay\s*sonuna\s*kadar|hafta\s*sonuna\s*kadar|bu\s*ay\s*içinde)/i,
    extract: (m) => {
      const term = m[1].toLowerCase();
      const date = new Date();

      if (term.includes('ay') && term.includes('son')) {
        date.setMonth(date.getMonth() + 1, 0);
      } else if (term.includes('hafta') && term.includes('son')) {
        const dayOfWeek = date.getDay();
        const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
        date.setDate(date.getDate() + daysUntilSunday);
      } else if (term.includes('bu ay')) {
        date.setMonth(date.getMonth() + 1, 0);
      }

      return date;
    },
    priority: 45,
    examples: ['ay sonuna kadar', 'hafta sonuna kadar', 'bu ay içinde'],
  },
  {
    pattern: /(\d+)\s*gün\s*(geçerli|süreyle)/i,
    extract: (m) => {
      const days = parseInt(m[1], 10);
      const date = new Date();
      date.setDate(date.getDate() + days);
      return date;
    },
    priority: 35,
    examples: ['30 gün geçerli', '7 gün süreyle'],
  },
];

const STANDALONE_DATE_RULES: DateExtractionRule[] = [
  {
    pattern: /geçerlilik\s*:?\s*(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4})/i,
    extract: (m) => parseDateText(m[1]),
    priority: 80,
    examples: ['Geçerlilik: 31.12.2024'],
  },
  {
    pattern: /son\s*kullanma\s*:?\s*(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4})/i,
    extract: (m) => parseDateText(m[1]),
    priority: 80,
    examples: ['Son kullanma: 31.12.2024'],
  },
  {
    pattern: /kampanya\s+(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4})\s*[-–]\s*(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4})/i,
    extract: (m) => parseDateText(m[1]),
    priority: 90,
    examples: ['Kampanya 01.01.2024-31.12.2024'],
  },
];

const KAMPANYA_KEYWORDS: RegExp[] = [
  /kampanya(?:sı|da|dan)?\s*:?\s*([\s\S]*?)(?:bitti|sona\s*erdi|süresi|durumu|$)/i,
  /geçerli\s*:?\s*([\s\S]*?)(?:kadar|etmez|$)/i,
  /başlangıç\s*:?\s*([\s\S]*?)(?:,\s*bitiş|bitti|$)/i,
];

export function extractDatesFromText(text: string): ExtractionResult {
  if (!text || typeof text !== 'string') {
    return {
      startDate: null,
      endDate: null,
      confidence: 0,
      matchedRule: null,
      rawTexts: { start: null, end: null },
    };
  }

  const cleanedText = text
    .replace(/\s+/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .trim();

  for (const rule of DATE_RANGE_RULES) {
    const match = cleanedText.match(rule.pattern);
    if (match) {
      const startDate = parseDateText(match[1]);
      const endDate = parseDateText(match[2]);

      if (startDate || endDate) {
        return {
          startDate,
          endDate,
          confidence: 0.9,
          matchedRule: rule.pattern.source,
          rawTexts: { start: match[1] || null, end: match[2] || null },
        };
      }
    }
  }

  for (const rule of STANDALONE_DATE_RULES) {
    const match = cleanedText.match(rule.pattern);
    if (match) {
      const date = rule.extract(match);
      if (date) {
        return {
          startDate: null,
          endDate: date,
          confidence: 0.85,
          matchedRule: rule.pattern.source,
          rawTexts: { start: null, end: match[1] || null },
        };
      }
    }
  }

  for (const rule of RELATIVE_DATE_RULES) {
    const match = cleanedText.match(rule.pattern);
    if (match) {
      const date = rule.extract(match);
      if (date) {
        return {
          startDate: date,
          endDate: null,
          confidence: 0.6,
          matchedRule: rule.pattern.source,
          rawTexts: { start: match[0], end: null },
        };
      }
    }
  }

  const combinedText = cleanedText + ' ' + cleanedText;
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  for (const keyword of KAMPANYA_KEYWORDS) {
    const match = combinedText.match(keyword);
    if (match && match[1]) {
      const extracted = parseFlexibleDate(match[1]);
      if (extracted) {
        if (!endDate) {
          endDate = extracted;
        } else if (!startDate) {
          startDate = extracted;
        }
      }
    }
  }

  if (endDate || startDate) {
    return {
      startDate,
      endDate,
      confidence: 0.5,
      matchedRule: 'KAMPANYA_KEYWORDS',
      rawTexts: { start: startDate?.toISOString() ?? null, end: endDate?.toISOString() ?? null },
    };
  }

  const standaloneDateMatch = cleanedText.match(/\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4}/);
  if (standaloneDateMatch) {
    const date = parseDateText(standaloneDateMatch[0]);
    if (date) {
      return {
        startDate: null,
        endDate: date,
        confidence: 0.4,
        matchedRule: 'STANDALONE_DATE',
        rawTexts: { start: null, end: standaloneDateMatch[0] },
      };
    }
  }

  return {
    startDate: null,
    endDate: null,
    confidence: 0,
    matchedRule: null,
    rawTexts: { start: null, end: null },
  };
}

export function extractDatesFromCampaignText(
  title: string,
  description: string | null,
  rawDateText?: string | null
): ExtractionResult {
  const textParts: string[] = [];

  if (title && typeof title === 'string') {
    textParts.push(title);
  }

  if (description && typeof description === 'string') {
    textParts.push(description);
  }

  if (rawDateText && typeof rawDateText === 'string') {
    textParts.push(rawDateText);
  }

  const combinedText = textParts.join(' | ');

  return extractDatesFromText(combinedText);
}

export function extractDatesFromTerms(termsText: string | null): ExtractionResult {
  if (!termsText) {
    return {
      startDate: null,
      endDate: null,
      confidence: 0,
      matchedRule: null,
      rawTexts: { start: null, end: null },
    };
  }

  return extractDatesFromText(termsText);
}

export function needsAiExtraction(result: ExtractionResult): boolean {
  return result.confidence < 0.7 && result.endDate === null;
}

export function mergeExtractionResults(results: ExtractionResult[]): ExtractionResult {
  let bestStartDate: Date | null = null;
  let bestEndDate: Date | null = null;
  let highestConfidence = 0;
  let matchedRule: string | null = null;

  for (const result of results) {
    if (result.confidence > highestConfidence) {
      if (result.startDate) bestStartDate = result.startDate;
      if (result.endDate) bestEndDate = result.endDate;
      highestConfidence = result.confidence;
      matchedRule = result.matchedRule;
    }

    if (!bestEndDate && result.endDate) {
      bestEndDate = result.endDate;
    }
    if (!bestStartDate && result.startDate) {
      bestStartDate = result.startDate;
    }
  }

  return {
    startDate: bestStartDate,
    endDate: bestEndDate,
    confidence: highestConfidence,
    matchedRule,
    rawTexts: { start: bestStartDate?.toISOString() ?? null, end: bestEndDate?.toISOString() ?? null },
  };
}
