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
  'kampanya bulunmamaktadır',
]);

// Patterns checked against TITLE only (nav in title = definitely garbage)
const INVALID_TITLE_PATTERNS_ONLY = [
  /tarayıcı sürümü/i,
  /desteklenmemektedir/i,
  /güncel kampanya bulunmamaktadır/i,
  /giriş yapmak için müşteri hizmetleri/i,
  /"location":"login"/i,
  /users-api/i,
  /şifremi unuttum/i,
  /kullanım şartları/i,
  /kvkk|kişisel veriler/i,
  /çerez politikası|çerezler/i,
  /gizlilik politikası/i,
  /hakkımızda/i,
  /iletişim|bize ulaşın/i,
  /yardım|destek|müşteri hizmetleri/i,
  /sıkça sorulan sorular|sss/i,
  /sponsorluklarımız/i,
  /tüm hakları saklıdır|copyright/i,
  /mobil uygulama|app store|google play/i,
  /disruptor|company|customer|success/i,
  /project or initiative/i,
  /\+18.*yaşından/i,
  /nespor|toto ve milli/i,
];

// Patterns checked against DESCRIPTION only (nav in body might be page chrome, not garbage)
// Only reject if body is SHORT (< 500 chars) AND matches these patterns
// (long body = real content, short body = might be nav page)
const INVALID_BODY_PATTERNS_ONLY = [
  /para yatırma|para çekme/i,   // Common in site navigation, but only if body is short
  /spor toto|iddaa/i,           // Nav menus, but only if body is short
  /canlı maç/i,                 // Navigation, but only if body is short
  / sosyal medya/i,             // Footer social links, but only if body is short
  /zorunlu çerezler|pazarlama çerezleri|analitik çerezler/i, // Cookie banners, only if body is short
];

// Titles that are too short or too generic to be real campaigns
const INVALID_TITLE_PATTERNS = [
  /^.{0,3}$/,           // Too short (1-3 chars)
  /^[\s\-+]+$/,         // Only symbols
  /^(home|index|main)$/i,
  /^[\d\s]+$/,          // Only numbers and spaces
];

// Content length thresholds
const MIN_CAMPAIGN_BODY_LENGTH = 10;       // Too short = garbage
const MAX_CAMPAIGN_BODY_LENGTH = 50000;    // Too long = page content
const MIN_CAMPAIGN_TITLE_LENGTH = 4;       // Title too short = garbage

// Campaign title indicators - these suggest it's a REAL campaign
const CAMPAIGN_TITLE_POSITIVE_PATTERNS = [
  /%[\d\s]*(bonus|ek|iade)/i,
  /(tl|eur|usd|₺)\s*[\d.,]+/i,
  /\b\d+\s*(gün|ay|hafta)/i,
  /%[\d]+\s*(ek|bonus|iade)/i,
  /(bedava|ücretsiz|cretsiz)/i,
  /\$\s*[\d,]+/,
  /[\d,]+\s*(bonus|ek|bedava)/i,
];

// Non-campaign indicators in title - these suggest it's NOT a real campaign
const CAMPAIGN_TITLE_NEGATIVE_PATTERNS = [
  /copyright|tüm hakları/i,
  /\|.*\|.*\|/,  // Multiple pipe separators = navigation
  /\s{5,}/,      // Multiple consecutive spaces
  /^[\d\s\-\+\.]+$/,  // Only numbers and symbols
  /(güncelleme|güncellendi|değişti)/i,
];

export function isLikelyRealCampaignTitle(title: string): boolean {
  if (!title || title.length < MIN_CAMPAIGN_TITLE_LENGTH) {
    return false;
  }

  // Check negative patterns first - only reject clearly fake titles
  for (const pattern of CAMPAIGN_TITLE_NEGATIVE_PATTERNS) {
    if (pattern.test(title)) {
      return false;
    }
  }

  // Title length check - real campaigns are usually between 4-150 chars
  if (title.length > 150) {
    return false;
  }

  // Reject titles that are only numbers and symbols
  const hasLetters = /[a-zA-ZÇçĞğıİÖöŞşÜü]/.test(title);
  if (!hasLetters) {
    return false;
  }

  // Accept any title that passes the above checks
  return true;
}

export function extractLikelyTitleFromElement(elementText: string): string | null {
  if (!elementText) return null;

  // Split by common delimiters and find the longest meaningful segment
  const segments = elementText
    .split(/[\n\r\t|]+/)
    .map(s => s.trim())
    .filter(s => s.length >= MIN_CAMPAIGN_TITLE_LENGTH && s.length <= 200);

  if (segments.length === 0) return null;

  // Find the first segment that looks like a campaign title
  for (const segment of segments) {
    if (isLikelyRealCampaignTitle(segment)) {
      return segment;
    }
  }

  // If no segment passes the check, return the longest one that's reasonable
  const longestSegment = segments.reduce((a, b) => a.length > b.length ? a : b);
  if (longestSegment.length >= 10) {
    return longestSegment;
  }

  return null;
}

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

  if (normalizedTitle.length < MIN_CAMPAIGN_TITLE_LENGTH) {
    return 'title_too_short';
  }

  if (INVALID_CAMPAIGN_TITLES.has(normalizedTitle)) {
    return 'generic_listing_title';
  }

  // Check title-only patterns (nav/garbage patterns that appear in title = definitely fake)
  for (const pattern of [...INVALID_TITLE_PATTERNS, ...INVALID_TITLE_PATTERNS_ONLY]) {
    if (pattern.test(normalizedTitle)) {
      return `invalid_title_pattern:${pattern.source}`;
    }
  }

  // Check body-only patterns (nav links in detail page body are normal page chrome,
  // but if they appear prominently in body, it might still be a nav page)
  // Only reject if body is SHORT (< 500 chars) - long body means real content
  if (normalizedDescription && normalizedDescription.length < 500) {
    for (const pattern of INVALID_BODY_PATTERNS_ONLY) {
      if (pattern.test(normalizedDescription)) {
        return `matched_pattern:${pattern.source}`;
      }
    }
  }

  // Check body length constraints
  if (normalizedDescription) {
    if (normalizedDescription.length < MIN_CAMPAIGN_BODY_LENGTH) {
      return 'description_too_short';
    }
    if (normalizedDescription.length > MAX_CAMPAIGN_BODY_LENGTH) {
      return 'description_too_long';
    }
  }

  return null;
}
