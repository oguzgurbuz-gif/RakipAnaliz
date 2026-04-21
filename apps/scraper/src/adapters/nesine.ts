import { Page, ElementHandle } from 'puppeteer';
import { BaseAdapter } from './base';
import { RawCampaignCard, NormalizedCampaignInput } from '../types';
import { buildFingerprint, buildRawFingerprint } from '../normalizers/fingerprint';
import { extractNumericValue, isLikelyRealCampaignTitle } from '../normalizers/text';
import { normalizeImageUrl } from '../normalizers/image';
import { extractDatesFromCampaignText } from '../date-extraction/parser';
import { logger } from '../utils/logger';

export class NesineAdapter extends BaseAdapter {
  private static readonly SITE_CODE = 'nesine';
  private static readonly BASE_URL = 'https://www.nesine.com';
  public readonly campaignsUrl = 'https://www.nesine.com/kampanyalar';

  protected readonly selectors = {
    campaignCard: [
      '[class*="ns-"]',
      '[class*="campaign"]',
      '[class*="bonus"]',
      '[class*="promotion"]',
      '[class*="offer"]',
      '[class*="item"]',
      '[class*="card"]',
      'article',
    ].join(', '),
    campaignTitle: [
      '[class*="title"]',
      '[class*="ns-title"]',
      'h1', 'h2', 'h3', 'h4',
    ].join(', '),
    campaignDescription: [
      '[class*="desc"]',
      '[class*="info"]',
      '[class*="detail"]',
      'p',
    ].join(', '),
    bonusAmount: [
      '[class*="amount"]',
      '[class*="value"]',
      '[class*="ns-amount"]',
    ].join(', '),
    bonusPercentage: [
      '[class*="percent"]',
      '[class*="rate"]',
      '[class*="ns-rate"]',
    ].join(', '),
    minDeposit: [
      '[class*="min"]',
      '[class*="deposit"]',
    ].join(', '),
    code: [
      '[class*="code"]',
      '[class*="coupon"]',
      '[class*="ns-code"]',
    ].join(', '),
    campaignUrl: 'a[href]',
    campaignImage: 'img[class*="image"], [class*="img"] img, picture img',
    startDate: '[class*="start"], [class*="from"]',
    endDate: '[class*="end"], [class*="to"]',
    termsUrl: 'a[href*="sartlar"], a[href*="kosul"], a[href*="terms"]',
    category: '[class*="type"], [class*="category"]',
    badge: '[class*="badge"], [class*="tag"], [class*="ns-badge"]',
    featured: '[class*="featured"], [class*="highlight"]',
    exclusive: '[class*="exclusive"], [class*="special"]',
  };

  constructor() {
    super(NesineAdapter.SITE_CODE, NesineAdapter.BASE_URL);
  }

  canHandle(url: string): boolean {
    const hostname = new URL(url).hostname;
    return hostname.includes('nesine') || hostname.includes('nesine.com');
  }

