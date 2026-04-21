import { Page } from 'puppeteer';
import { BaseAdapter } from './base';
import { RawCampaignCard, NormalizedCampaignInput } from '../types';
import { buildFingerprint, buildRawFingerprint } from '../normalizers/fingerprint';
import { extractNumericValue, isLikelyRealCampaignTitle } from '../normalizers/text';
import { normalizeImageUrl } from '../normalizers/image';
import { extractDatesFromCampaignText } from '../date-extraction/parser';
import { logger } from '../utils/logger';

export class MisliAdapter extends BaseAdapter {
  private static readonly SITE_CODE = 'misli';
  private static readonly BASE_URL = 'https://www.misli.com';
  // Misli's /kampanyalar typically renders "Güncel Kampanyalar 0" with no cards;
  // archived campaigns under /kampanyalar/gecmis use the same DOM (campaignItem,
  // campaignTitle, campaignDate, campaignBtn) and reliably contain entries.
  public readonly campaignsUrl = 'https://www.misli.com/kampanyalar/gecmis';

  protected readonly selectors = {
    campaignCard: '.campaignItem',
    campaignTitle: [
      '[class*="title"]',
      '[class*="campaignTitle"]',
      'h1', 'h2', 'h3', 'h4',
    ].join(', '),
    campaignDescription: [
      '[class*="description"]',
      '[class*="desc"]',
      '[class*="detail"]',
      '[class*="campaignDetail"]',
      '[class*="date"]',
      'p',
    ].join(', '),
    bonusAmount: [
      '[class*="amount"]',
      '[class*="value"]',
      '[class*="bonus"]',
    ].join(', '),
    bonusPercentage: [
      '[class*="percent"]',
      '[class*="rate"]',
    ].join(', '),
    minDeposit: [
      '[class*="min"]',
      '[class*="deposit"]',
    ].join(', '),
    code: [
      '[class*="code"]',
      '[class*="coupon"]',
      '[class*="btn"]',
    ].join(', '),
    campaignUrl: 'a[href]',
    campaignImage: 'img[class*="image"], [class*="img"] img, [class*="picture"] img, picture img',
    startDate: '[class*="start"], [class*="date"]',
    endDate: '[class*="end"], [class*="date"]',
    termsUrl: 'a[href*="kosul"], a[href*="sart"], a[href*="terms"]',
    category: '[class*="category"], [class*="type"]',
    badge: '[class*="badge"], [class*="tag"], [class*="label"]',
    featured: '[class*="featured"], [class*="highlight"]',
    exclusive: '[class*="exclusive"], [class*="special"]',
  };

  constructor() {
    super(MisliAdapter.SITE_CODE, MisliAdapter.BASE_URL);
  }

  canHandle(url: string): boolean {
    const hostname = new URL(url).hostname;
    return hostname.includes('misli') || hostname.includes('misli.com');
  }

