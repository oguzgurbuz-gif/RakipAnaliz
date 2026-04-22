import { Page } from 'puppeteer';
import { BaseAdapter } from './base';
import { RawCampaignCard, NormalizedCampaignInput } from '../types';
import { buildFingerprint, buildRawFingerprint } from '../normalizers/fingerprint';
import { extractNumericValue, isLikelyRealCampaignTitle } from '../normalizers/text';
import { normalizeImageUrl } from '../normalizers/image';
import { extractDatesFromCampaignText } from '../date-extraction/parser';

export class HipodromAdapter extends BaseAdapter {
  private static readonly SITE_CODE = 'hipodrom';
  private static readonly BASE_URL = 'https://www.hipodrom.com';
  public readonly campaignsUrl = 'https://www.hipodrom.com/kampanyalar';

  // Turkish month name → 0-indexed JS month. Used for the listing-card
  // "Son Katılım Tarihi: 30 Nisan 2026" format. Lowercased lookup so we
  // don't have to worry about casing variations from the site.
  private static readonly TURKISH_MONTHS: Record<string, number> = {
    ocak: 0,
    şubat: 1,
    mart: 2,
    nisan: 3,
    mayıs: 4,
    haziran: 5,
    temmuz: 6,
    ağustos: 7,
    eylül: 8,
    ekim: 9,
    kasım: 10,
    aralık: 11,
  };

  /** Parse "DD.MM.YYYY" or "D.M.YY" → Date (UTC midnight). */
  private static parseDottedDate(text: string): Date | null {
    const parts = text.split('.');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null;
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /** Parse "30", "Nisan", "2026" → Date (UTC midnight). */
  private static parseTurkishLongDate(
    dayStr: string,
    monthStr: string,
    yearStr: string
  ): Date | null {
    const day = parseInt(dayStr, 10);
    const year = parseInt(yearStr, 10);
    const monthIdx = HipodromAdapter.TURKISH_MONTHS[monthStr.toLowerCase()];
    if (
      Number.isNaN(day) ||
      Number.isNaN(year) ||
      monthIdx === undefined ||
      day < 1 ||
      day > 31
    ) {
      return null;
    }
    const d = new Date(Date.UTC(year, monthIdx, day));
    return Number.isNaN(d.getTime()) ? null : d;
  }

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

    // Hipodrom-specific date extraction. We bypass the generic
    // extractDatesFromCampaignText() pipeline for this adapter because the
    // generic STANDALONE_DATE_RULES match "Başlama Tarihi: DD.MM.YYYY" alone
    // and treat that single date as the END date — silently dropping the
    // real Bitiş Tarihi and producing start==end (the bug we are fixing).
    //
    // Hipodrom exposes dates in two distinct shapes:
    //   1. Listing card (.campaignDate):  "Son Katılım Tarihi: 30 Nisan 2026"
    //   2. Detail page  (.cDetailConditions):
    //        "Başlama Tarihi: 30.01.2026 09:15 - Bitiş Tarihi: 30.04.2026 23:55"
    //
    // Detail wins (it gives both start and end). Listing acts as a fallback
    // for the end date when the detail page is not yet hydrated / missing.
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (card.description) {
      // 1) Detail page combined regex — guarantees two distinct captures.
      const combined = card.description.match(
        /ba[şs]lama\s*tarihi\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{2,4})(?:\s+\d{1,2}[:.]\d{2})?\s*[-–]\s*biti[şs]\s*tarihi\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/i
      );
      if (combined) {
        const start = HipodromAdapter.parseDottedDate(combined[1]);
        const end = HipodromAdapter.parseDottedDate(combined[2]);
        if (start) startDate = start;
        if (end) endDate = end;
      }

      // 2) Detail page individual labels — fallback if combined regex misses
      // (e.g. line break between Başlama/Bitiş or different separator).
      if (!startDate) {
        const startMatch = card.description.match(
          /ba[şs]lama\s*tarihi\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/i
        );
        if (startMatch) {
          const d = HipodromAdapter.parseDottedDate(startMatch[1]);
          if (d) startDate = d;
        }
      }
      if (!endDate) {
        const endMatch = card.description.match(
          /biti[şs]\s*tarihi\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/i
        );
        if (endMatch) {
          const d = HipodromAdapter.parseDottedDate(endMatch[1]);
          if (d) endDate = d;
        }
      }

      // 3) Listing-style fallback for end date: "Son Katılım Tarihi: 30 Nisan 2026"
      // Note the previous version had a typo (kat[ıi]l[ıi]n instead of kat[ıi]l[ıi]m)
      // which made this branch dead.
      if (!endDate) {
        const sonKatilim = card.description.match(
          /son\s*kat[ıi]l[ıi]m\s*tarihi\s*:?\s*(\d{1,2})\s+([A-Za-zÇĞİıÖŞÜçğıöşü]+)\s+(\d{4})/i
        );
        if (sonKatilim) {
          const d = HipodromAdapter.parseTurkishLongDate(
            sonKatilim[1],
            sonKatilim[2],
            sonKatilim[3]
          );
          if (d) endDate = d;
        }
      }
    }

    // 4) As a last-ditch fallback only (i.e. nothing matched above), defer to
    // the generic extractor. We deliberately do not let it overwrite anything
    // we already found — it is known to mis-classify Hipodrom text.
    if (!startDate && !endDate) {
      const dateResult = extractDatesFromCampaignText(card.title, card.description);
      startDate = dateResult.startDate;
      endDate = dateResult.endDate;
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