  async extractCards(page: Page): Promise<RawCampaignCard[]> {
    const cards: RawCampaignCard[] = [];
    const seenUrls = new Set<string>();

    await this.triggerLazyLoading(page);

    // Use page.evaluate (bitalih pattern) — more reliable than cardEl.evaluate()
    const cardSelectors = [
      '[class*="ns-"]',
      '[class*="campaign"]',
      '[class*="bonus"]',
      '[class*="promotion"]',
      '[class*="offer"]',
      '[class*="item"]',
      '[class*="card"]',
      'article',
    ];

    const selectorStr = cardSelectors.join(', ');
    const cardData = await page.evaluate((selector) => {
      const results: any[] = [];
      const cardEls = document.querySelectorAll(selector);

      cardEls.forEach((card, index) => {
        // Skip very small elements (likely not real cards)
        if (card.textContent && card.textContent.trim().length < 30) return;

        // Title extraction with multiple fallback strategies
        let title = '';
        const titleEl = card.querySelector('[class*="title"]:not(h1):not(h2):not(h3):not(h4), [class*="ns-title"]');
        if (titleEl?.textContent?.trim()) {
          title = titleEl.textContent.trim();
        } else {
          const headings = Array.from(card.querySelectorAll('h1, h2, h3, h4'));
          for (const h of headings) {
            const text = h.textContent?.trim() ?? '';
            if (text && !text.match(/^Kampanyalar?$/i) && text.length < 200) {
              title = text;
              break;
            }
          }
          if (!title) {
            const text = card.textContent?.trim() ?? '';
            title = text.length < 300 ? text : '';
          }
        }

        // Skip if no meaningful title found
        if (!title || title.length < 3) return;

        const descEl = card.querySelector('[class*="desc"], [class*="info"], [class*="detail"], p');
        const amountEl = card.querySelector('[class*="amount"], [class*="value"], [class*="ns-amount"]');
        const percentEl = card.querySelector('[class*="percent"], [class*="rate"], [class*="ns-rate"]');
        const minEl = card.querySelector('[class*="min"], [class*="deposit"]');
        const codeEl = card.querySelector('[class*="code"], [class*="coupon"], [class*="ns-code"]');
        const imgEl = card.querySelector('img');
        const linkEl = card.querySelector('a[href]');
        const startEl = card.querySelector('[class*="start"], [class*="from"]');
        const endEl = card.querySelector('[class*="end"], [class*="to"]');
        const termsEl = card.querySelector('a[href*="sartlar"], a[href*="kosul"], a[href*="terms"]');
        const catEl = card.querySelector('[class*="type"], [class*="category"]');
        const badgeEl = card.querySelector('[class*="badge"], [class*="tag"], [class*="ns-badge"]');
        const featuredEl = card.querySelector('[class*="featured"], [class*="highlight"]');
        const exclusiveEl = card.querySelector('[class*="exclusive"], [class*="special"]');

        let href = linkEl?.getAttribute('href') || '';
        if (href && (href.includes('kampanya') || href.includes('bonus') || href.startsWith('/'))) {
          // Valid URL
        } else {
          href = '';
        }

        results.push({
          rawId: card.getAttribute('data-id') || card.getAttribute('id') || `nesine-${index}-${Date.now()}`,
          title,
          description: descEl?.textContent?.trim() || null,
          bonusAmount: amountEl?.textContent?.trim() || null,
          bonusPercentage: percentEl?.textContent?.trim() || null,
          minDeposit: minEl?.textContent?.trim() || null,
          code: codeEl?.textContent?.replace(/KOD:|KUPON:?/gi, '').trim() || null,
          campaignUrl: href,
          imageUrl: imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || null,
          startDate: startEl?.textContent?.trim() || null,
          endDate: endEl?.textContent?.trim() || null,
          termsUrl: termsEl?.getAttribute('href') || null,
          category: catEl?.textContent?.trim() || null,
          badge: badgeEl?.textContent?.trim() || null,
          isFeatured: featuredEl !== null,
          isExclusive: exclusiveEl !== null,
        });
      });

      return results;
    }, selectorStr);

    const listingUrl = page.url();

    for (const data of cardData) {
      if (data.campaignUrl && seenUrls.has(data.campaignUrl)) continue;
      if (data.campaignUrl) seenUrls.add(data.campaignUrl);

      const card: RawCampaignCard = {
        siteCode: this.siteCode,
        rawId: data.rawId,
        title: data.title,
        description: data.description,
        bonusAmount: data.bonusAmount,
        bonusPercentage: extractNumericValue(data.bonusPercentage),
        minDeposit: data.minDeposit,
        maxBonus: null,
        code: data.code,
        url: this.buildCampaignUrl(data.campaignUrl),
        imageUrl: normalizeImageUrl(this.baseUrl, data.imageUrl),
        startDate: data.startDate,
        endDate: data.endDate,
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

    for (const card of cards) {
      if (!card.url || card.url.includes('/bonus-kampanyalari')) {
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

  private async fallbackCardDiscovery(page: Page, seenUrls: Set<string>): Promise<RawCampaignCard[]> {
    const cards: RawCampaignCard[] = [];
    try {
      const result = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="kampanya"], a[href*="bonus"]'));
        return links.map((link: Element) => {
          const container = link.closest('[class*="item"], [class*="card"], [class*="campaign"], [class*="ns-"], article, section');
          return container || link;
        }).filter((el: Element, idx: number, arr: Element[]) => arr.findIndex(e => e === el) === idx);
      });
      const campaignLinks = Array.isArray(result) ? result : [];

      for (const cardEl of campaignLinks) {
        const href = cardEl.querySelector?.('a')?.getAttribute('href') || cardEl.getAttribute?.('href');
        if (href && !seenUrls.has(href)) {
          seenUrls.add(href);
          const titleEl = cardEl.querySelector('[class*="title"], [class*="ns-title"], h1, h2, h3, h4');
          const descEl = cardEl.querySelector('[class*="desc"], [class*="info"], [class*="detail"], p');
          const amountEl = cardEl.querySelector('[class*="amount"], [class*="value"], [class*="ns-amount"]');
          const percentEl = cardEl.querySelector('[class*="percent"], [class*="rate"], [class*="ns-rate"]');
          const minEl = cardEl.querySelector('[class*="min"], [class*="deposit"]');
          const codeEl = cardEl.querySelector('[class*="code"], [class*="coupon"], [class*="ns-code"]');
          const imgEl = cardEl.querySelector('img');
          const startEl = cardEl.querySelector('[class*="start"], [class*="from"]');
          const endEl = cardEl.querySelector('[class*="end"], [class*="to"]');
          const termsEl = cardEl.querySelector('a[href*="sartlar"], a[href*="kosul"], a[href*="terms"]');
          const catEl = cardEl.querySelector('[class*="type"], [class*="category"]');
          const badgeEl = cardEl.querySelector('[class*="badge"], [class*="tag"], [class*="ns-badge"]');
          const featuredEl = cardEl.querySelector('[class*="featured"], [class*="highlight"]');
          const exclusiveEl = cardEl.querySelector('[class*="exclusive"], [class*="special"]');

          cards.push({
            siteCode: 'nesine',
            rawId: cardEl.getAttribute('data-id') || cardEl.getAttribute('id') || `nesine-${Date.now()}`,
            title: titleEl?.textContent?.trim() ?? '',
            description: descEl?.textContent?.trim() ?? null,
            bonusAmount: amountEl?.textContent?.trim() ?? null,
            bonusPercentage: null,
            minDeposit: minEl?.textContent?.trim() ?? null,
            maxBonus: null,
            code: codeEl?.textContent?.replace(/KOD:|KUPON:?/gi, '').trim() ?? null,
            url: href.startsWith('http') ? href : `https://www.nesine.com${href}`,
            imageUrl: imgEl?.getAttribute('src') ?? imgEl?.getAttribute('data-src') ?? null,
            startDate: startEl?.textContent?.trim() ?? null,
            endDate: endEl?.textContent?.trim() ?? null,
            termsUrl: termsEl?.getAttribute('href') ?? null,
            category: catEl?.textContent?.trim() ?? null,
            badge: badgeEl?.textContent?.trim() ?? null,
            isFeatured: featuredEl !== null,
            isExclusive: exclusiveEl !== null,
            rawData: {},
            scrapedAt: new Date(),
          });
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
      logger.debug(`Skipping card with invalid title: "${card.title.substring(0, 50)}..."`, { siteCode: this.siteCode });
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

export default NesineAdapter;
