import { Page } from 'puppeteer';
import { BaseAdapter } from './base';
import { RawCampaignCard, NormalizedCampaignInput } from '../types';
import { buildFingerprint, buildRawFingerprint } from '../normalizers/fingerprint';
import { extractNumericValue, isLikelyRealCampaignTitle } from '../normalizers/text';
import { normalizeImageUrl } from '../normalizers/image';
import { extractDatesFromCampaignText } from '../date-extraction/parser';

export class BirebinAdapter extends BaseAdapter {
  private static readonly SITE_CODE = 'birebin';
  private static readonly BASE_URL = 'https://www.birebin.com';
  public readonly campaignsUrl = 'https://www.birebin.com/iddaa-kampanyalar';

  protected readonly selectors = {
    campaignCard: '.yardimContent',
    campaignTitle: '.yardimContent > h2',
    campaignDescription: '.dectext.helpContent',
    bonusAmount: [
      '[class*="değer"]',
      '[class*="amount"]',
      '[class*="bonus"]',
      '[class*="value"]',
    ].join(', '),
    bonusPercentage: [
      '[class*="percent"]',
      '[class*="rate"]',
      '[class*="oran"]',
    ].join(', '),
    minDeposit: [
      '[class*="min"]',
      '[class*="deposit"]',
    ].join(', '),
    code: [
      '[class*="code"]',
      '[class*="coupon"]',
      '[class*="kod"]',
    ].join(', '),
    campaignUrl: 'a[href]',
    campaignImage: 'img[class*="image"], [class*="img"] img, picture img',
    startDate: '[class*="start"], [class*="basla"]',
    endDate: '[class*="end"], [class*="biti"], [class*="expire"]',
    termsUrl: 'a[href*="kosul"], a[href*="sart"], a[href*="terms"]',
    category: '[class*="category"], [class*="type"], [class*="tur"]',
    badge: '[class*="badge"], [class*="tag"], [class*="label"]',
    featured: '[class*="featured"], [class*="highlight"], [class*="top"]',
    exclusive: '[class*="exclusive"], [class*="special"]',
  };

  constructor() {
    super(BirebinAdapter.SITE_CODE, BirebinAdapter.BASE_URL);
  }

  canHandle(url: string): boolean {
    const hostname = new URL(url).hostname;
    return hostname.includes('birebin') || hostname.includes('birebin.com');
  }

  async extractCards(page: Page): Promise<RawCampaignCard[]> {
    const cards: RawCampaignCard[] = [];
    const seenUrls = new Set<string>();

    await this.triggerLazyLoading(page);

    const cardSelectors = ['.yardimContent'];
    const selectorStr = cardSelectors.join(', ');

    // Birebin lists every campaign on a single page (no per-campaign detail URLs).
    // Each .yardimContent card holds h2 (title) + .right div (full body w/ rules + dates).
    let cardData: any[] = await page.evaluate((selector) => {
      const results: any[] = [];
      const cardEls = document.querySelectorAll(selector);
      cardEls.forEach((card, index) => {
        const titleEl = card.querySelector('h2');
        const title = titleEl?.textContent?.trim() || '';
        if (!title) return;

        // .right contains the full per-card body (intro + dates + rules).
        // Falls back to .dectext.helpContent (intro only) then full card text.
        const rightEl = card.querySelector('.right');
        const decEl = card.querySelector('.dectext.helpContent');
        let description =
          rightEl?.textContent?.trim() ||
          decEl?.textContent?.trim() ||
          card.textContent?.trim() ||
          null;
        if (description && description.startsWith(title)) {
          description = description.substring(title.length).trim();
        }

        const imgEl = card.querySelector('img');
        const imageUrl = imgEl?.getAttribute('src') || null;

        const percentMatch = title.match(/%(\d+)/);
        const bonusPercentageText = percentMatch ? percentMatch[0] : null;

        const textContent = card.textContent || '';
        const startMatch = textContent.match(/Başlangıç\s*Tarihi:\s*(\d{2}\.\d{2}\.\d{4})/);
        const endMatch = textContent.match(/Bitiş\s*Tarihi:\s*(\d{2}\.\d{2}\.\d{4})/);
        const startDateText = startMatch ? startMatch[1] : null;
        const endDateText = endMatch ? endMatch[1] : null;

        const rawId = `birebin-${index}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 40)}`;

        results.push({
          rawId,
          title,
          description,
          imageUrl,
          bonusPercentageText,
          startDateText,
          endDateText,
        });
      });
      return results;
    }, selectorStr);

    // If no cards found, try fallback discovery
    if (cardData.length === 0) {
      cardData = await this.fallbackCardDiscovery(page, seenUrls);
    }

    for (const data of cardData) {
      if (!data || typeof data !== 'object') continue;

      const rawId = data.rawId || `birebin-${Date.now()}`;
      const title = data.title || '';
      // Birebin has no per-campaign detail page; build a stable fragment URL
      // from rawId so each card has a unique canonical reference.
      const campaignUrl = `${this.campaignsUrl}#${rawId}`;
      if (seenUrls.has(campaignUrl)) continue;
      seenUrls.add(campaignUrl);

      const card: RawCampaignCard = {
        siteCode: this.siteCode,
        rawId,
        title,
        description: data.description || null,
        bonusAmount: null,
        bonusPercentage: extractNumericValue(data.bonusPercentageText),
        minDeposit: null,
        maxBonus: null,
        code: null,
        url: campaignUrl,
        imageUrl: normalizeImageUrl(this.baseUrl, data.imageUrl ?? null),
        startDate: data.startDateText || null,
        endDate: data.endDateText || null,
        termsUrl: null,
        category: null,
        badge: null,
        isFeatured: false,
        isExclusive: false,
        rawData: {},
        scrapedAt: new Date(),
      };

      cards.push(card);
    }

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

  private async fallbackCardDiscovery(page: Page, seenUrls: Set<string>): Promise<any[]> {
    const cards: any[] = [];
    try {
      const result = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="teklif"], a[href*="kampanya"], a[href*="bonus"]'));
        return links.map((link: Element) => {
          const container = link.closest('[class*="item"], [class*="card"], [class*="campaign"], article, section');
          return container || link;
        }).filter((el: Element, idx: number, arr: Element[]) => arr.findIndex(e => e === el) === idx);
      });
      const campaignLinks = Array.isArray(result) ? result : [];