  async extractCards(page: Page): Promise<RawCampaignCard[]> {
    const cards: RawCampaignCard[] = [];
    const seenUrls = new Set<string>();

    await this.triggerLazyLoading(page);

    // Misli's archive page uses the same widget as Hipodrom: each campaign is a
    // .campaignItem with .campaignTitle, .campaignDate, .campaignBtn (link), .campaignPicture img.
    // We deliberately avoid generic [class*="campaign"] selectors here because the page also
    // contains menu items like "Geçmiş Kampanyalar 11" that would slip through.
    const cardResults = await page.evaluate(() => {
      const results: any[] = [];
      const cardEls = document.querySelectorAll('.campaignItem');

      cardEls.forEach((el, index) => {
        const titleEl = el.querySelector('.campaignTitle a, .campaignTitle');
        const title = titleEl?.textContent?.trim().replace(/\s+/g, ' ') ?? '';
        if (!title || title.length < 4) return;

        const linkEl = el.querySelector('.campaignBtn, .campaignTitle a, .campaignPicture a');
        const campaignUrl = linkEl?.getAttribute('href') ?? '';
        if (!campaignUrl) return;

        const description = el.querySelector('.campaignDate')?.textContent?.trim() ?? null;
        const imgEl = el.querySelector('.campaignPicture img');
        const imageUrl = imgEl?.getAttribute('src') ?? imgEl?.getAttribute('data-src') ?? null;
        const badge = el.querySelector('.campaignPicture')?.textContent?.trim() ?? null;
        const rawId = el.getAttribute('data-id')
          || el.getAttribute('id')
          || campaignUrl.replace(/^.*\//, '')
          || `misli-${index}`;

        results.push({ rawId, title, description, campaignUrl, imageUrl, badge });
      });

      return results;
    });

    for (const data of cardResults) {
      if (seenUrls.has(data.campaignUrl)) continue;
      seenUrls.add(data.campaignUrl);

      cards.push({
        siteCode: this.siteCode,
        rawId: data.rawId,
        title: data.title,
        description: data.description,
        bonusAmount: null,
        bonusPercentage: null,
        minDeposit: null,
        maxBonus: null,
        code: null,
        url: this.buildCampaignUrl(data.campaignUrl),
        imageUrl: normalizeImageUrl(this.baseUrl, data.imageUrl),
        startDate: null,
        endDate: null,
        termsUrl: null,
        category: null,
        badge: data.badge,
        isFeatured: false,
        isExclusive: false,
        rawData: {},
        scrapedAt: new Date(),
      });
    }

    const listingUrl = page.url();

    for (const card of cards) {
      const skipPatterns = ['/bonus-kampanyalari', '/kampanyalar'];
      const shouldSkip = !card.url ||
        card.url === '' ||
        skipPatterns.some(pattern => card.url?.endsWith(pattern));

      if (shouldSkip) {
        continue;
      }

      try {
        const result = await this.visitDetailPage(page, card.url, { waitMs: 800 });

        if (result?.body && result.body.length > (card.description?.length ?? 0)) {
          card.description = result.body;
        }

        if (result?.termsUrl) {
          card.termsUrl = result.termsUrl;
        }

        // Extract dates from detail page body
        if (result?.body) {
          const dateMatch = result.body.match(/Başlama Tarihi:\s*(\d{2}[./]\d{2}[./]\d{4})\s*-\s*Bitiş Tarihi:\s*(\d{2}[./]\d{2}[./]\d{4})/i);
          if (dateMatch) {
            const startDateStr = dateMatch[1].replace(/\./g, '-');
            const endDateStr = dateMatch[2].replace(/\./g, '-');
            const parsedStart = new Date(startDateStr);
            const parsedEnd = new Date(endDateStr);
            if (!isNaN(parsedStart.getTime())) {
              card.startDate = startDateStr;
            }
            if (!isNaN(parsedEnd.getTime())) {
              card.endDate = endDateStr;
            }
          }

          // Extract badge "GEÇMİŞKAMPANYA" from detail page
          const badgeMatch = result.body.match(/GEÇMİŞKAMPANYA/i);
          if (badgeMatch && !card.badge) {
            card.badge = 'GEÇMİŞKAMPANYA';
          }

          // Extract image from detail page if not already set
          if (!card.imageUrl) {
            const imgMatch = result.body.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
            if (imgMatch) {
              card.imageUrl = imgMatch[1];
            }
          }
        }
      } catch (error) {
        console.error(`Error visiting detail page for card ${card.rawId}: ${error}`);
      }
    }

    await page.goto(listingUrl, { waitUntil: 'domcontentloaded' });

    return cards;
  }

  private async triggerLazyLoading(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 3);
      });
      await new Promise(r => setTimeout(r, 500));
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight * 2 / 3);
      });
      await new Promise(r => setTimeout(r, 500));
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
    }
  }

  normalize(card: RawCampaignCard): NormalizedCampaignInput | null {
    // Safety check: validate title quality
    if (!isLikelyRealCampaignTitle(card.title)) {
      logger.debug(`Skipping card with invalid title: "${card.title.substring(0, 50)}..."`, { siteCode: this.siteCode });
      return null;
    }

    const rawFingerprint = buildRawFingerprint({
      siteCode: card.siteCode,
      rawId: card.rawId,
      title: card.title,
      url: card.url,
    });

    const bonusAmount = extractNumericValue(card.bonusAmount);
    const bonusPercentage = card.bonusPercentage;
    const minDeposit = extractNumericValue(card.minDeposit);
    const maxBonus = extractNumericValue(card.maxBonus);

    const fingerprint = buildFingerprint({
      siteCode: card.siteCode,
      title: card.title,
      bonusType: bonusAmount !== null ? 'amount' : bonusPercentage !== null ? 'percentage' : 'amount',
      bonusAmount,
      bonusPercentage,
      minDeposit,
      code: card.code,
      category: card.category,
    });

    const dateResult = extractDatesFromCampaignText(card.title, card.description);
    const startDate = dateResult.startDate;
    const endDate = dateResult.endDate;

    const bonusType = this.classifyBonusType(
      bonusAmount,
      bonusPercentage,
      card.description ?? undefined
    );

    return {
      siteCode: card.siteCode,
      fingerprint,
      title: card.title,
      description: card.description,
      bonusType,
      bonusAmount,
      bonusPercentage,
      minDeposit,
      maxBonus,
      code: card.code,
      url: card.url,
      imageUrl: card.imageUrl,
      startDate,
      endDate,
      termsUrl: card.termsUrl,
      category: card.category ?? 'genel',
      isFeatured: card.isFeatured,
      isExclusive: card.isExclusive,
      visibility: 'visible',
      rawFingerprint,
    };
  }

  private classifyBonusType(
    bonusAmount: number | null,
    bonusPercentage: number | null,
    description?: string
  ): 'amount' | 'percentage' | 'freebet' | 'cashback' | 'mixed' {
    const desc = description?.toLowerCase() ?? '';
    if (desc.includes('freebet') || desc.includes('serbest bahis') || desc.includes('free bet')) {
      return 'freebet';
    }
    if (desc.includes('cashback') || desc.includes('iade') || desc.includes('kayıp')) {
      return 'cashback';
    }
    if (bonusAmount !== null && bonusPercentage !== null) {
      return 'mixed';
    }
    if (bonusPercentage !== null) {
      return 'percentage';
    }
    return 'amount';
  }
}

export default MisliAdapter;
