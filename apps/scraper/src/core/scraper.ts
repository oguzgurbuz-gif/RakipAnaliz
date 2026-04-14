import { Browser, Page } from 'puppeteer';
import { logger } from '../utils/logger';
import { retry } from '../utils/retry';
import { adapterRegistry, SiteAdapter } from '../adapters';
import { SiteConfig, RawCampaignCard, NormalizedCampaignInput, ScrapeRun, ScrapeError, VisibilityTracking } from '../types';
import { processDedupLogic, DedupResult } from './dedup';
import { findExistingCampaign, getLatestCampaignVersion, insertCampaign, insertCampaignVersion, updateCampaign, markCampaignSeen, updateCampaignVisibilityByFingerprint, getActiveCampaignsBySite, updateSiteScrapeStatus, getDb, insertScrapeRun, updateScrapeRun, queryOne } from '../db';
import { publishScrapeEvent } from '../publish/sse';
import { shouldTriggerAiExtraction, triggerAiDateExtraction } from '../date-extraction/ai-fallback';
import { getInvalidCampaignReason } from '../normalizers/text';

export class ScrapeManager {
  private browser: Browser | null = null;
  private activeSites: Map<string, boolean> = new Map();
  private activeRuns: Map<string, ScrapeRun> = new Map();

  async initialize(): Promise<void> {
    logger.info('Initializing ScrapeManager');
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down ScrapeManager');
    this.activeSites.clear();

    for (const [siteCode, run] of this.activeRuns) {
      if (run.status === 'running') {
        run.status = 'failed';
        run.completedAt = new Date();
        run.errors.push({
          phase: 'navigation',
          message: 'ScrapeManager shutdown during execution',
          timestamp: new Date(),
        });
      }
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async processSite(siteCode: string, config: SiteConfig): Promise<ScrapeRun> {
    if (this.activeSites.get(siteCode)) {
      throw new Error(`ScrapeManager is already running a scrape operation for site: ${siteCode}`);
    }

    this.activeSites.set(siteCode, true);
    const startTime = Date.now();

    const run: ScrapeRun = {
      id: crypto.randomUUID(),
      siteCode,
      status: 'running',
      startedAt: new Date(),
      completedAt: null,
      cardsFound: 0,
      newCampaigns: 0,
      updatedCampaigns: 0,
      unchanged: 0,
      errors: [],
    };

    this.activeRuns.set(siteCode, run);

    // Get site ID and insert scrape_runs record
    let dbRunId: string | null = null;
    try {
      const siteRow = await queryOne<{ id: string }>(
        `SELECT id FROM sites WHERE code = $1`,
        [siteCode]
      );
      if (siteRow) {
        dbRunId = await insertScrapeRun(getDb(), {
          siteId: siteRow.id,
          status: 'running',
          startedAt: new Date(),
          cardsFound: 0,
          newCampaigns: 0,
          updatedCampaigns: 0,
          unchanged: 0,
          errors: null,
        });
        run.id = dbRunId; // Use the DB-generated ID for consistency
      }
    } catch (err) {
      logger.warn(`Failed to insert scrape_runs record for ${siteCode}`, { error: err instanceof Error ? err.message : 'Unknown' });
    }

    try {
      const adapter = adapterRegistry.get(siteCode);
      if (!adapter) {
        throw new Error(`No adapter found for site: ${siteCode}`);
      }

      logger.info(`Starting scrape for site: ${siteCode}`, {
        siteCode,
        baseUrl: config.baseUrl,
      });

      await this.scrapeWithAdapter(adapter, config, run);

      run.status = run.errors.length > 0 && run.cardsFound === 0 ? 'failed' : run.errors.length > 0 ? 'partial' : 'success';

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Scrape failed for site: ${siteCode}`, {
        siteCode,
        error: errorMessage,
      });

      run.status = 'failed';
      run.errors.push({
        phase: 'navigation',
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date(),
      });
    } finally {
      run.completedAt = new Date();
      const duration = Date.now() - startTime;
      this.activeSites.delete(siteCode);

      logger.info(`Scrape completed for site: ${siteCode}`, {
        siteCode,
        status: run.status,
        cardsFound: run.cardsFound,
        newCampaigns: run.newCampaigns,
        updatedCampaigns: run.updatedCampaigns,
        durationMs: duration,
      });

      await this.updateSiteStats(siteCode, run);
      await publishScrapeEvent(siteCode, run);

      // Update scrape_runs record in DB
      if (dbRunId) {
        try {
          await updateScrapeRun(getDb(), dbRunId, {
            status: run.status,
            completedAt: run.completedAt,
            cardsFound: run.cardsFound,
            newCampaigns: run.newCampaigns,
            updatedCampaigns: run.updatedCampaigns,
            unchanged: run.unchanged,
            errors: run.errors.length > 0 ? JSON.stringify(run.errors.map(e => e.message)) : null,
          });
        } catch (err) {
          logger.warn(`Failed to update scrape_runs record for ${siteCode}`, { error: err instanceof Error ? err.message : 'Unknown' });
        }
      }

      this.activeRuns.delete(siteCode);
    }

    return run;
  }

  private async scrapeWithAdapter(
    adapter: SiteAdapter,
    config: SiteConfig,
    run: ScrapeRun
  ): Promise<void> {
    if (!this.browser) {
      const puppeteer = await import('puppeteer');
      this.browser = await puppeteer.default.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
    }

    const page = await this.browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      const url = adapter.campaignsUrl;
      await this.loadPage(page, url, run);

      const visibilityTracking = await this.processCampaigns(adapter, page, run);

      await this.handleVisibilityChanges(run.siteCode, visibilityTracking);

    } finally {
      await page.close();
    }
  }

  private async loadPage(page: Page, url: string, run: ScrapeRun): Promise<void> {
    try {
      await retry(
        async () => {
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
        },
        {
          maxAttempts: 3,
          initialDelayMs: 2000,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
        },
        `page.goto:${run.siteCode}`
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      run.errors.push({
        phase: 'navigation',
        message: `Failed to load page: ${errorMessage}`,
        url,
        timestamp: new Date(),
      });
      throw error;
    }
  }

  private async processCampaigns(
    adapter: SiteAdapter,
    page: Page,
    run: ScrapeRun
  ): Promise<VisibilityTracking> {
    const tracking: VisibilityTracking = {
      previouslyVisible: new Set(),
      currentlyVisible: new Set(),
      newlyHidden: new Set(),
      newlyVisible: new Set(),
    };

    try {
      const cards = await adapter.extractCards(page);
      run.cardsFound = cards.length;

      logger.info(`Extracted ${cards.length} raw cards from ${run.siteCode}`, {
        siteCode: run.siteCode,
      });

      const existingCampaigns = await this.getExistingCampaignsForSite(run.siteCode);
      for (const fp of Object.keys(existingCampaigns)) {
        tracking.previouslyVisible.add(fp);
      }

      for (const card of cards) {
        try {
          const normalized = adapter.normalize(card);
          const invalidReason = getInvalidCampaignReason(normalized.title, normalized.description);

          if (invalidReason) {
            logger.warn(`Skipping invalid campaign candidate`, {
              siteCode: run.siteCode,
              invalidReason,
              title: normalized.title,
              url: normalized.url,
            });
            continue;
          }

          const result = await this.processNormalizedCampaign(normalized);

          if (result.action === 'create') {
            run.newCampaigns++;
            tracking.currentlyVisible.add(normalized.fingerprint);
          } else if (result.action === 'update') {
            run.updatedCampaigns++;
            tracking.currentlyVisible.add(normalized.fingerprint);
          } else if (result.action === 'skip' || result.action === 'ignore') {
            run.unchanged++;
            tracking.currentlyVisible.add(normalized.fingerprint);
          }

          if (result.action === 'create' || result.action === 'update') {
            if (result.action === 'update' && result.campaign) {
              await this.scheduleAiAnalysisForUpdate(result.campaign.id, normalized);
            }
            await this.triggerDateExtractionIfNeeded(result, normalized);
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          run.errors.push({
            phase: 'normalization',
            message: `Failed to process card: ${errorMessage}`,
            url: card.url,
            timestamp: new Date(),
          });
        }
      }

      for (const fp of tracking.previouslyVisible) {
        if (!tracking.currentlyVisible.has(fp)) {
          tracking.newlyHidden.add(fp);
        }
      }

      for (const fp of tracking.currentlyVisible) {
        if (!tracking.previouslyVisible.has(fp)) {
          tracking.newlyVisible.add(fp);
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      run.errors.push({
        phase: 'extraction',
        message: `Failed to extract cards: ${errorMessage}`,
        timestamp: new Date(),
      });
      throw error;
    }

    return tracking;
  }

  async processNormalizedCampaign(normalized: NormalizedCampaignInput): Promise<DedupResult> {
    const existingCampaign = await findExistingCampaign(normalized.fingerprint);
    const existingVersion = existingCampaign
      ? await getLatestCampaignVersion(existingCampaign.id)
      : null;

    const dedupResult = processDedupLogic(normalized, existingCampaign, existingVersion);

    switch (dedupResult.action) {
      case 'create':
        await insertCampaign(normalized);
        break;

      case 'update':
        if (dedupResult.campaign && dedupResult.diff) {
          const db = getDb();
          await insertCampaignVersion(
            db,
            dedupResult.campaign.id,
            normalized,
            dedupResult.diff,
            dedupResult.changeType
          );
          await updateCampaign(dedupResult.campaign.id, normalized);
        }
        break;

      case 'skip':
      case 'ignore':
        if (dedupResult.campaign) {
          await markCampaignSeen(dedupResult.campaign.id);
        }
        break;
    }

    return dedupResult;
  }

  private async handleVisibilityChanges(
    siteCode: string,
    tracking: VisibilityTracking
  ): Promise<void> {
    for (const fingerprint of tracking.newlyHidden) {
      logger.info(`Campaign became hidden`, { siteCode, fingerprint });
      await updateCampaignVisibilityByFingerprint(fingerprint, 'hidden');
    }

    for (const fingerprint of tracking.newlyVisible) {
      logger.info(`Campaign became visible`, { siteCode, fingerprint });
      await updateCampaignVisibilityByFingerprint(fingerprint, 'visible');
    }
  }

  private async triggerDateExtractionIfNeeded(
    dedupResult: DedupResult,
    normalized: NormalizedCampaignInput
  ): Promise<void> {
    if (!normalized.endDate) {
      const trigger = shouldTriggerAiExtraction(
        normalized.title,
        normalized.description,
        null,
        { startDate: null, endDate: null, confidence: 0, matchedRule: null, rawTexts: { start: null, end: null } }
      );

      if (trigger.shouldTrigger && dedupResult.campaign) {
        logger.info(`Triggering AI date extraction`, {
          campaignId: dedupResult.campaign.id,
          reason: trigger.reason,
          priority: trigger.priority,
        });

        await triggerAiDateExtraction({
          campaignId: dedupResult.campaign.id,
          title: normalized.title,
          description: normalized.description,
          termsUrl: normalized.termsUrl,
          termsText: null,
          rawData: {},
        });
      }
    }
  }

  private async scheduleAiAnalysisForUpdate(
    campaignId: string,
    normalized: NormalizedCampaignInput
  ): Promise<void> {
    try {
      const { jobScheduler } = await import('../jobs/scheduler');

      await jobScheduler.scheduleJob(
        'ai-analysis',
        {
          campaignId,
          title: normalized.title,
          description: normalized.description,
          termsUrl: normalized.termsUrl,
          termsText: null,
          priority: 'high',
          validFrom: normalized.startDate?.toISOString() ?? null,
          validTo: normalized.endDate?.toISOString() ?? null,
          bonusAmount: normalized.bonusAmount,
          bonusPercentage: normalized.bonusPercentage,
          minDeposit: normalized.minDeposit,
          maxBonus: normalized.maxBonus,
          isFreebet: normalized.bonusType === 'freebet' || normalized.bonusType === 'mixed',
          isCashback: normalized.bonusType === 'cashback' || normalized.bonusType === 'mixed',
          sportsType: normalized.category,
        },
        { priority: 80 }
      );
    } catch (error) {
      logger.warn(`Failed to schedule AI analysis for updated campaign ${campaignId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async getExistingCampaignsForSite(siteCode: string): Promise<Record<string, import('../types').Campaign>> {
    const campaigns = await getActiveCampaignsBySite(siteCode);
    const map: Record<string, import('../types').Campaign> = {};
    for (const campaign of campaigns.values()) {
      const fp = campaign.fingerprint;
      map[fp] = campaign;
    }
    return map;
  }

  private async updateSiteStats(siteCode: string, run: ScrapeRun): Promise<void> {
    await updateSiteScrapeStatus(
      siteCode,
      run.status === 'success' ? 'success' : run.status === 'partial' ? 'success' : 'failed',
      run.errors.length > 0 ? run.errors.map((e) => e.message).join('; ') : null
    );
  }

  getActiveRun(siteCode: string): ScrapeRun | undefined {
    return this.activeRuns.get(siteCode);
  }

  isCurrentlyRunning(): boolean {
    return this.activeSites.size > 0;
  }

  getActiveRunCount(): number {
    return this.activeRuns.size;
  }
}

export const scrapeManager = new ScrapeManager();
