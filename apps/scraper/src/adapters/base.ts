import { Browser, Page, TimeoutError } from 'puppeteer';
import { retry, DEFAULT_RETRY_OPTIONS } from '../utils/retry';
import { logger } from '../utils/logger';
import { RawCampaignCard, AdapterResult, PaginationConfig, NormalizedCampaignInput } from '../types';

export interface DetailPageResult {
  body: string | null;
  rawDateText: string | null;
  termsUrl: string | null;
}

export abstract class BaseAdapter {
  public siteCode: string;
  public baseUrl: string;
  protected selectors: Record<string, string | null> = {};

  constructor(siteCode: string, baseUrl: string, selectors?: Record<string, string>) {
    this.siteCode = siteCode;
    this.baseUrl = baseUrl;
    if (selectors) {
      this.selectors = selectors;
    }
  }

  abstract canHandle(url: string): boolean;

  abstract extractCards(page: Page): Promise<RawCampaignCard[]>;

  abstract normalize(card: RawCampaignCard): NormalizedCampaignInput;

  protected async loadListing(
    page: Page,
    url: string,
    options: {
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
      timeout?: number;
      retries?: number;
    } = {}
  ): Promise<void> {
    const { waitUntil = 'domcontentloaded', timeout = 30000, retries = 3 } = options;

    await retry(
      async () => {
        logger.info(`Loading page: ${url}`, { siteCode: this.siteCode });

        await page.goto(url, {
          waitUntil,
          timeout,
        });

        logger.debug(`Page loaded: ${url}`, { siteCode: this.siteCode });
      },
      {
        maxAttempts: retries,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      },
      `loadListing:${this.siteCode}`
    );
  }

  public async expandAll(
    page: Page,
    expandButtonSelector: string,
    options: {
      maxExpands?: number;
      delayMs?: number;
      retries?: number;
    } = {}
  ): Promise<number> {
    const { maxExpands = 20, delayMs = 500, retries = 3 } = options;
    let expandedCount = 0;

    try {
      for (let i = 0; i < maxExpands; i++) {
        const buttonExists = await page.$(expandButtonSelector);
        if (!buttonExists) {
          break;
        }

        await retry(
          async () => {
            await page.click(expandButtonSelector);
          },
          { maxAttempts: retries },
          `expand:${this.siteCode}:${i}`
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
        expandedCount++;
      }
    } catch (error) {
      logger.warn(`Error during expand operation for ${this.siteCode}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        expandedCount,
      });
    }

    logger.info(`Expand operation completed`, {
      siteCode: this.siteCode,
      expandedCount,
    });

    return expandedCount;
  }

  protected async waitForSelector(
    page: Page,
    selector: string,
    options: {
      timeout?: number;
      visible?: boolean;
    } = {}
  ): Promise<boolean> {
    const { timeout = 10000, visible = false } = options;

    try {
      await page.waitForSelector(selector, {
        timeout,
        visible,
      });
      return true;
    } catch (error) {
      if (error instanceof TimeoutError) {
        return false;
      }
      throw error;
    }
  }

  protected async extractAttribute(
    page: Page,
    selector: string,
    attribute: string
  ): Promise<string | null> {
    try {
      return await page.$eval(selector, (el, attr) => {
        return el.getAttribute(attr);
      }, attribute);
    } catch {
      return null;
    }
  }

  protected async extractText(
    page: Page,
    selector: string
  ): Promise<string | null> {
    try {
      const text = await page.$eval(selector, (el) => el.textContent?.trim() ?? null);
      return text;
    } catch {
      return null;
    }
  }

  protected async extractAllTexts(
    page: Page,
    selector: string
  ): Promise<string[]> {
    try {
      const texts = await page.$$eval(selector, (elements) =>
        elements.map((el) => el.textContent?.trim() ?? '').filter(Boolean)
      );
      return texts;
    } catch {
      return [];
    }
  }

  protected async evaluateInContext<T>(
    page: Page,
    fn: (params: unknown) => T,
    params?: unknown
  ): Promise<T | null> {
    try {
      return await page.evaluate(fn, params);
    } catch {
      return null;
    }
  }

  public getPaginationConfig(): PaginationConfig {
    return {
      hasNextPage: false,
    };
  }

  protected buildCampaignUrl(path: string): string {
    if (path.startsWith('http')) {
      return path;
    }
    try {
      const base = new URL(this.baseUrl);
      return `${base.origin}${path.startsWith('/') ? path : '/' + path}`;
    } catch {
      return path;
    }
  }

  protected logExtractionResult(cardsFound: number, duration: number): void {
    logger.info(`Extraction completed for ${this.siteCode}`, {
      siteCode: this.siteCode,
      cardsFound,
      durationMs: duration,
    });
  }

  public async visitDetailPage(
    page: Page,
    detailUrl: string,
    options: {
      waitMs?: number;
      timeout?: number;
    } = {}
  ): Promise<DetailPageResult> {
    const { waitMs = 500, timeout = 30000 } = options;

    await page.goto(detailUrl, {
      waitUntil: 'networkidle0',
      timeout,
    });

    await new Promise((resolve) => setTimeout(resolve, waitMs));

    const body = await this.extractDetailBody(page);

    const rawDateText = await this.extractDateText(page);

    const termsUrl = await this.extractTermsUrl(page);

    return {
      body,
      rawDateText,
      termsUrl,
    };
  }

  public async extractDetailBody(page: Page): Promise<string | null> {
    const selectors = [
      '.campaign-detail',
      '.campaign-content',
      '.detail-body',
      '[class*="description"]',
      '[class*="content"]',
      'article',
      '.content',
      'main',
    ];

    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const text = await element.evaluate((el) => el.textContent?.trim() ?? null);
          if (text) {
            return text;
          }
        }
      } catch {
        continue;
      }
    }

    try {
      return await page.evaluate(() => document.body.innerText?.trim() ?? null);
    } catch {
      return null;
    }
  }

  private async extractDateText(page: Page): Promise<string | null> {
    const dateSelectors = [
      '[class*="date"]',
      '[class*="time"]',
      '[class*="publish"]',
      'time',
      '[datetime]',
    ];

    for (const selector of dateSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const text = await element.evaluate((el) => {
            if (el instanceof HTMLTimeElement && el.dateTime) {
              return el.dateTime;
            }
            return el.textContent?.trim() ?? null;
          });
          if (text) {
            return text;
          }
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private async extractTermsUrl(page: Page): Promise<string | null> {
    const termsSelectors = [
      'a[href*="terms"]',
      'a[href*="condition"]',
      'a[href*="kural"]',
      'a[href*="şart"]',
      '.terms-link',
      '.conditions-link',
    ];

    for (const selector of termsSelectors) {
      try {
        const href = await page.$eval(selector, (el) => (el as HTMLAnchorElement).href);
        if (href) {
          return href;
        }
      } catch {
        continue;
      }
    }

    return null;
  }
}
