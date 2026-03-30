import { Page } from 'puppeteer';
import { BaseAdapter } from './base';
import { RawCampaignCard, NormalizedCampaignInput } from '../types';
import { buildFingerprint, buildRawFingerprint } from '../normalizers/fingerprint';
import { extractNumericValue } from '../normalizers/text';
import { parseDateText } from '../normalizers/date';
import { normalizeImageUrl } from '../normalizers/image';
import { extractDatesFromCampaignText } from '../date-extraction/parser';

export class AltiliGanyanAdapter extends BaseAdapter {
  private static readonly SITE_CODE = 'altiliganyan';
  private static readonly BASE_URL = 'https://www.altiliganyan.com';
  public readonly campaignsUrl = 'https://www.altiliganyan.com/kampanyalar';

  protected readonly selectors = {
    campaignCard: '.campaign-list__item',
    campaignTitle: '.campaign-list__item__title',
    campaignDescription: '.campaign-list__item__description',
    campaignImage: '.campaign-list__item__image-container img',
    campaignUrl: '.campaign-list__item__bottom .btn',
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
    super(AltiliGanyanAdapter.SITE_CODE, AltiliGanyanAdapter.BASE_URL);
  }

  canHandle(url: string): boolean {
    const hostname = new URL(url).hostname;
    return hostname.includes('altiliganyan') || hostname.includes('altiliganyan.com');
  }

  async extractCards(page: Page): Promise<RawCampaignCard[]> {
    const cards: RawCampaignCard[] = [];

    await this.waitForSelector(page, this.selectors.campaignCard, { timeout: 15000 });

    const cardElements = await page.$$(this.selectors.campaignCard!);

    for (const cardEl of cardElements) {
      try {
        const rawId = await page.evaluate((el) => el.getAttribute('data-id') || el.getAttribute('id') || `altiliganyan-${Date.now()}`, cardEl);

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

        let fullDescription: string | null = null;
        try {
          await cardEl.click();
          await new Promise(r => setTimeout(r, 1500));
          fullDescription = await page.evaluate(() => {
            const detailEl = document.querySelector('.campaign-detail, .campaign-detail-content, [class*="campaign-detail"]') as HTMLElement | null;
            return detailEl?.innerText?.trim() || document.body.innerText?.trim() || null;
          });
          await page.keyboard.press('Escape');
          await new Promise(r => setTimeout(r, 500));
        } catch (e) {
          console.error('Error clicking campaign item:', e);
        }

        const card: RawCampaignCard = {
          siteCode: this.siteCode,
          rawId,
          title,
          description: fullDescription || description,
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

export default AltiliGanyanAdapter;
