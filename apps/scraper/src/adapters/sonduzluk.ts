import { Page } from 'puppeteer';
import { BaseAdapter } from './base';
import { RawCampaignCard, NormalizedCampaignInput } from '../types';
import { buildFingerprint, buildRawFingerprint } from '../normalizers/fingerprint';
import { extractNumericValue } from '../normalizers/text';
import { normalizeImageUrl } from '../normalizers/image';
import { extractDatesFromCampaignText } from '../date-extraction/parser';

export class SonDuzlukAdapter extends BaseAdapter {
  private static readonly SITE_CODE = 'sondzulyuk';
  private static readonly BASE_URL = 'https://www.sondzulyuk.com';
  private static readonly FALLBACK_URLS = [
    'https://www.sondzulyuk.com',
    'https://www.sundzulyuk.com',
    'https://sondzulyuk.com',
    'https://sundzulyuk.com',
  ];
  public readonly campaignsUrl = 'https://www.sondzulyuk.com/kampanyalar';

  protected readonly selectors = {
    campaignCard: '.dz-campaign, .bonus-offer, .special-deal, [class*="dz-"]',
    campaignTitle: '.dz-headline, .deal-title, h3',
    campaignDescription: '.dz-text, .deal-description',
    bonusAmount: '.dz-value, .deal-amount',
    bonusPercentage: '.dz-percent, .deal-ratio',
    minDeposit: '.dz-minimum, .floor-deposit',
    code: '.dz-key, .deal-code',
    campaignUrl: 'a[href*="deal"], a[href*="bonus"]',
    campaignImage: '.dz-image img, .deal-thumb img',
    startDate: '.dz-start',
    endDate: '.dz-end',
    termsUrl: 'a[href*="terms"]',
    category: '.dz-category',
    badge: '.dz-label',
    featured: '.highlighted-deal',
    exclusive: '.vip-deal',
  };

  constructor() {
    super(SonDuzlukAdapter.SITE_CODE, SonDuzlukAdapter.BASE_URL);
  }

  canHandle(url: string): boolean {
    const hostname = new URL(url).hostname;
    return (
      hostname.includes('sundzulyuk') ||
      hostname.includes('sundzulyuk.com') ||
      hostname.includes('sondzulyuk') ||
      hostname.includes('sondzulyuk.com') ||
      hostname.includes('sondzulyuk.com') ||
      hostname.includes('sundzulyuk.com')
    );
  }

  async extractCards(page: Page): Promise<RawCampaignCard[]> {
    const cards: RawCampaignCard[] = [];

    await this.waitForSelector(page, this.selectors.campaignCard, { timeout: 15000 });

    const cardElements = await page.$$(this.selectors.campaignCard);

    if (cardElements.length === 0) {
      return this.fallbackCardDiscovery(page);
    }

    for (const cardEl of cardElements) {
      try {
        const rawId = await page.evaluate((el) => el.getAttribute('data-id') || el.getAttribute('id') || `sondzulyuk-${Date.now()}`, cardEl);

        const title = await cardEl.$eval(this.selectors.campaignTitle, (el) => el.textContent?.trim() ?? '').catch(() => '');

        const description = await cardEl.$eval(this.selectors.campaignDescription, (el) => el.textContent?.trim() ?? null).catch(() => null);

        const bonusAmountText = await cardEl.$eval(this.selectors.bonusAmount, (el) => el.textContent?.trim() ?? null).catch(() => null);

        const bonusPercentageText = await cardEl.$eval(this.selectors.bonusPercentage, (el) => el.textContent?.trim() ?? null).catch(() => null);

        const minDepositText = await cardEl.$eval(this.selectors.minDeposit, (el) => el.textContent?.trim() ?? null).catch(() => null);

        const code = await cardEl.$eval(this.selectors.code, (el) => el.textContent?.trim() ?? null).catch(() => null);

        const campaignUrl = await cardEl.$eval(this.selectors.campaignUrl, (el) => el.getAttribute('href') ?? '').catch(() => '');

        const imageUrl = await cardEl.$eval(this.selectors.campaignImage, (el) => el.getAttribute('src') ?? el.getAttribute('data-src') ?? null).catch(() => null);

        const startDateText = await cardEl.$eval(this.selectors.startDate, (el) => el.textContent?.trim() ?? null).catch(() => null);

        const endDateText = await cardEl.$eval(this.selectors.endDate, (el) => el.textContent?.trim() ?? null).catch(() => null);

        const termsUrl = await cardEl.$eval(this.selectors.termsUrl, (el) => el.getAttribute('href') ?? null).catch(() => null);

        const category = await cardEl.$eval(this.selectors.category, (el) => el.textContent?.trim() ?? null).catch(() => null);

        const badge = await cardEl.$eval(this.selectors.badge, (el) => el.textContent?.trim() ?? null).catch(() => null);

        const isFeatured = await cardEl.$(this.selectors.featured).then((el) => el !== null).catch(() => false);

        const isExclusive = await cardEl.$(this.selectors.exclusive).then((el) => el !== null).catch(() => false);

        const card: RawCampaignCard = {
          siteCode: this.siteCode,
          rawId,
          title,
          description,
          bonusAmount: bonusAmountText,
          bonusPercentage: extractNumericValue(bonusPercentageText),
          minDeposit: minDepositText,
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
      if (!card.url || card.url.includes('/bonus-ve-kampanyalar') || card.url.includes('/kampanyalar')) {
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
      } catch (error) {
        console.error(`Error visiting detail page for card ${card.rawId}: ${error}`);
      }
    }

    await page.goto(listingUrl, { waitUntil: 'domcontentloaded' });

    return cards;
  }

  private async fallbackCardDiscovery(page: Page): Promise<RawCampaignCard[]> {
    const cards: RawCampaignCard[] = [];
    const seenUrls = new Set<string>();

    try {
      const campaignLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="deal"], a[href*="bonus"], a[href*="kampanya"]'));
        return links.map(link => {
          const container = link.closest('[class*="dz-"], [class*="deal"], [class*="bonus"], article, section');
          return container || link;
        }).filter((el, idx, arr) => arr.findIndex(e => e === el) === idx);
      });

      for (const cardData of campaignLinks ?? []) {
        const href = cardData.querySelector?.('a')?.getAttribute('href') || cardData.getAttribute?.('href');
        if (href && !seenUrls.has(href)) {
          seenUrls.add(href);

          const card: RawCampaignCard = {
            siteCode: this.siteCode,
            rawId: `sondzulyuk-${Date.now()}-${cards.length}`,
            title: cardData.querySelector?.('a')?.textContent?.trim() || href,
            description: null,
            bonusAmount: null,
            bonusPercentage: null,
            minDeposit: null,
            maxBonus: null,
            code: null,
            url: this.buildCampaignUrl(href),
            imageUrl: null,
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
      }
    } catch (e) {
      console.error('Fallback card discovery failed:', e);
    }
    return cards;
  }

  normalize(card: RawCampaignCard): NormalizedCampaignInput {
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

export default SonDuzlukAdapter;
