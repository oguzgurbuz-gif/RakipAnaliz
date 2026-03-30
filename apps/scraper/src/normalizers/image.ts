export function toAbsoluteUrl(baseUrl: string, relativePath: string | null | undefined): string | null {
  if (!relativePath || typeof relativePath !== 'string') return null;

  if (relativePath.length === 0) return null;

  if (relativePath.startsWith('data:') || relativePath.startsWith('javascript:')) {
    return null;
  }

  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }

  if (relativePath.startsWith('//')) {
    return `https:${relativePath}`;
  }

  if (relativePath.startsWith('/')) {
    try {
      const base = new URL(baseUrl);
      return `${base.origin}${relativePath}`;
    } catch {
      return null;
    }
  }

  try {
    const base = new URL(baseUrl);
    const basePath = base.pathname.replace(/[^/]*$/, '');
    return `${base.origin}${basePath}${relativePath}`;
  } catch {
    return null;
  }
}

export function normalizeImageUrl(baseUrl: string, imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;

  const cleaned = imageUrl.trim();

  if (cleaned.length === 0) return null;

  const cleanedLower = cleaned.toLowerCase();

  if (cleanedLower.startsWith('http://') || cleanedLower.startsWith('https://')) {
    return cleaned;
  }

  if (cleanedLower.startsWith('//')) {
    return `https:${cleaned}`;
  }

  if (cleanedLower.startsWith('/')) {
    try {
      const base = new URL(baseUrl);
      return `${base.origin}${cleaned}`;
    } catch {
      return null;
    }
  }

  try {
    const base = new URL(baseUrl);
    const basePath = base.pathname.replace(/[^/]*$/, '');
    return `${base.origin}${basePath}${cleaned}`;
  } catch {
    return null;
  }
}

export function isValidImageUrl(url: string | null): boolean {
  if (!url) return false;

  const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif', '.apng'];
  const lowerUrl = url.toLowerCase();

  return (
    lowerUrl.startsWith('https://') &&
    (validExtensions.some((ext) => lowerUrl.includes(ext)) ||
      lowerUrl.includes('/images/') ||
      lowerUrl.includes('/img/') ||
      lowerUrl.includes('/assets/'))
  );
}

export function extractImageDimensions(url: string): { width: number | null; height: number | null } {
  const dimensionPatterns = [
    /-(\d+)x(\d+)\./,
    /_(\d+)x(\d+)_/,
    /w(\d+)h(\d+)/,
    /(\d+)x(\d+)/,
  ];

  for (const pattern of dimensionPatterns) {
    const match = url.match(pattern);
    if (match) {
      return {
        width: parseInt(match[1], 10),
        height: parseInt(match[2], 10),
      };
    }
  }

  return { width: null, height: null };
}

export function pickBestImage(urls: string[]): string | null {
  if (urls.length === 0) return null;

  const validUrls = urls.filter(isValidImageUrl);
  if (validUrls.length === 0) return null;

  const withDimensions = validUrls
    .map((url) => ({ url, ...extractImageDimensions(url) }))
    .filter((item) => item.width !== null && item.height !== null && item.width! >= 200 && item.height! >= 150);

  if (withDimensions.length > 0) {
    const sorted = withDimensions.sort((a, b) => (b.width! * b.height!) - (a.width! * a.height!));
    return sorted[0].url;
  }

  return validUrls[0];
}
