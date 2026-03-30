import { Page, ElementHandle } from 'puppeteer';
import { BaseAdapter } from './base';
import { RawCampaignCard, NormalizedCampaignInput } from '../types';
import { buildFingerprint, buildRawFingerprint } from '../normalizers/fingerprint';
import { extractNumericValue } from '../normalizers/text';
import { normalizeImageUrl } from '../normalizers/image';
import { extractDatesFromCampaignText } from '../date-extraction/parser';

export class ForNalaAdapter extends BaseAdapter {
  private static readonly SITE_CODE = '4nala';
  private static readonly BASE_URL = 'https://www.4nala.com';
  public readonly campaignsUrl = 'https://4nala.com/kampanyalar';

  protected readonly selectors = {
    campaignCard: '[class*="campaign"], [class*="bonus"], [class*="offer"], article, .item, [class*="card"]',
    campaignTitle: 'h1, h2, h3, h4, [class*="title"], [class*="headline"]',
    campaignDescription: '[class*="desc"], [class*="text"], [class*="content"], p',
    bonusAmount: '[class*="amount"], [class*="değer"], [class*="bonus"]',
    bonusPercentage: '[class*="percent"], [class*="ratio"], [class*="orani"]',
    minDeposit: '[class*="min"], [class*="deposit"], [class*="yatırım"]',
    code: '[class*="code"], [class*="kod"], .coupon',
    campaignUrl: 'a[href]',
    campaignImage: 'img[class*="campaign"], img[class*="bonus"], img[class*="offer"]',
    startDate: '[class*="start"], [class*="basla"], time',
    endDate: '[class*="end"], [class*="biti"], [class*="son"], time',
    termsUrl: 'a[href*="terms"], a[href*="kosul"], a[href*="sart"]',
    category: '[class*="category"], [class*="type"], [class*="tur"]',
    badge: '[class*="badge"], [class*="tag"], [class*="label"]',
    featured: '[class*="featured"], [class*="spotlight"], [class*="highlight"]',
    exclusive: '[class*="exclusive"], [class*="ozel"], [class*="vip"]',
  };

  constructor() {
    super(ForNalaAdapter.SITE_CODE, ForNalaAdapter.BASE_URL);
  }

  canHandle(url: string): boolean {
    const hostname = new URL(url).hostname;
    return hostname.includes('4nala') || hostname.includes('4nala.com');
  }

