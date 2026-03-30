import { Page } from 'puppeteer';
import { BaseAdapter } from './base';
import { RawCampaignCard, NormalizedCampaignInput } from '../types';
import { buildFingerprint, buildRawFingerprint } from '../normalizers/fingerprint';
import { extractNumericValue } from '../normalizers/text';
import { parseDateText } from '../normalizers/date';
import { normalizeImageUrl } from '../normalizers/image';

export class BitalihAdapter extends BaseAdapter {
  public readonly campaignsUrl = 'https://bitalih.com/kampanyalar';
  private static readonly SITE_CODE = 'bitalih';
  private static readonly BASE_URL = 'https://bitalih.com';

  protected readonly selectors = {
    campaignCard: 'div.border.flex.flex-col.border-gray-200.rounded-xl',
    campaignTitle: 'span.font-bold.text-base',
    campaignDescription: null,
    bonusAmount: null,
    bonusPercentage: null,
    minDeposit: null,
    code: null,
    campaignUrl: 'a[href*="kampanyalar/"]',
    campaignImage: 'img',
    startDate: null,
    endDate: null,
    termsUrl: null,
    category: null,
    badge: null,
    featured: null,
    exclusive: null,
  };

  constructor() {
    super(BitalihAdapter.SITE_CODE, BitalihAdapter.BASE_URL);
  }

  canHandle(url: string): boolean {
    const hostname = new URL(url).hostname;
    return hostname.includes('bitalih') || hostname.includes('bitalih.com');
  }

  async extractCards(page: Page): Promise<RawCampaignCard[]> {
    const cards: RawCampaignCard[] = [];

    await this.waitForSelector(page, this.selectors.campaignCard!, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => window.scrollTo(0, 300));
    await new Promise(r => setTimeout(r, 500));

    const cardData = await page.evaluate(() => {
      const results: any[] = [];
      const cardEls = document.querySelectorAll('div.border.flex.flex-col.border-gray-200.rounded-xl');
      
      cardEls.forEach((card, index) => {
        const titleEl = card.querySelector('span.font-bold.text-base');
        const imgEl = card.querySelector('img');
        const linkEl = card.querySelector('a[href*="kampanyalar/"]');
        
        const title = titleEl?.textContent?.trim() || '';
        const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || null;
        const campaignUrl = linkEl?.getAttribute('href') || '';
        
        const dateEls = card.querySelectorAll('span.font-medium.text-sm');
        let startDate: string | null = null;
        let endDate: string | null = null;
        
        dateEls.forEach(el => {
          const text = el.textContent?.trim() || '';
          if (text.includes('Başlangıç')) {
            const nextEl = el.nextElementSibling;
            startDate = nextEl?.textContent?.trim() || null;
          }
          if (text.includes('Bitiş')) {
            const nextEl = el.nextElementSibling;
            endDate = nextEl?.textContent?.trim() || null;
          }
        });

        const rawId = card.getAttribute('data-id') || `bitalih-${index}-${Date.now()}`;

        results.push({
          rawId,
          title,
          imageUrl,
          campaignUrl,
          startDate,
          endDate,
        });
      });
      
      return results;
    });

    const listingUrl = page.url();

    for (const data of cardData) {
      const card: RawCampaignCard = {
        siteCode: this.siteCode,
        rawId: data.rawId,
        title: data.title,
        description: null,
        bonusAmount: null,
        bonusPercentage: null,
        minDeposit: null,
        maxBonus: null,
        code: null,
        url: this.buildCampaignUrl(data.campaignUrl),
        imageUrl: normalizeImageUrl(this.baseUrl, data.imageUrl),
        startDate: data.startDate,
        endDate: data.endDate,
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

    for (const card of cards) {
      if (card.url) {
        try {
          await page.goto(card.url, { waitUntil: 'networkidle0', timeout: 15000 });
          await new Promise(r => setTimeout(r, 500));
          
          card.description = await page.evaluate(() => {
            const allDivs = Array.from(document.querySelectorAll('div'));
            let bestDiv: HTMLElement | null = null;
            for (const div of allDivs) {
              if (div.innerText && div.innerText.includes('Kampanya Detayı') && div.innerText.length > 2000) {
                bestDiv = div;
                break;
              }
            }
            return bestDiv?.innerText?.trim() || '';
          });
        } catch (err) {
          console.error(`Failed to scrape detail page for ${card.url}:`, err);
        }
      }
    }

    if (listingUrl) {
      await page.goto(listingUrl, { waitUntil: 'networkidle0', timeout: 15000 });
    }

    return cards;
  }

  normalize(card: RawCampaignCard): NormalizedCampaignInput {
    let bonusAmount = extractNumericValue(card.bonusAmount);
    const bonusPercentage = card.bonusPercentage;
    const minDeposit = extractNumericValue(card.minDeposit);

    if (bonusAmount === null) {
      const titleBonusMatch = card.title.match(/(\d+\.?\d*)\s*(?:TL|₺|lira)/i);
      if (titleBonusMatch) {
        bonusAmount = parseFloat(titleBonusMatch[1].replace(/\./g, ''));
      }
    }

    let bonusType: 'amount' | 'percentage' | 'freebet' | 'cashback' | 'mixed' = 'amount';
    if (bonusPercentage !== null && bonusPercentage > 0) {
      bonusType = 'percentage';
    }
    if (card.title.toLowerCase().includes('freebet') || card.title.toLowerCase().includes('bedava')) {
      bonusType = 'freebet';
    }
    if (card.title.toLowerCase().includes('cashback')) {
      bonusType = 'cashback';
    }
    if (bonusAmount !== null && bonusPercentage !== null) {
      bonusType = 'mixed';
    }

    const startDate = parseDateText(card.startDate);
    const endDate = parseDateText(card.endDate);

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

export default BitalihAdapter;