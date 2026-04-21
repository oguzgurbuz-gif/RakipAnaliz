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

  abstract normalize(card: RawCampaignCard): NormalizedCampaignInput | null;

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

  /**
   * Visit multiple detail pages with controlled concurrency (BE-2)
   * Uses a semaphore pattern to limit simultaneous visits
   */
  public async visitDetailPagesConcurrently(
    browser: Browser,
    urls: string[],
    options: {
      concurrency?: number;
      waitMs?: number;
      timeout?: number;
    } = {}
  ): Promise<Map<string, DetailPageResult>> {
    const { concurrency = 3, waitMs = 500, timeout = 30000 } = options;
    const results = new Map<string, DetailPageResult>();
    let activeCount = 0;
    let currentIndex = 0;

    const processNext = async (): Promise<void> => {
      while (true) {
        while (activeCount >= concurrency) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (currentIndex >= urls.length) break;
        
        const url = urls[currentIndex++];
        activeCount++;
        
        const page = await browser.newPage();
        try {
          const result = await this.visitDetailPage(page, url, { waitMs, timeout });
          results.set(url, result);
        } catch (error) {
          logger.warn(`Failed to visit detail page: ${url}`, {
            siteCode: this.siteCode,
            error: error instanceof Error ? error.message : 'Unknown',
          });
          results.set(url, { body: null, rawDateText: null, termsUrl: null });
        } finally {
          await page.close();
          activeCount--;
        }
      }
    };

    // Start concurrent workers
    const workers = Array(Math.min(concurrency, urls.length))
      .fill(null)
      .map(() => processNext());

    await Promise.all(workers);
    return results;
  }

  /**
   * BE-1: Semantic selectors for more robust extraction
   * Falls back to semantic/ARIA selectors when CSS selectors fail
   */
  protected async extractWithSemanticFallback(
    page: Page,
    cssSelector: string,
    semanticSelector: string
  ): Promise<string | null> {
    // Try CSS selector first
    try {
      const result = await this.extractText(page, cssSelector);
      if (result) return result;
    } catch {}

    // Fall back to semantic selector
    try {
      const result = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el?.textContent?.trim() ?? null;
      }, semanticSelector);
      if (result) return result;
    } catch {}

    return null;
  }

  /**
   * BE-1: AI-based extraction as ultimate fallback (when selectors and semantic fail)
   */
  protected async extractWithAiFallback(
    page: Page,
    failedSelectors: string[]
  ): Promise<string | null> {
    // Get page content
    const content = await page.evaluate(() => {
      const main = document.querySelector('main, [role="main"], article, .content, #content');
      return main?.textContent?.trim() ?? document.body.textContent?.trim() ?? null;
    });

    if (!content || content.length < 50) return null;

    logger.info(`AI fallback extraction triggered for ${this.siteCode}`, {
      failedSelectors,
      contentLength: content.length,
    });

    // The AI fallback would be triggered here
    // For now, return the content for manual processing
    return content.length > 5000 ? content.substring(0, 5000) : content;
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

  /**
   * BE-3: Setup Intersection Observer for lazy loading scroll triggers
   * Returns a function to check if more content should be loaded
   */
  protected setupLazyLoadingObserver(
    page: Page,
    options: {
      rootMargin?: string;
      threshold?: number;
    } = {}
  ): { observe: () => Promise<void>; disconnect: () => void } {
    const { rootMargin = '200px', threshold = 0 } = options;
    let triggered = false;

    const observer = {
      triggered: false,
      disconnect: () => {
        triggered = true;
      },
    };

    return {
      async observe() {
        await page.evaluate(({ rootMargin, threshold }) => {
          return new Promise<void>((resolve) => {
            let observerCallback: IntersectionObserverCallback;
            
            observerCallback = (entries) => {
              for (const entry of entries) {
                if (entry.isIntersecting) {
                  // Set a flag that can be checked later
                  (window as any).__lazyLoadTriggered = true;
                  resolve();
                  break;
                }
              }
            };

            const observer = new IntersectionObserver(observerCallback, {
              rootMargin,
              threshold,
            });

            // Observe the last element or a sentinel
            const sentinel = document.querySelector('.campaign-card:last-child, .load-more-sentinel, [data-lazy-load]');
            if (sentinel) {
              observer.observe(sentinel);
            } else {
              resolve();
            }
          });
        }, { rootMargin, threshold });
      },
      disconnect: () => {
        triggered = true;
      },
    };
  }

  /**
   * Extracts clean campaign body text from a detail page.
   * Falls back to progressively broader selectors, stopping before full document.body.
   * Returns null if no meaningful content is found.
   */
  public async extractDetailBody(page: Page): Promise<string | null> {
    // Specific campaign detail selectors — most reliable
    const specificSelectors = [
      '.campaign-detail',
      '.campaign-detail-content',
      '.campaign-description',
      '.campaign-info',
      '[class*="campaign-detail"]',
      '[class*="campaign-info"]',
      '[class*="terms"]',
      '.detail-body',
      'article',
    ];

    // Article-like containers — second tier
    const articleSelectors = [
      'main',
      '[role="main"]',
      '.content',
      '#content',
    ];

    for (const selector of [...specificSelectors, ...articleSelectors]) {
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

    // Last resort: get the largest text block that looks like campaign content
    // Never use raw document.body.innerText as it grabs full SPA shell
    try {
      const result = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('p, li, td, th, span, div'));
        let bestText = '';
        let bestLen = 0;

        for (const el of candidates) {
          const text = el.textContent?.trim() ?? '';
          // Skip navigation, header, footer elements
          const tag = el.tagName.toLowerCase();
          const className = el.className ?? '';
          const id = el.id ?? '';
          if (tag === 'nav' || tag === 'header' || tag === 'footer' || tag === 'script' || tag === 'style') continue;
          if (className.includes('nav') || className.includes('menu') || className.includes('footer') || className.includes('header')) continue;
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

  /**
   * Cleans extracted body text by removing navigation noise, excessive whitespace, etc.
   */
  protected cleanBodyText(text: string): string {
    if (!text) return '';
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*/g, '\n')
      .trim();
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
