import { Page } from 'puppeteer';
import { BaseAdapter } from './base';
import { RawCampaignCard, NormalizedCampaignInput } from '../types';
import { buildFingerprint, buildRawFingerprint } from '../normalizers/fingerprint';
import { extractNumericValue, isLikelyRealCampaignTitle } from '../normalizers/text';
import { parseDateText } from '../normalizers/date';
import { normalizeImageUrl } from '../normalizers/image';
import { extractDatesFromCampaignText } from '../date-extraction/parser';

export class OleyAdapter extends BaseAdapter {
  private static readonly SITE_CODE = 'oley';
  private static readonly BASE_URL = 'https://www.oley.com';
  public readonly campaignsUrl = 'https://www.oley.com/kampanyalar';

  protected readonly selectors = {
    campaignCard: '.campaign-widget',
    campaignTitle: '.title',
    campaignDescription: null,
    campaignImage: null,
    campaignUrl: '.campaign-widget a',
    bonusAmount: null,
    bonusPercentage: null,
    minDeposit: null,
    code: null,
    startDate: null,
    endDate: null,
    termsUrl: null,
    category: null,
    badge: null,
    featured: null,
    exclusive: null,
  };

  constructor() {
    super(OleyAdapter.SITE_CODE, OleyAdapter.BASE_URL);
  }

  canHandle(url: string): boolean {
    const hostname = new URL(url).hostname;
    return hostname.includes('oley') || hostname.includes('oley.com');
  }

  async extractCards(page: Page): Promise<RawCampaignCard[]> {
    const cards: RawCampaignCard[] = [];

    await this.waitForSelector(page, this.selectors.campaignCard!, { timeout: 15000 });

    const selectorStr = this.selectors.campaignCard!;
    const cardData = await page.evaluate((selector) => {
      const results: any[] = [];
      const cardEls = document.querySelectorAll(selector);
      cardEls.forEach((card, index) => {
        if (card.textContent && card.textContent.trim().length < 30) return;
        let title = '';
        const titleEl = card.querySelector('h2.title');
        if (titleEl?.textContent?.trim()) {
          title = titleEl.textContent.trim();
        } else {
          const headings = Array.from(card.querySelectorAll('h1, h2, h3, h4'));
          for (const h of headings) {
            const text = h.textContent?.trim() ?? '';
            if (text && text.length < 200) { title = text; break; }
          }
          if (!title) { const text = card.textContent?.trim() ?? ''; title = text.length < 300 ? text : ''; }
        }
        if (!title || title.length < 3) return;

        const rawId = card.getAttribute('data-id') || card.getAttribute('id') || `oley-${index}-${Date.now()}`;

        const descriptionEl = card.querySelector('p.mb-2');
        const description = descriptionEl?.textContent?.trim() || null;

        const linkEl = card.querySelector('a');
        let campaignUrl = '';
        if (linkEl) {
          campaignUrl = linkEl.getAttribute('href') || '';
        }

        const imgEl = card.querySelector('img');
        const imageUrl = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || null) : null;

        const rawIdFallback = card.id || `oley-${index}`;
        const rawIdFinal = card.getAttribute('data-id') || rawIdFallback;

        results.push({ rawId: rawIdFinal, title, description, campaignUrl, imageUrl });
      });
      return results;
    }, selectorStr);

    for (const data of cardData) {
      const card: RawCampaignCard = {
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
        imageUrl: data.imageUrl,
        startDate: null,
        endDate: null,
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

    const listingUrl = page.url();

    for (const card of cards) {
      if (card.url && !card.url.endsWith('/kampanyalar') && !card.url.endsWith('/kampanyalar/')) {
        try {
          await page.goto(card.url, { waitUntil: 'networkidle0', timeout: 15000 });
          await new Promise(r => setTimeout(r, 500));
          
          card.description = await this.extractDetailBody(page);
          if (card.description) {
            card.description = this.cleanBodyText(card.description);
          }
        } catch (err) {
          console.error(`Failed to scrape detail page for ${card.url}:`, err);
        }
      }
    }

    if (listingUrl && page.url() !== listingUrl) {
      await page.goto(listingUrl, { waitUntil: 'networkidle0', timeout: 15000 });
    }

    return cards;
  }

  normalize(card: RawCampaignCard): NormalizedCampaignInput | null {
    // Safety check: validate title quality
    if (!isLikelyRealCampaignTitle(card.title)) {
      return null;
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
      bonusType: 'amount',
      bonusAmount: null,
      bonusPercentage: null,
      minDeposit: null,
      code: null,
      category: null,
    });

    const dateResult = extractDatesFromCampaignText(card.title, card.description);
    const startDate = dateResult.startDate;
    const endDate = dateResult.endDate;

    return {
      siteCode: card.siteCode,
      fingerprint,
      title: card.title,
      description: card.description,
      bonusType: 'amount',
      bonusAmount: null,
      bonusPercentage: null,
      minDeposit: null,
      maxBonus: null,
      code: null,
      url: card.url,
      imageUrl: card.imageUrl,
      startDate,
      endDate,
      termsUrl: null,
      category: 'genel',
      isFeatured: false,
      isExclusive: false,
      visibility: 'visible',
      rawFingerprint,
    };
  }
}

export default OleyAdapter;