      for (const cardData of campaignLinks) {
        const href = cardData.querySelector?.('a')?.getAttribute('href') || cardData.getAttribute?.('href');
        if (href && !seenUrls.has(href)) {
          seenUrls.add(href);
          cards.push(cardData);
        }
      }
    } catch (e) {
      console.error('Fallback card discovery failed:', e);
    }
    return cards;
  }

  normalize(card: RawCampaignCard): NormalizedCampaignInput | null {
    // Safety check: validate title quality
    if (!isLikelyRealCampaignTitle(card.title)) {
      return null;
    }

    const bonusAmount = extractNumericValue(card.bonusAmount);
    const bonusPercentage = card.bonusPercentage;
    const minDeposit = extractNumericValue(card.minDeposit);

    let bonusType: 'amount' | 'percentage' | 'freebet' | 'cashback' | 'mixed' = 'amount';
    if (bonusPercentage !== null && bonusPercentage > 0) {
      bonusType = 'percentage';
    }
    if (card.title.toLowerCase().includes('freebet')) {
      bonusType = 'freebet';
    }
    if (card.title.toLowerCase().includes('cashback')) {
      bonusType = 'cashback';
    }
    if (bonusAmount !== null && bonusPercentage !== null) {
      bonusType = 'mixed';
    }

    const dateResult = extractDatesFromCampaignText(card.title, card.description);
    const startDate = dateResult.startDate;
    const endDate = dateResult.endDate;

    let visibility: 'visible' | 'hidden' | 'expired' | 'pending' = 'visible';
    if (endDate && endDate < new Date()) {
      visibility = 'expired';
    }
    if (startDate && startDate > new Date()) {
      visibility = 'pending';
    }

    const rawFingerprint = buildRawFingerprint({
      siteCode: card.siteCode,
      rawId: card.rawId,
      title: card.title,
      url: card.url,
    });

    const fingerprint = buildFingerprint({
      siteCode: card.siteCode,
      title: card.title,
      bonusType,
      bonusAmount,
      bonusPercentage,
      minDeposit,
      code: card.code,
      category: card.category,
    });

    return {
      siteCode: card.siteCode,
      fingerprint,
      title: card.title,
      description: card.description,
      bonusType,
      bonusAmount,
      bonusPercentage,
      minDeposit,
      maxBonus: extractNumericValue(card.maxBonus),
      code: card.code,
      url: card.url,
      imageUrl: card.imageUrl,
      startDate,
      endDate,
      termsUrl: card.termsUrl,
      category: card.category ?? 'genel',
      isFeatured: card.isFeatured,
      isExclusive: card.isExclusive,
      visibility,
      rawFingerprint,
    };
  }
}

export default BirebinAdapter;
