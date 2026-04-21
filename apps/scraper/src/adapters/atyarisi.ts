import { Page, ElementHandle } from 'puppeteer';
import { BaseAdapter } from './base';
import { RawCampaignCard, NormalizedCampaignInput } from '../types';
import { buildFingerprint, buildRawFingerprint } from '../normalizers/fingerprint';
import { extractNumericValue, isLikelyRealCampaignTitle } from '../normalizers/text';
import { normalizeImageUrl } from '../normalizers/image';
import { extractDatesFromCampaignText } from '../date-extraction/parser';

export class AtYarisiAdapter extends BaseAdapter {
  private static readonly SITE_CODE = 'atyarisi';
  private static readonly BASE_URL = 'https://www.atyarisi.com';
  public readonly campaignsUrl = 'https://www.atyarisi.com/kampanyalar';

  // Bilinen kampanya slug/ID çiftleri - /kampanyalar sayfası login gerektirdiği için direkt URL'ler kullanılıyor
  private static readonly KNOWN_CAMPAIGNS: { slug: string; id: number }[] = [
    { slug: 'sabit-ihtimallilerde-yuzde-25-ekstra-kazanc', id: 716 },
  ];

  protected readonly selectors = {
    campaignCard: [
      '[class*="bonus"]',
      '[class*="promosyon"]',
      '[class*="promotion"]',
      '[class*="campaign"]',
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
      '[class*="desc"]',
      '[class*="description"]',
      '[class*="text"]',
      'p',
    ].join(', '),
    bonusAmount: [
      '[class*="miktar"]',
      '[class*="money"]',
      '[class*="value"]',
      '[class*="amount"]',
    ].join(', '),
    bonusPercentage: [
      '[class*="oran"]',
      '[class*="rate"]',
      '[class*="percent"]',
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
    startDate: '[class*="start"], [class*="begin"]',
    endDate: '[class*="end"], [class*="finish"], [class*="expire"]',
    termsUrl: 'a[href*="kosullar"], a[href*="sart"], a[href*="terms"]',
    category: '[class*="category"], [class*="type"], [class*="tur"]',
    badge: '[class*="badge"], [class*="tag"], [class*="label"]',
    featured: '[class*="featured"], [class*="highlight"], [class*="top"]',
    exclusive: '[class*="exclusive"], [class*="special"]',
  };

  constructor() {
    super(AtYarisiAdapter.SITE_CODE, AtYarisiAdapter.BASE_URL);
  }

  canHandle(url: string): boolean {
    const hostname = new URL(url).hostname;
    return hostname.includes('atyarisi') || hostname.includes('atyarisi.com');
  }

  async extractCards(page: Page): Promise<RawCampaignCard[]> {
    const cards: RawCampaignCard[] = [];

    // /kampanyalar sayfası login gerektiriyor, bu yüzden bilinen kampanya URL'lerini direkt kullan
    const knownCampaignUrls = AtYarisiAdapter.KNOWN_CAMPAIGNS.map(
      c => `${AtYarisiAdapter.BASE_URL}/kampanyalar/${c.slug}/${c.id}`
    );

    console.log(`AtYarisi: Using ${knownCampaignUrls.length} known campaign URLs`);

    for (const campaignUrl of knownCampaignUrls) {
      try {
        const result = await this.visitDetailPage(page, campaignUrl, { waitMs: 1000 });

        if (!result?.body) {
          console.log(`AtYarisi: No content from ${campaignUrl}`);
          continue;
        }

        // Detail page'den kampanya bilgilerini çıkar
        const cardData = await page.evaluate((body: string) => {
          const parser = new DOMParser();
          const doc = parser.parseFromString(body, 'text/html');

          const title = doc.querySelector('h1')?.textContent?.trim() 
            || doc.querySelector('[class*="title"]')?.textContent?.trim() 
            || '';

          const description = doc.querySelector('[class*="desc"], [class*="description"], [class*="content"], p')?.textContent?.trim() 
            || null;

          const bonusPercentageText = doc.querySelector('[class*="oran"], [class*="rate"], [class*="percent"]')?.textContent?.trim() 
            || null;

          const termsEl = doc.querySelector('a[href*="kosullar"], a[href*="sart"], a[href*="terms"]');
          const termsUrl = termsEl?.getAttribute('href') ?? null;

          const imgEl = doc.querySelector('img[class*="image"], [class*="img"] img, picture img');
          const imageUrl = imgEl?.getAttribute('src') ?? imgEl?.getAttribute('data-src') ?? null;

          // Tarihleri sayfadaki metinden çıkar
          const pageText = doc.body?.textContent || '';
          const dateMatch = pageText.match(/(\d{2}[./]\d{2}[./]\d{4})/g);
          let startDateText = null;
          let endDateText = null;
          if (dateMatch && dateMatch.length >= 2) {
            startDateText = dateMatch[0];
            endDateText = dateMatch[1];
          } else if (dateMatch && dateMatch.length === 1) {
            endDateText = dateMatch[0];
          }

          return {
            title,
            description,
            bonusPercentageText,
            termsUrl,
            imageUrl,
            startDateText,
            endDateText,
          };
        }, result.body);

        // URL'den slug ve ID çıkar
        const urlMatch = campaignUrl.match(/\/kampanyalar\/([^/]+)\/(\d+)/);
        const slug = urlMatch?.[1] || '';
        const id = urlMatch?.[2] || `${Date.now()}`;

        const card: RawCampaignCard = {
          siteCode: this.siteCode,
          rawId: `atyarisi-${id}`,
          title: cardData.title,
          description: cardData.description || result.body?.substring(0, 500) || null,
          bonusAmount: null,
          bonusPercentage: extractNumericValue(cardData.bonusPercentageText),
          minDeposit: null,
          maxBonus: null,
          code: null,
          url: campaignUrl,
          imageUrl: normalizeImageUrl(this.baseUrl, cardData.imageUrl),
          startDate: cardData.startDateText,
          endDate: cardData.endDateText,
          termsUrl: cardData.termsUrl ? this.buildCampaignUrl(cardData.termsUrl) : null,
          category: null,
          badge: null,
          isFeatured: false,
          isExclusive: false,
          rawData: { slug, campaignId: id },
          scrapedAt: new Date(),
        };

        cards.push(card);
        console.log(`AtYarisi: Extracted campaign: ${card.title}`);
      } catch (error) {
        console.error(`AtYarisi: Error extracting campaign from ${campaignUrl}: ${error}`);
      }
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
        const links = Array.from(document.querySelectorAll('a[href*="bonus"], a[href*="kampanya"], a[href*="promosyon"]'));
        return links.map((link: Element) => {
          const container = link.closest('[class*="item"], [class*="card"], [class*="campaign"], [class*="bonus"], article, section');
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
    if (card.title.toLowerCase().includes('freebet') || card.title.toLowerCase().includes('bedava bahis')) {
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

export default AtYarisiAdapter;
