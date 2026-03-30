import { logger } from '../utils/logger';

const TURKISH_MONTHS: Record<string, number> = {
  ocak: 1,
  şubat: 2,
  mart: 3,
  nisan: 4,
  mayıs: 5,
  haziran: 6,
  temmuz: 7,
  ağustos: 8,
  eylül: 9,
  ekim: 10,
  kasım: 11,
  aralık: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const DATE_PATTERNS = [
  {
    regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
    parse: (m: RegExpMatchArray) => ({
      day: parseInt(m[1], 10),
      month: parseInt(m[2], 10),
      year: parseInt(m[3], 10),
    }),
  },
  {
    regex: /^(\d{1,2})\s+(\w+)\s+(\d{4})$/,
    parse: (m: RegExpMatchArray) => ({
      day: parseInt(m[1], 10),
      month: TURKISH_MONTHS[m[2].toLowerCase()] ?? parseInt(m[2], 10),
      year: parseInt(m[3], 10),
    }),
  },
  {
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    parse: (m: RegExpMatchArray) => ({
      day: parseInt(m[1], 10),
      month: parseInt(m[2], 10),
      year: parseInt(m[3], 10),
    }),
  },
  {
    regex: /^(\d{4})-(\d{2})-(\d{2})$/,
    parse: (m: RegExpMatchArray) => ({
      year: parseInt(m[1], 10),
      month: parseInt(m[2], 10),
      day: parseInt(m[3], 10),
    }),
  },
  {
    regex: /^(\d{1,2})\s+(\w+)$/,
    parse: (m: RegExpMatchArray) => {
      const now = new Date();
      return {
        day: parseInt(m[1], 10),
        month: TURKISH_MONTHS[m[2].toLowerCase()] ?? now.getMonth() + 1,
        year: now.getFullYear(),
      };
    },
  },
  {
    regex: /^(yesterday|bugün|yarın)$/i,
    parse: (m: RegExpMatchArray) => {
      const now = new Date();
      const offset = m[1].toLowerCase() === 'yesterday' ? -1 : m[1].toLowerCase() === 'yarın' ? 1 : 0;
      now.setDate(now.getDate() + offset);
      return {
        day: now.getDate(),
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      };
    },
  },
];

export function parseDateText(text: string | null | undefined): Date | null {
  if (!text || typeof text !== 'string') return null;

  const cleaned = text
    .trim()
    .replace(/[\u00A0\u2000-\u200B]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  if (cleaned.length === 0) return null;

  if (cleaned.includes('süresiz') || cleaned.includes('belirsiz') || cleaned.includes('forever') || cleaned.includes('indefinite')) {
    return null;
  }

  for (const pattern of DATE_PATTERNS) {
    const match = cleaned.match(pattern.regex);
    if (match) {
      try {
        const { day, month, year } = pattern.parse(match);

        if (month < 1 || month > 12) continue;
        if (day < 1 || day > 31) continue;
        if (year < 1900 || year > 2100) continue;

        const date = new Date(year, month - 1, day);

        if (!isNaN(date.getTime()) && date.getFullYear() === year) {
          return date;
        }
      } catch {
        continue;
      }
    }
  }

  try {
    const direct = new Date(text);
    if (!isNaN(direct.getTime())) {
      return direct;
    }
  } catch {
  }

  return null;
}

export function parseDateRange(startText: string | null, endText: string | null): { startDate: Date | null; endDate: Date | null } {
  const startDate = parseDateText(startText);
  const endDate = parseDateText(endText);

  if (startDate && endDate && startDate > endDate) {
    return { startDate: endDate, endDate: startDate };
  }

  return { startDate, endDate };
}

export function isExpired(endDate: Date | null): boolean {
  if (!endDate) return false;
  return endDate < new Date();
}

export function isPending(startDate: Date | null): boolean {
  if (!startDate) return false;
  return startDate > new Date();
}

export function formatDateForDb(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().split('T')[0];
}

export function formatDateTimeForDb(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString();
}

export function parseFlexibleDate(text: string): Date | null {
  const result = parseDateText(text);
  if (result) return result;

  const relativePatterns: [RegExp, number][] = [
    [/son\s+(\d+)\s+gün/i, -1],
    [/-(\d+)\s+gün/i, -1],
    [/(\d+)\s+gün\s+önce/i, -1],
    [/(\d+)\s+days?\s+ago/i, -1],
  ];

  for (const [regex, multiplier] of relativePatterns) {
    const match = text.match(regex);
    if (match) {
      const days = parseInt(match[1], 10) * multiplier;
      const date = new Date();
      date.setDate(date.getDate() + days);
      return date;
    }
  }

  return null;
}
