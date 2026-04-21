import { Page } from 'puppeteer';
import { BaseAdapter } from './base';
import { RawCampaignCard, NormalizedCampaignInput } from '../types';
import { buildFingerprint, buildRawFingerprint } from '../normalizers/fingerprint';
import { extractNumericValue, isLikelyRealCampaignTitle } from '../normalizers/text';
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

  /**
   * Hipodrom-specific detail body extraction for SPA pages.
   * Uses AI fallback since standard selectors don't work due to SPA shell rendering.
   */
  async extractDetailBody(page: Page): Promise<string | null> {
    // Order matters: most-specific (richest body) first.
    // .campaignDetailContent / .campaignItemDetail hold the full description (~3.8K chars).
    // .cDetailText is the body without title; .cDetailConditions has the rules + dates.
    // .campaignDetail (without "Content") is the listing-card wrapper and only ~120 chars,
    // so it must come AFTER the rich selectors or it short-circuits the loop.
    const hipodromSelectors = [
      '.campaignDetailContent',
      '.campaignItemDetail',
      '.cDetailText',
      '.detailPage',
      '.campaign-detail',
      '[class*="campaignDetail"]',
      '.kampanya-detay',
      '[class*="kampanya"]',
      '.content-body',
      '.page-content',
    ];

    for (const selector of hipodromSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const text = await element.evaluate((el) => el.textContent?.trim() ?? null);
          if (text && text.length > 50) {
            return text;
          }
        }
      } catch {
        continue;
      }
    }

    // For SPA: wait for content to hydrate then use AI fallback
    try {
      const result = await page.evaluate(() => {
        // Look for the main content area in SPA apps
        const candidates = Array.from(document.querySelectorAll('[class*="content"], [class*="body"], main, article'));
        let bestText = '';
        let bestLen = 0;

        for (const el of candidates) {
          const text = el.textContent?.trim() ?? '';
          const tag = el.tagName.toLowerCase();
          const className = el.className ?? '';
          const id = el.id ?? '';

          // Skip shell/boilerplate elements
          if (tag === 'nav' || tag === 'header' || tag === 'footer') continue;
          if (className.includes('nav') || className.includes('menu') || className.includes('footer') || className.includes('header') || className.includes('sidebar')) continue;
          if (id.includes('nav') || id.includes('menu') || id.includes('footer') || id.includes('header')) continue;

          if (text.length > bestLen && text.length > 100) {
            bestLen = text.length;
            bestText = text;
          }
        }
        return bestText || null;
      });
      return result;
    } catch {
      return null;
    }
  }

  canHandle(url: string): boolean {
    const hostname = new URL(url).hostname;
    return hostname.includes('hipodrom') || hostname.includes('hipodrom.com');
  }

  async extractCards(page: Page): Promise<RawCampaignCard[]> {
    const cards: RawCampaignCard[] = [];

    await this.waitForSelector(page, this.selectors.campaignCard!, { timeout: 15000 });

    const selectorStr = this.selectors.campaignCard!;

    const cardData = await page.evaluate((selector) => {
      const results: any[] = [];
      const cardEls = document.querySelectorAll(selector);

      cardEls.forEach((card, index) => {
        if (card.textContent && card.textContent.trim().length < 30) return;

        let title = '';
        const titleAnchorEl = card.querySelector('.campaignTitle a');
        if (titleAnchorEl?.textContent?.trim()) {
          title = titleAnchorEl.textContent.trim().replace(/\s+/g, ' ');
        } else {
          const titleEl = card.querySelector('[class*="title"]:not(h1):not(h2):not(h3):not(h4)');
          if (titleEl?.textContent?.trim()) {
            title = titleEl.textContent.trim().replace(/\s+/g, ' ');
          } else {
            const headings = Array.from(card.querySelectorAll('h1, h2, h3, h4'));
            for (const h of headings) {
              const text = h.textContent?.trim() ?? '';
              if (text && text.length < 200) { title = text.replace(/\s+/g, ' '); break; }
            }
            if (!title) { const text = card.textContent?.trim() ?? ''; title = text.length < 300 ? text.replace(/\s+/g, ' ') : ''; }
          }
        }
        if (!title || title.length < 3) return;

        const descriptionEl = card.querySelector('.campaignDetail .campaignDate');
        const description = descriptionEl?.textContent?.trim() || null;

        const urlEl = card.querySelector('.campaignDetail .campaignBtn');
        const campaignUrl = urlEl?.getAttribute('href') || '';

        const imgEl = card.querySelector('.campaignPicture img');
        const imageUrl = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || null;

        const rawId = card.getAttribute('data-id') || card.getAttribute('id') || `hipodrom-${index}-${Date.now()}`;

        results.push({ rawId, title, description, campaignUrl, imageUrl });
      });

      return results;
    }, selectorStr);

    for (const data of cardData) {
      const card: RawCampaignCard = {
        siteCode: this.siteCode,
        rawId: data.rawId,
        title: data.title,
        description: data.description,
        bonusAmount: null,
        bonusPercentage: null,
        minDeposit: null,
        maxBonus: null,
        code: null,
        url: this.buildCampaignUrl(data.campaignUrl),
        imageUrl: normalizeImageUrl(this.baseUrl, data.imageUrl),
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

    const listingUrl = page.url();

    for (const card of cards) {
      if (card.url) {
        try {
          await page.goto(card.url, { waitUntil: 'networkidle0', timeout: 20000 });
          // SPA needs extra wait for content hydration
          await new Promise(r => setTimeout(r, 2000));

          const detailBody = await this.extractDetailBody(page);
          if (detailBody && detailBody.length > (card.description?.length ?? 0)) {
            card.description = this.cleanBodyText(detailBody);
          }

          // Extract bonus/percentage from detail page text
          if (card.description) {
            const bonusMatch = card.description.match(/(\d+(?:[.,]\d+)?)\s*TL/i);
            if (bonusMatch) {
              const numericVal = extractNumericValue(bonusMatch[1]);
              card.bonusAmount = numericVal !== null ? String(numericVal) : null;
            }
            const pctMatch = card.description.match(/(\d+(?:[.,]\d+)?)\s*%/);
            if (pctMatch) {
              card.bonusPercentage = parseFloat(pctMatch[1].replace(',', '.'));
            }
          }

          // Extract dates from detail page - "Başlama Tarihi: 30.01.2026 09:15 - Bitiş Tarihi: 30.04.2026 23:55"
          if (card.description && !card.endDate) {
            const fullDateMatch = card.description.match(/Ba[şs]lama\s*Tarihi\s*:\s*(\d{1,2}[.]\d{1,2}[.]\d{2,4})\s*\d{2}:\d{2}\s*-\s*Biti[şs]\s*Tarihi\s*:\s*(\d{1,2}[.]\d{1,2}[.]\d{2,4})/i);
            if (fullDateMatch) {
              card.startDate = fullDateMatch[1];
              card.endDate = fullDateMatch[2];
            }
          }
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

  normalize(card: RawCampaignCard): NormalizedCampaignInput | null {
    // Safety check: validate title quality
    if (!isLikelyRealCampaignTitle(card.title)) {
      return null;
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
      bonusType: 'amount',
      bonusAmount: null,
      bonusPercentage: null,
      minDeposit: null,
      code: null,
      category: null,
    });

    const dateResult = extractDatesFromCampaignText(card.title, card.description);
    let startDate = dateResult.startDate;
    let endDate = dateResult.endDate;

    // Fallback: Hipodrom-specific date extraction from "Başlama Tarihi:" and "Son Katılım Tarihi:" labels
    // This must run regardless of what extractDatesFromCampaignText returned because
    // the generic Kampanya rule (parser.ts) can match wrong dates from surrounding context
    // like "Kampanya 20.03.2025-05.09.2025 saat 09:59" which refers to kazanç limits,
    // not campaign validity dates.
    if (card.description) {
      const startMatch = card.description.match(/ba[şs]lama\s*tarihi\s*:?\s*(\d{1,2}[.]\d{1,2}[.]\d{2,4})/i);
      if (startMatch) {
        const startStr = startMatch[1];
        const parts = startStr.split('.');
        let year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;
        const d = new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        if (d && !isNaN(d.getTime())) {
          startDate = d;
        }
      }
      // Hipodrom specific: "Son Katılım Tarihi: 30 Nisan 2026"
      const endMatch = card.description.match(/son\s*kat[ıi]l[ıi]n\s*tarihi\s*:?\s*(\d{1,2}[.\s]\w+\s*\d{4})/i);
      if (endMatch && !endDate) {
        const endStr = endMatch[1];
        const turkishMonths: Record<string, number> = {
          'Ocak': 0, 'Şubat': 1, 'Mart': 2, 'Nisan': 3, 'Mayıs': 4, 'Haziran': 5,
          'Temmuz': 6, 'Ağustos': 7, 'Eylül': 8, 'Ekim': 9, 'Kasım': 10, 'Aralık': 11
        };
        const monthMatch = endStr.match(/(\w+)/);
        const dayMatch = endStr.match(/(\d{1,2})/);
        const yearMatch = endStr.match(/(\d{4})/);
        if (monthMatch && dayMatch && yearMatch) {
          const month = turkishMonths[monthMatch[1]] ?? 0;
          const day = parseInt(dayMatch[1], 10);
          const year = parseInt(yearMatch[1], 10);
          const d = new Date(year, month, day);
          if (d && !isNaN(d.getTime())) {
            endDate = d;
          }
        }
      }
    }

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
