import { Page, ElementHandle } from 'puppeteer';
import { BaseAdapter } from './base';
import { RawCampaignCard, NormalizedCampaignInput } from '../types';
import { buildFingerprint, buildRawFingerprint } from '../normalizers/fingerprint';
import { extractNumericValue } from '../normalizers/text';
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
    campaignUrl: 'a[href]',
    campaignImage: 'img[class*="image"], [class*="img"] img, picture img',
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
    const seenUrls = new Set<string>();

    await this.triggerLazyLoading(page);

    const cardSelectors = [
      '[class*="campaign"]',
      '[class*="item"]',
      '[class*="card"]',
      '[class*="bonus"]',
      '[class*="offer"]',
      'article',
      '.widget',
    ];

    let cardElements: ElementHandle<Element>[] = [];
    for (const selector of cardSelectors) {
      try {
        cardElements = await page.$$(selector);
        if (cardElements.length > 0) {
          console.log(`Ekuri: Found ${cardElements.length} cards with selector: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (cardElements.length === 0) {
      cardElements = await this.fallbackCardDiscovery(page, seenUrls);
    }

    for (const cardEl of cardElements) {
      try {
        const rawId = await page.evaluate((el) => el.getAttribute('data-id') || el.getAttribute('id') || `ekuri-${Date.now()}`, cardEl);

        const title = await cardEl.$eval(this.selectors.campaignTitle, (el: Element) => el.textContent?.trim() ?? '').catch(() => '');

        const description = await cardEl.$eval(this.selectors.campaignDescription, (el: Element) => el.textContent?.trim() ?? null).catch(() => null);

        const bonusAmountText = await cardEl.$eval(this.selectors.bonusAmount, (el: Element) => el.textContent?.trim() ?? null).catch(() => null);

        const bonusPercentageText = await cardEl.$eval(this.selectors.bonusPercentage, (el: Element) => el.textContent?.trim() ?? null).catch(() => null);

        const code = await cardEl.$eval(this.selectors.code, (el: Element) => el.textContent?.trim() ?? null).catch(() => null);

        const campaignUrl = await cardEl.$eval(this.selectors.campaignUrl, (el: Element) => {
          const href = el.getAttribute('href');
          if (href && (href.includes('kampanya') || href.includes('bonus') || href.startsWith('/'))) {
            return href;
          }
          return '';
        }).catch(() => '');

        if (campaignUrl && seenUrls.has(campaignUrl)) {
          continue;
        }
        if (campaignUrl) {
          seenUrls.add(campaignUrl);
        }

        const imageUrl = await cardEl.$eval(this.selectors.campaignImage, (el: Element) => el.getAttribute('src') ?? el.getAttribute('data-src') ?? null).catch(() => null);

        const startDateText = await cardEl.$eval(this.selectors.startDate, (el: Element) => el.textContent?.trim() ?? null).catch(() => null);

        const endDateText = await cardEl.$eval(this.selectors.endDate, (el: Element) => el.textContent?.trim() ?? null).catch(() => null);

        const termsUrl = await cardEl.$eval(this.selectors.termsUrl, (el: Element) => el.getAttribute('href') ?? null).catch(() => null);

        const category = await cardEl.$eval(this.selectors.category, (el: Element) => el.textContent?.trim() ?? null).catch(() => null);

        const badge = await cardEl.$eval(this.selectors.badge, (el: Element) => el.textContent?.trim() ?? null).catch(() => null);

        const isFeatured = await cardEl.$(this.selectors.featured).then((el: ElementHandle | null) => el !== null).catch(() => false);

        const isExclusive = await cardEl.$(this.selectors.exclusive).then((el: ElementHandle | null) => el !== null).catch(() => false);

        const card: RawCampaignCard = {
          siteCode: this.siteCode,
          rawId,
          title,
          description,
          bonusAmount: bonusAmountText,
          bonusPercentage: extractNumericValue(bonusPercentageText),
          minDeposit: null,
          maxBonus: null,
          code: code?.replace(/KOD:|KUPON:?/gi, '').trim() ?? null,
          url: this.buildCampaignUrl(campaignUrl),
          imageUrl: normalizeImageUrl(this.baseUrl, imageUrl),
          startDate: startDateText,
          endDate: endDateText,
          termsUrl,
          category,
          badge,
          isFeatured,
          isExclusive,
          rawData: {},
          scrapedAt: new Date(),
        };

        cards.push(card);
      } catch (error) {
        console.error(`Error extracting card: ${error}`);
      }
    }

    const listingUrl = page.url();

    for (const card of cards) {
      if (card.url && card.url !== this.baseUrl + '/kampanyalar' && card.url !== this.baseUrl + '/kampanyalar/') {
        try {
          await page.goto(card.url, { waitUntil: 'networkidle0', timeout: 15000 });
          await new Promise(r => setTimeout(r, 500));
          
          card.description = await page.evaluate(() => {
            return document.body?.innerText?.trim() || '';
          });
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
    }
  }

  private async fallbackCardDiscovery(page: Page, seenUrls: Set<string>): Promise<any[]> {
    const cards: any[] = [];
    try {
      const result = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="kampanya"], a[href*="bonus"]'));
        return links.map((link: Element) => {
          const container = link.closest('[class*="item"], [class*="card"], [class*="campaign"], [class*="widget"], article, section');
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

  normalize(card: RawCampaignCard): NormalizedCampaignInput {
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