  async extractCards(page: Page): Promise<RawCampaignCard[]> {
    const cards: RawCampaignCard[] = [];

    await this.waitForSelector(page, 'body', { timeout: 10000 });

    await page.evaluate(() => new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve(true);
        }
      }, 100);
      setTimeout(resolve, 5000);
    }));

    let cardElements: ElementHandle<Element>[] = [];
    try {
      cardElements = await page.$$(this.selectors.campaignCard);
    } catch {
      cardElements = [];
    }

    if (cardElements.length === 0) {
      try {
        const fallback: ElementHandle<Element>[] = await page.$$('a[href*="bonus"], a[href*="kampanya"], a[href*="offer"], a[href*="promotion"]');
        if (fallback.length > 0) {
          cardElements = fallback;
        }
      } catch {
      }
    }

    if (cardElements.length === 0) {
      let fallbackElements: Element[] = [];
      try {
        const result = await page.evaluate(() => {
          const allLinks = Array.from(document.querySelectorAll('a[href]'));
          const campaignLinks = allLinks.filter((link: Element) => {
            const href = link.getAttribute('href') || '';
            const text = link.textContent?.trim() || '';
            const isCampaignLink = /bonus|kampanya|offer|promotion|promo|bonusu?|advantage/i.test(href) ||
              /bonus|kampanya|offer|promotion|promo|bonusu?|advantage/i.test(text);
            return isCampaignLink && href.startsWith('/') || href.includes('4nala');
          });
          return campaignLinks.map((link: Element) => {
            const parent = link.closest('div, article, section, li, card');
            return parent || link;
          });
        });
        fallbackElements = Array.isArray(result) ? result : [];
      } catch {
        fallbackElements = [];
      }

      if (fallbackElements.length > 0) {
        cardElements = fallbackElements as unknown as ElementHandle<Element>[];
      }
    }

    if (cardElements.length === 0) {
      let fallbackElements2: Element[] = [];
      try {
        const result = await page.evaluate(() => {
          const clickableElements: Element[] = [];
          const seen = new Set<Element>();
          document.querySelectorAll('a[href], button, [onclick], [role="button"]').forEach((el: Element) => {
            const parent = el.closest('div[class], article, section');
            if (parent && !seen.has(parent)) {
              seen.add(parent);
              clickableElements.push(parent);
            }
          });
          return clickableElements;
        });
        fallbackElements2 = Array.isArray(result) ? result : [];
      } catch {
        fallbackElements2 = [];
      }

      if (fallbackElements2.length > 0) {
        cardElements = fallbackElements2 as unknown as ElementHandle<Element>[];
      }
    }

    const seenUrls = new Set<string>();

    for (const cardEl of cardElements) {
      try {
        const rawId = await page.evaluate((el) => el.getAttribute('data-id') || el.getAttribute('id') || `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, cardEl);

        const title = await page.evaluate((el) => {
          const titleEl = el.querySelector('h1, h2, h3, h4, [class*="title"], [class*="headline"]');
          return titleEl?.textContent?.trim() ?? el.textContent?.trim().slice(0, 100) ?? '';
        }, cardEl);

        const description = await page.evaluate((el) => {
          const descEl = el.querySelector('[class*="desc"], [class*="text"], [class*="content"], p');
          return descEl?.textContent?.trim().slice(0, 500) ?? null;
        }, cardEl);

        const bonusAmountText = await page.evaluate((el) => {
          const amountEl = el.querySelector('[class*="amount"], [class*="değer"], [class*="bonus"]');
          return amountEl?.textContent?.trim() ?? null;
        }, cardEl);

        const bonusPercentageText = await page.evaluate((el) => {
          const percentEl = el.querySelector('[class*="percent"], [class*="ratio"], [class*="orani"]');
          return percentEl?.textContent?.trim() ?? null;
        }, cardEl);

        const minDepositText = await page.evaluate((el) => {
          const minEl = el.querySelector('[class*="min"], [class*="deposit"], [class*="yatırım"]');
          return minEl?.textContent?.trim() ?? null;
        }, cardEl);

        const code = await page.evaluate((el) => {
          const codeEl = el.querySelector('[class*="code"], [class*="kod"], .coupon');
          return codeEl?.textContent?.trim() ?? null;
        }, cardEl);

        const campaignUrl = await page.evaluate((el) => {
          const linkEl = el.querySelector('a[href]');
          return linkEl?.getAttribute('href') ?? '';
        }, cardEl);

        const imageUrl = await page.evaluate((el) => {
          const imgEl = el.querySelector('img[class*="campaign"], img[class*="bonus"], img[class*="offer"], img');
          return imgEl?.getAttribute('src') ?? imgEl?.getAttribute('data-src') ?? null;
        }, cardEl);

        const startDateText = await page.evaluate((el) => {
          const startEl = el.querySelector('[class*="start"], [class*="basla"], time');
          return startEl?.textContent?.trim() ?? null;
        }, cardEl);

        const endDateText = await page.evaluate((el) => {
          const endEl = el.querySelector('[class*="end"], [class*="biti"], [class*="son"], time');
          return endEl?.textContent?.trim() ?? null;
        }, cardEl);

        const termsUrl = await page.evaluate((el) => {
          const termsEl = el.querySelector('a[href*="terms"], a[href*="kosul"], a[href*="sart"]');
          return termsEl?.getAttribute('href') ?? null;
        }, cardEl);

        const category = await page.evaluate((el) => {
          const catEl = el.querySelector('[class*="category"], [class*="type"], [class*="tur"]');
          return catEl?.textContent?.trim() ?? null;
        }, cardEl);

        const badge = await page.evaluate((el) => {
          const badgeEl = el.querySelector('[class*="badge"], [class*="tag"], [class*="label"]');
          return badgeEl?.textContent?.trim() ?? null;
        }, cardEl);

        const isFeatured = await page.evaluate((el) => {
          const featuredEl = el.querySelector('[class*="featured"], [class*="spotlight"], [class*="highlight"]');
          return featuredEl !== null;
        }, cardEl);

        const isExclusive = await page.evaluate((el) => {
          const exclusiveEl = el.querySelector('[class*="exclusive"], [class*="ozel"], [class*="vip"]');
          return exclusiveEl !== null;
        }, cardEl);

        if (!title || title.length < 3) {
          continue;
        }

        const fullUrl = this.buildCampaignUrl(campaignUrl);
        if (fullUrl && !fullUrl.endsWith('/kampanyalar') && !fullUrl.endsWith('/kampanyalar/')) {
          if (seenUrls.has(fullUrl)) {
            continue;
          }
          seenUrls.add(fullUrl);
        }

        const card: RawCampaignCard = {
          siteCode: this.siteCode,
          rawId,
          title,
          description,
          bonusAmount: bonusAmountText,
          bonusPercentage: extractNumericValue(bonusPercentageText),
          minDeposit: minDepositText,
          maxBonus: null,
          code: code?.replace(/KOD:|CODE:|KUPON:?/gi, '').trim() ?? null,
          url: fullUrl,
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

    const listingUrl = this.campaignsUrl;
    for (const card of cards) {
      if (!card.url || card.url.endsWith('/kampanyalar') || card.url.endsWith('/kampanyalar/')) {
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

  normalize(card: RawCampaignCard): NormalizedCampaignInput {
    const bonusAmount = extractNumericValue(card.bonusAmount);
    const bonusPercentage = card.bonusPercentage;
    const minDeposit = extractNumericValue(card.minDeposit);

    let bonusType: 'amount' | 'percentage' | 'freebet' | 'cashback' | 'mixed' = 'amount';
    if (bonusPercentage !== null && bonusPercentage > 0) {
      bonusType = 'percentage';
    }
    if (card.title.toLowerCase().includes('freebet') || card.title.toLowerCase().includes('free bet')) {
      bonusType = 'freebet';
    }
    if (card.title.toLowerCase().includes('cashback') || card.title.toLowerCase().includes('kesin iade')) {
      bonusType = 'cashback';
    }
    if (bonusAmount !== null && bonusPercentage !== null) {
      bonusType = 'mixed';
    }

    const dateResult = extractDatesFromCampaignText(card.title, card.description);
    const startDate = dateResult.startDate;
    const endDate = dateResult.endDate;

    const titleLower = card.title.toLowerCase();
    let visibility: 'visible' | 'hidden' | 'expired' | 'pending' = 'visible';
    if (endDate && endDate < new Date()) {
      visibility = 'expired';
    }
    if (startDate && startDate > new Date()) {
      visibility = 'pending';
    }
    if (titleLower.includes('hidden') || titleLower.includes('gizli')) {
      visibility = 'hidden';
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

export default ForNalaAdapter;
