import { Page, ElementHandle } from 'puppeteer';
import { BaseAdapter } from './base';
import { RawCampaignCard, NormalizedCampaignInput } from '../types';
import { buildFingerprint, buildRawFingerprint } from '../normalizers/fingerprint';
import { extractNumericValue, isLikelyRealCampaignTitle } from '../normalizers/text';
import { normalizeImageUrl } from '../normalizers/image';
import { extractDatesFromCampaignText } from '../date-extraction/parser';

export class BilyonerAdapter extends BaseAdapter {
  private static readonly SITE_CODE = 'bilyoner';
  private static readonly BASE_URL = 'https://www.bilyoner.com';
  public readonly campaignsUrl = 'https://www.bilyoner.com/kampanyalar';

  protected readonly selectors = {
    campaignCard: [
      '[class*="kampanya"]',
      '[class*="bonus"]',
      '[class*="campaign"]',
      '[class*="promotion"]',
      '[class*="item"]',
      '[class*="card"]',
      '[class*="offer"]',
      'article',
    ].join(', '),
    campaignTitle: [
      '[class*="title"]',
      'h1', 'h2', 'h3', 'h4',
    ].join(', '),
    campaignDescription: [
      '[class*="description"]',
      '[class*="desc"]',
      '[class*="info"]',
      'p',
    ].join(', '),
    bonusAmount: [
      '[class*="amount"]',
      '[class*="value"]',
      '[class*="bonus"]',
    ].join(', '),
    bonusPercentage: [
      '[class*="percent"]',
      '[class*="yuzde"]',
      '[class*="rate"]',
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
    startDate: '[class*="start"], [class*="baslangic"]',
    endDate: '[class*="end"], [class*="bitis"]',
    termsUrl: 'a[href*="sart"], a[href*="kosul"], a[href*="terms"]',
    category: '[class*="category"], [class*="type"]',
    badge: '[class*="badge"], [class*="tag"], [class*="label"]',
    featured: '[class*="featured"], [class*="highlight"]',
    exclusive: '[class*="exclusive"], [class*="special"]',
  };

  constructor() {
    super(BilyonerAdapter.SITE_CODE, BilyonerAdapter.BASE_URL);
  }

  canHandle(url: string): boolean {
    const hostname = new URL(url).hostname;
    return hostname.includes('bilyoner') || hostname.includes('bilyoner.com');
  }

  async extractCards(page: Page): Promise<RawCampaignCard[]> {
    const cards: RawCampaignCard[] = [];
    const seenUrls = new Set<string>();

    await this.triggerLazyLoading(page);

    const cardSelectors = [
      '[class*="kampanya-item"]',
      '[class*="bonus-card"]',
      '[class*="campaign-item"]',
      '[class*="promotion-item"]',
      '[class*="item-card"]',
      '[class*="card-item"]',
      '[class*="offer-item"]',
      'article.kampanya',
      'article.campaign',
      '[class*="kampanya"]',
      '[class*="bonus"]',
      '[class*="campaign"]',
    ];

    let cardElements: ElementHandle<Element>[] = [];
    let fallbackCards: RawCampaignCard[] = [];
    for (const selector of cardSelectors) {
      try {
        cardElements = await page.$$(selector);
        if (cardElements.length > 0) {
          console.log(`Bilyoner: Found ${cardElements.length} cards with selector: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (cardElements.length === 0) {
      fallbackCards = await this.fallbackCardDiscovery(page, seenUrls);
    } else {
      const selectorStr = cardSelectors.join(', ');
      const selectors = this.selectors;

      const extractedCards = await page.evaluate((selector) => {
        const results: any[] = [];
        const cardEls = document.querySelectorAll(selector);

        cardEls.forEach((el: Element) => {
          const titleEl = el.querySelector('[class*="title"]:not(h1):not(h2):not(h3):not(h4)');
          let title = '';
          if (titleEl?.textContent?.trim()) {
            title = titleEl.textContent.trim();
          } else {
            const headings = Array.from(el.querySelectorAll('h1, h2, h3, h4'));
            for (const h of headings) {
              const text = h.textContent?.trim() ?? '';
              if (text && text.length < 200) {
                title = text;
                break;
              }
            }
            if (!title) {
              const text = el.textContent?.trim() ?? '';
              title = text.length < 300 ? text : '';
            }
          }

          const descriptionEl = el.querySelector('[class*="description"], [class*="desc"], [class*="info"], p');
          const description = descriptionEl?.textContent?.trim() ?? null;

          const amountEl = el.querySelector('[class*="amount"], [class*="value"], [class*="bonus"]');
          const bonusAmount = amountEl?.textContent?.trim() ?? null;

          const percentEl = el.querySelector('[class*="percent"], [class*="yuzde"], [class*="rate"]');
          const bonusPercentage = percentEl?.textContent?.trim() ?? null;

          const minEl = el.querySelector('[class*="min"], [class*="deposit"]');
          const minDeposit = minEl?.textContent?.trim() ?? null;

          const codeEl = el.querySelector('[class*="code"], [class*="coupon"], [class*="kod"]');
          const code = codeEl?.textContent?.trim() ?? null;

          const linkEl = el.querySelector('a[href]');
          let campaignUrl = '';
          if (linkEl) {
            const href = linkEl.getAttribute('href');
            if (href && (href.includes('bonus') || href.includes('kampanya') || href.startsWith('/'))) {
              campaignUrl = href;
            }
          }

          const imgEl = el.querySelector('img[class*="image"], [class*="img"] img, picture img');
          const imageUrl = imgEl?.getAttribute('src') ?? imgEl?.getAttribute('data-src') ?? null;

          const startEl = el.querySelector('[class*="start"], [class*="baslangic"]');
          const startDate = startEl?.textContent?.trim() ?? null;

          const endEl = el.querySelector('[class*="end"], [class*="bitis"]');
          const endDate = endEl?.textContent?.trim() ?? null;

          const termsEl = el.querySelector('a[href*="sart"], a[href*="kosul"], a[href*="terms"]');
          const termsUrl = termsEl?.getAttribute('href') ?? null;

          const catEl = el.querySelector('[class*="category"], [class*="type"]');
          const category = catEl?.textContent?.trim() ?? null;

          const badgeEl = el.querySelector('[class*="badge"], [class*="tag"], [class*="label"]');
          const badge = badgeEl?.textContent?.trim() ?? null;

          const isFeatured = el.querySelector('[class*="featured"], [class*="highlight"]') !== null;
          const isExclusive = el.querySelector('[class*="exclusive"], [class*="special"]') !== null;

          results.push({
            rawId: el.getAttribute('data-id') || el.getAttribute('id') || `bilyoner-${Date.now()}`,
            title,
            description,
            bonusAmount,
            bonusPercentage,
            minDeposit,
            code,
            campaignUrl,
            imageUrl,
            startDate,
            endDate,
            termsUrl,
            category,
            badge,
            isFeatured,
            isExclusive,
          });
        });

        return results;
      }, selectorStr);

      for (const cardData of extractedCards) {
        if (cardData.campaignUrl && seenUrls.has(cardData.campaignUrl)) {
          continue;
        }
        if (cardData.campaignUrl) {
          seenUrls.add(cardData.campaignUrl);
        }

        const card: RawCampaignCard = {
          siteCode: this.siteCode,
          rawId: cardData.rawId,
          title: cardData.title,
          description: cardData.description,
          bonusAmount: cardData.bonusAmount,
          bonusPercentage: extractNumericValue(cardData.bonusPercentage),
          minDeposit: cardData.minDeposit,
          maxBonus: null,
          code: cardData.code?.replace(/KOD:|KUPON:?/gi, '').trim() ?? null,
          url: this.buildCampaignUrl(cardData.campaignUrl),
          imageUrl: normalizeImageUrl(this.baseUrl, cardData.imageUrl),
          startDate: cardData.startDate,
          endDate: cardData.endDate,
          termsUrl: cardData.termsUrl,
          category: cardData.category,
          badge: cardData.badge,
          isFeatured: cardData.isFeatured,
          isExclusive: cardData.isExclusive,
          rawData: {},
          scrapedAt: new Date(),
        };

        cards.push(card);
      }
    }

    if (fallbackCards.length > 0) {
      cards.push(...fallbackCards);
    }

    const listingUrl = page.url();

    for (const card of cards) {
      if (!card.url || card.url.endsWith('/bonus-ve-kampanyalar')) {
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
        const links = Array.from(document.querySelectorAll('a[href*="bonus"], a[href*="kampanya"]'));
        return links.map((link: Element) => {
          const container = link.closest('[class*="item"], [class*="card"], [class*="campaign"], [class*="bonus"], [class*="kampanya"], article, section');
          return container || link;
        }).filter((el: Element, idx: number, arr: Element[]) => arr.findIndex(e => e === el) === idx);
      });
      const campaignLinks = Array.isArray(result) ? result : [];

      for (const cardEl of campaignLinks) {
        const href = cardEl.querySelector?.('a')?.getAttribute('href') || cardEl.getAttribute?.('href');
        if (href && !seenUrls.has(href)) {
          seenUrls.add(href);
          const titleEl = cardEl.querySelector('[class*="title"], h1, h2, h3, h4');
          const descEl = cardEl.querySelector('[class*="desc"], [class*="info"], [class*="detail"], p');
          const amountEl = cardEl.querySelector('[class*="amount"], [class*="value"]');
          const percentEl = cardEl.querySelector('[class*="percent"], [class*="rate"]');
          const minEl = cardEl.querySelector('[class*="min"], [class*="deposit"]');
          const codeEl = cardEl.querySelector('[class*="code"], [class*="coupon"]');
          const imgEl = cardEl.querySelector('img');
          const startEl = cardEl.querySelector('[class*="start"], [class*="from"]');
          const endEl = cardEl.querySelector('[class*="end"], [class*="to"]');
          const termsEl = cardEl.querySelector('a[href*="sartlar"], a[href*="kosul"], a[href*="terms"]');
          const catEl = cardEl.querySelector('[class*="type"], [class*="category"]');
          const badgeEl = cardEl.querySelector('[class*="badge"], [class*="tag"]');
          const featuredEl = cardEl.querySelector('[class*="featured"], [class*="highlight"]');
          const exclusiveEl = cardEl.querySelector('[class*="exclusive"], [class*="special"]');

          cards.push({
            siteCode: 'bilyoner',
            rawId: cardEl.getAttribute('data-id') || cardEl.getAttribute('id') || `bilyoner-${Date.now()}`,
            title: titleEl?.textContent?.trim() ?? '',
            description: descEl?.textContent?.trim() ?? null,
            bonusAmount: amountEl?.textContent?.trim() ?? null,
            bonusPercentage: null,
            minDeposit: minEl?.textContent?.trim() ?? null,
            maxBonus: null,
            code: codeEl?.textContent?.replace(/KOD:|KUPON:?/gi, '').trim() ?? null,
            url: href.startsWith('http') ? href : `https://www.bilyoner.com${href}`,
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
      return null;
    }

    const bonusAmount = extractNumericValue(card.bonusAmount);
    const bonusPercentage = card.bonusPercentage;
    const minDeposit = extractNumericValue(card.minDeposit);

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

export default BilyonerAdapter;
