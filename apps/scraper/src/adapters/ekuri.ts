import { Page } from 'puppeteer';
import { BaseAdapter } from './base';
import { RawCampaignCard, NormalizedCampaignInput } from '../types';
import { buildFingerprint, buildRawFingerprint } from '../normalizers/fingerprint';
import { extractNumericValue, isLikelyRealCampaignTitle } from '../normalizers/text';
import { parseDateText } from '../normalizers/date';
import { normalizeImageUrl } from '../normalizers/image';
import { extractDatesFromCampaignText } from '../date-extraction/parser';

export class EkuriAdapter extends BaseAdapter {
  private static readonly SITE_CODE = 'ekuri';
  private static readonly BASE_URL = 'https://www.ekuri.com';
  public readonly campaignsUrl = 'https://ekuri.com/kampanyalar';

  protected readonly selectors = {
    campaignCard: [
      '[class*="campaign"]',
      '[class*="item"]',
      '[class*="card"]',
      '[class*="bonus"]',
      '[class*="offer"]',
      'article',
      '.widget',
    ].join(', '),
    campaignTitle: [
      '[class*="title"]',
      'h1', 'h2', 'h3', 'h4',
    ].join(', '),
    campaignDescription: [
      '[class*="sub-title"]',
      '[class*="subtitle"]',
      '[class*="description"]',
      '[class*="desc"]',
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
    ].join(', '),
    campaignUrl: 'a[href], button',
    campaignImage: 'img',
    startDate: '[class*="start"], [class*="date"]',
    endDate: '[class*="end"], [class*="date"]',
    termsUrl: 'a[href*="kosul"], a[href*="sart"], a[href*="terms"]',
    category: '[class*="category"], [class*="type"]',
    badge: '[class*="badge"], [class*="tag"], [class*="label"]',
    featured: '[class*="featured"], [class*="highlight"]',
    exclusive: '[class*="exclusive"], [class*="special"]',
  };

  constructor() {
    super(EkuriAdapter.SITE_CODE, EkuriAdapter.BASE_URL);
  }

  canHandle(url: string): boolean {
    const hostname = new URL(url).hostname;
    return hostname.includes('ekuri') || hostname.includes('ekuri.com');
  }

  async extractCards(page: Page): Promise<RawCampaignCard[]> {
    const cards: RawCampaignCard[] = [];

    await this.triggerLazyLoading(page);

    const cardSelectors = [
      '.campaign-item',
      '.campaign-widget',
      '[class*="campaign"][class*="item"]',
      '[class*="campaign"][class*="card"]',
    ];

    const selectorStr = cardSelectors.join(', ');

    const cardData = await page.evaluate((selector) => {
      const results: any[] = [];
      const seenUrls: string[] = [];
      const cardEls = document.querySelectorAll(selector);
      const baseUrl = 'https://www.ekuri.com';

      cardEls.forEach((card, index) => {
        // Skip cards with very little text (likely noise)
        if (card.textContent && card.textContent.trim().length < 30) return;

        let title = '';
        const titleEl = card.querySelector('[class*="title"]:not(h1):not(h2):not(h3):not(h4)');
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

        const rawId = card.getAttribute('data-id') || card.getAttribute('id') || `ekuri-${Date.now()}-${index}`;

        const descriptionEl = card.querySelector('[class*="sub-title"], [class*="subtitle"], [class*="description"], [class*="desc"], p');
        const description = descriptionEl?.textContent?.trim() ?? null;

        const bonusAmountEl = card.querySelector('[class*="amount"], [class*="value"], [class*="bonus"]');
        const bonusAmountText = bonusAmountEl?.textContent?.trim() ?? null;

        const bonusPercentageEl = card.querySelector('[class*="percent"], [class*="rate"]');
        const bonusPercentageText = bonusPercentageEl?.textContent?.trim() ?? null;

        const codeEl = card.querySelector('[class*="code"], [class*="coupon"]');
        const code = codeEl?.textContent?.trim() ?? null;

        const campaignUrlEl = card.querySelector('a[href]');
        let campaignUrl = '';
        if (campaignUrlEl) {
          const href = campaignUrlEl.getAttribute('href');
          if (href && (href.includes('kampanya') || href.includes('bonus') || href.startsWith('/'))) {
            campaignUrl = href;
          }
        } else {
          // Check button onclick attribute
          const buttonEl = card.querySelector('button');
          if (buttonEl) {
            const onclick = buttonEl.getAttribute('onclick');
            if (onclick) {
              // Extract URL from onclick like "window.location.href='/kampanya/...'"
              const match = onclick.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
              if (match && match[1]) {
                campaignUrl = match[1];
              }
            }
          }
        }

        if (campaignUrl && seenUrls.includes(campaignUrl)) {
          return; // skip duplicate
        }
        if (campaignUrl) {
          seenUrls.push(campaignUrl);
        }

        const imageEl = card.querySelector('img');
        const imageUrl = imageEl?.getAttribute('src') ?? imageEl?.getAttribute('data-src') ?? null;

        const startDateEl = card.querySelector('[class*="start"], [class*="date"]');
        const startDateText = startDateEl?.textContent?.trim() ?? null;

        const endDateEl = card.querySelector('[class*="end"], [class*="date"]');
        const endDateText = endDateEl?.textContent?.trim() ?? null;

        const termsEl = card.querySelector('a[href*="kosul"], a[href*="sart"], a[href*="terms"]');
        const termsUrl = termsEl?.getAttribute('href') ?? null;

        const categoryEl = card.querySelector('[class*="category"], [class*="type"]');
        const category = categoryEl?.textContent?.trim() ?? null;

        const badgeEl = card.querySelector('[class*="badge"], [class*="tag"], [class*="label"]');
        const badge = badgeEl?.textContent?.trim() ?? null;

        const isFeatured = !!(card.querySelector('[class*="featured"], [class*="highlight"]'));
        const isExclusive = !!(card.querySelector('[class*="exclusive"], [class*="special"]'));

        results.push({
          rawId,
          title,
          description,
          bonusAmountText,
          bonusPercentageText,
          code,
          campaignUrl,
          imageUrl,
          startDateText,
          endDateText,
          termsUrl,
          category,
          badge,
          isFeatured,
          isExclusive,
        });
      });

      return results;
    }, selectorStr);

    for (const data of cardData) {
      const card: RawCampaignCard = {
        siteCode: this.siteCode,
        rawId: data.rawId,
        title: data.title,
        description: data.description,
        bonusAmount: data.bonusAmountText,
        bonusPercentage: extractNumericValue(data.bonusPercentageText),
        minDeposit: null,
        maxBonus: null,
        code: data.code?.replace(/KOD:|KUPON:?/gi, '').trim() ?? null,
        url: this.buildCampaignUrl(data.campaignUrl),
        imageUrl: normalizeImageUrl(this.baseUrl, data.imageUrl),
        startDate: data.startDateText,
        endDate: data.endDateText,
        termsUrl: data.termsUrl,
        category: data.category,
        badge: data.badge,
        isFeatured: data.isFeatured,
        isExclusive: data.isExclusive,
        rawData: {},
        scrapedAt: new Date(),
      };

      cards.push(card);
    }

    const listingUrl = page.url();

    for (const card of cards) {
      if (card.url && card.url !== this.baseUrl + '/kampanyalar' && card.url !== this.baseUrl + '/kampanyalar/') {
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
      // Ignore lazy loading errors
    }
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

export default EkuriAdapter;
