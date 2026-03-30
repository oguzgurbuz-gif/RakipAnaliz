import { Page } from 'puppeteer';
import { BaseAdapter } from './base';
import { RawCampaignCard, NormalizedCampaignInput } from '../types';
import { buildFingerprint, buildRawFingerprint } from '../normalizers/fingerprint';
import { extractNumericValue } from '../normalizers/text';
import { parseDateText } from '../normalizers/date';
import { normalizeImageUrl } from '../normalizers/image';
import { extractDatesFromCampaignText } from '../date-extraction/parser';

export class HipodromAdapter extends BaseAdapter {
  private static readonly SITE_CODE = 'hipodrom';
  private static readonly BASE_URL = 'https://www.hipodrom.com';
  public readonly campaignsUrl = 'https://www.hipodrom.com/kampanyalar';

  protected readonly selectors = {
    campaignCard: '.campaignItem',
    campaignTitle: '.campaignDetail .campaignTitle',
    campaignDescription: '.campaignDetail .campaignDate',
    campaignImage: '.campaignPicture img',
    campaignUrl: '.campaignDetail .campaignBtn',
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
    super(HipodromAdapter.SITE_CODE, HipodromAdapter.BASE_URL);
  }

  canHandle(url: string): boolean {
    const hostname = new URL(url).hostname;
    return hostname.includes('hipodrom') || hostname.includes('hipodrom.com');
  }

  async extractCards(page: Page): Promise<RawCampaignCard[]> {
    const cards: RawCampaignCard[] = [];

    await this.waitForSelector(page, this.selectors.campaignCard!, { timeout: 15000 });

    const cardElements = await page.$$(this.selectors.campaignCard!);

    for (const cardEl of cardElements) {
      try {
        const rawId = await page.evaluate((el) => el.getAttribute('data-id') || el.getAttribute('id') || `hipodrom-${Date.now()}`, cardEl);

        const title = this.selectors.campaignTitle
          ? await cardEl.$eval(this.selectors.campaignTitle!, (el) => el.textContent?.trim() ?? '').catch(() => '')
          : '';

        const description = this.selectors.campaignDescription
          ? await cardEl.$eval(this.selectors.campaignDescription!, (el) => el.textContent?.trim() ?? null).catch(() => null)
          : null;

        const campaignUrl = this.selectors.campaignUrl
          ? await cardEl.$eval(this.selectors.campaignUrl!, (el) => el.getAttribute('href') ?? '').catch(() => '')
          : '';

        const imageUrl = this.selectors.campaignImage
          ? await cardEl.$eval(this.selectors.campaignImage!, (el) => el.getAttribute('src') ?? el.getAttribute('data-src') ?? null).catch(() => null)
          : null;

        const card: RawCampaignCard = {
          siteCode: this.siteCode,
          rawId,
          title,
          description: null,
          bonusAmount: null,
          bonusPercentage: null,
          minDeposit: null,
          maxBonus: null,
          code: null,
          url: this.buildCampaignUrl(campaignUrl),
          imageUrl: normalizeImageUrl(this.baseUrl, imageUrl),
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
      } catch (error) {
        console.error(`Error extracting card: ${error}`);
      }
    }

    const listingUrl = page.url();

    for (const card of cards) {
      if (card.url) {
        try {
          await page.goto(card.url, { waitUntil: 'networkidle0', timeout: 15000 });
          await new Promise(r => setTimeout(r, 500));
          
          card.description = await page.evaluate(() => {
            const nuxtEl = document.getElementById('__nuxt');
            return nuxtEl?.innerText?.trim() || document.body.innerText?.trim() || '';
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

export default HipodromAdapter;
