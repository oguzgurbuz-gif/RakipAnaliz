export function normalizeCampaignText(text: string | null | undefined): string {
  if (!text) return '';

  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
}

const INVALID_CAMPAIGN_TITLES = new Set([
  'kampanyalar',
  'güncel kampanyalar',
]);

const INVALID_CAMPAIGN_PATTERNS = [
  /tarayıcı sürümü/i,
  /desteklenmemektedir/i,
  /güncel kampanya bulunmamaktadır/i,
  /giriş yapmak için müşteri hizmetleri/i,
  /"location":"login"/i,
  /users-api/i,
];

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[\s\u00A0]+|[\s\u00A0]+$/g, '')
    .trim();
}

export function normalizeTitle(title: string | null): string {
  if (!title) return '';
  return normalizeWhitespace(title).substring(0, 500);
}

export function normalizeDescription(description: string | null): string | null {
  if (!description) return null;
  const normalized = normalizeWhitespace(description);
  if (normalized.length === 0) return null;
  return normalized.substring(0, 5000);
}

export function cleanBonusText(text: string | null): string | null {
  if (!text) return null;

  return text
    .replace(/[^\d.,]/g, '')
    .replace(/,/g, '.')
    .replace(/\.(?=\d{3})/g, '')
    .trim();
}

export function extractNumericValue(text: string | null): number | null {
  if (!text) return null;

  const cleaned = cleanBonusText(text);
  if (!cleaned) return null;

  const match = cleaned.match(/[\d.]+/);
  if (match) {
    const value = parseFloat(match[0]);
    return isNaN(value) ? null : value;
  }

  return null;
}

export function normalizeCategory(category: string | null): string {
  if (!category) return 'genel';

  const normalized = normalizeWhitespace(category).toLowerCase();

  const categoryMap: Record<string, string> = {
    'sports': 'spor',
    'casino': 'casino',
    'live casino': 'canlı casino',
    'slots': 'slot',
    'poker': 'poker',
    'e-sports': 'e-spor',
    'virtual': 'sanal',
    'lottery': 'piyango',
    '的一般': 'genel',
  };

  return categoryMap[normalized] ?? category.toLowerCase();
}

export function normalizeBadge(badge: string | null): string | null {
  if (!badge) return null;

  const normalized = normalizeWhitespace(badge).toLowerCase();

  const badgeMap: Record<string, string> = {
    'new': 'yeni',
    'hot': 'popüler',
    'exclusive': 'özel',
    'featured': 'öne çıkan',
    'free': 'ücretsiz',
  };

  return badgeMap[normalized] ?? badge;
}

export function normalizeBooleanField(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'evet';
  }
  return false;
}

export function getInvalidCampaignReason(
  title: string | null | undefined,
  description: string | null | undefined
): string | null {
  const normalizedTitle = normalizeCampaignText(title);
  const normalizedDescription = normalizeCampaignText(description);
  const combinedText = `${normalizedTitle} ${normalizedDescription}`.trim();

  if (!normalizedTitle) {
    return 'missing_title';
  }

  if (INVALID_CAMPAIGN_TITLES.has(normalizedTitle)) {
    return 'generic_listing_title';
  }

  for (const pattern of INVALID_CAMPAIGN_PATTERNS) {
    if (pattern.test(combinedText)) {
      return `matched_pattern:${pattern.source}`;
    }
  }

  return null;
}
