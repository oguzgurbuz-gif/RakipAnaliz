import { Page } from 'puppeteer';
import { BaseAdapter } from './base';
import { RawCampaignCard, NormalizedCampaignInput } from '../types';
import { buildFingerprint, buildRawFingerprint } from '../normalizers/fingerprint';
import { extractNumericValue, isLikelyRealCampaignTitle } from '../normalizers/text';
import { normalizeImageUrl } from '../normalizers/image';
import { extractDatesFromCampaignText } from '../date-extraction/parser';

export class SonDuzlukAdapter extends BaseAdapter {
  private static readonly SITE_CODE = 'sonduzluk';
  private static readonly BASE_URL = 'https://www.sonduzluk.com';
  private static readonly FALLBACK_URLS = [
    'https://www.sonduzluk.com',
    'https://www.sundzulyuk.com',
    'https://sonduzluk.com',
    'https://sundzulyuk.com',
    'https://www.sondzulyuk.com',
    'https://sondzulyuk.com',
  ];
  public readonly campaignsUrl = 'https://www.sonduzluk.com/kampanyalar';

  protected readonly selectors = {
    // Sondüzlük uses simple class names: .campaign-card, .card-top, .card-bottom
    campaignCard: 'div.campaign-card',
    campaignTitle: '.card-bottom > div:first-child',
    campaignDescription: '.description-text',
    bonusAmount: null, // Site doesn't show bonus amounts on card, only in detail page
    bonusPercentage: null,
    minDeposit: null,
    code: null,
    campaignUrl: 'a.btn-default.primary',
    campaignImage: '.card-top img',
    startDate: null,
    endDate: null,
    termsUrl: 'a[href*="sartlar"], a[href*="kosul"], a[href*="terms"]',
    category: null,
    badge: null,
    featured: null,
    exclusive: null,
  };

  constructor() {
    super(SonDuzlukAdapter.SITE_CODE, SonDuzlukAdapter.BASE_URL);
  }

  canHandle(url: string): boolean {
    const hostname = new URL(url).hostname;
    return (
      hostname.includes('sonduzluk') ||
      hostname.includes('sonduzluk.com') ||
      hostname.includes('sundzulyuk') ||
      hostname.includes('sundzulyuk.com') ||
      hostname.includes('sondzulyuk') ||
      hostname.includes('sondzulyuk.com')
    );
  }

  async extractCards(page: Page): Promise<RawCampaignCard[]> {
    const cards: RawCampaignCard[] = [];

    try {
      await this.waitForSelector(page, this.selectors.campaignCard, { timeout: 25000 });
    } catch {
      // Site layout and anti-bot flows change often; fallback discovery is more resilient.
      return this.fallbackCardDiscovery(page);
    }

    const selectorStr = this.selectors.campaignCard;

    // Sondüzlük gerçek site yapısı: div.campaign-card > div.card-bottom > div.title, div.description-text, a.btn-default.primary
    const cardData = await page.evaluate((selector) => {
      const results: any[] = [];
      const seenUrls: string[] = [];
      const cardEls = document.querySelectorAll(selector);

      cardEls.forEach((card, index) => {
        // Skip cards with very little text
        if (card.textContent && card.textContent.trim().length < 20) return;

        // Sondüzlük gerçek selector'leri:
        // - Başlık: .card-bottom > div:first-child (text-default d18 fw700)
        // - Açıklama: .description-text
        // - Link: a.btn-default.primary
        const cardBottom = card.querySelector('.card-bottom');
        if (!cardBottom) return;

        const titleEl = cardBottom.querySelector(':scope > div:first-child');
        let title = titleEl?.textContent?.trim() ?? '';
        
        // Fallback: herhangi bir heading veya büyük text
        if (!title || title.length < 3) {
          const headings = Array.from(cardBottom.querySelectorAll('h1, h2, h3, h4, [class*="title"], [class*="headline"]'));
          for (const h of headings) {
            const text = h.textContent?.trim() ?? '';
            if (text && text.length < 200) { title = text; break; }
          }
        }
        
        if (!title || title.length < 3) return;

        const rawId = card.getAttribute('data-id') || card.getAttribute('id') || `sonduzluk-${Date.now()}-${index}`;

        // Açıklama: .description-text
        const descriptionEl = cardBottom.querySelector('.description-text');
        const description = descriptionEl?.textContent?.trim() ?? null;

        // Bonus amount/percentage: Sondüzlük'te kart üzerinde yok, detay sayfasında var
        const bonusAmountText = null;
        const bonusPercentageText = null;

        // Min deposit: kart üzerinde yok
        const minDepositText = null;

        // Kod: kart üzerinde yok
        const code = null;

        // Kampanya linki: a.btn-default.primary
        const campaignUrlEl = cardBottom.querySelector('a.btn-default.primary');
        let campaignUrl = '';
        if (campaignUrlEl) {
          const href = campaignUrlEl.getAttribute('href');
          if (href) campaignUrl = href;
        }

        if (campaignUrl && seenUrls.includes(campaignUrl)) {
          return; // skip duplicate
        }
        if (campaignUrl) {
          seenUrls.push(campaignUrl);
        }

        // Görsel: .card-top img
        const cardTop = card.querySelector('.card-top');
        const imageEl = cardTop?.querySelector('img.desktop-only') || cardTop?.querySelector('img');
        const imageUrl = imageEl?.getAttribute('src') ?? imageEl?.getAttribute('data-src') ?? null;

        // Tarihler: kart üzerinde yok, detay sayfasında olabilir
        const startDateText = null;
        const endDateText = null;

        // Şartlar linki
        const termsUrl = null;

        // Kategori: yok
        const category = null;

        // Badge: yok (bazı kartlarda olabilir)
        const badgeEl = card.querySelector('[class*="badge"], [class*="label"]');
        const badge = badgeEl?.textContent?.trim() ?? null;

        const isFeatured = !!(card.querySelector('[class*="featured"], [class*="highlight"]'));
        const isExclusive = !!(card.querySelector('[class*="exclusive"], [class*="vip"]'));

        results.push({
          rawId,
          title,
          description,
          bonusAmountText,
          bonusPercentageText,
          minDepositText,
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
        minDeposit: data.minDepositText,
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
            rawId: `sonduzluk-${Date.now()}-${cards.length}`,
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
