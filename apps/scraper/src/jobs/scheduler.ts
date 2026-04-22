import { logger } from '../utils/logger';
import { getDb } from '../db';
import { JobRecord, JobType, SiteConfig } from '../types';
import * as queries from '../db/queries';
import { publishJobEvent } from '../publish/sse';
import { processAiAnalysisJob } from './ai-analysis';
import { processAiAnalysisBatchJob } from './ai-analysis-batch';
import { processDateExtractionJob } from './date-extraction';
import { processWeeklyReportJob } from './weekly-report';
import { processStatusRecalcJob } from './status-recalc';
import { processMomentumRecalcJob } from './momentum-recalc';
import { startCompetitiveIntentReprocess } from './reprocess-competitive-intent';
import { processSimilarityCalcJob } from './similarity-calc';
import { EventEmitter } from 'events';

// BE-13: Graceful Shutdown event emitter for coordination
export const schedulerEvents = new EventEmitter();
schedulerEvents.setMaxListeners(50);

// BE-13: Graceful shutdown state
interface GracefulShutdownState {
  isShuttingDown: boolean;
  shutdownInitiatedAt: number | null;
  shutdownTimeoutMs: number;
  forceShutdownTimeoutMs: number;
}

const shutdownState: GracefulShutdownState = {
  isShuttingDown: false,
  shutdownInitiatedAt: null,
  shutdownTimeoutMs: 30000, // 30 seconds to finish active jobs
  forceShutdownTimeoutMs: 60000, // 60 seconds total before force kill
};

export class JobScheduler {
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private pollIntervalMs: number = 5000;
  // BE-8: maxConcurrentJobs is now configurable via env var
  private maxConcurrentJobs: number = parseInt(process.env.MAX_CONCURRENT_JOBS ?? '3', 10);
  private activeJobs: Map<number, NodeJS.Timeout> = new Map();
  private completedJobs: number = 0;
  private failedJobs: number = 0;

  constructor() {
    // BE-13: Register signal handlers for graceful shutdown
    if (typeof process !== 'undefined') {
      process.on('SIGTERM', () => this.initiateGracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => this.initiateGracefulShutdown('SIGINT'));
      process.on('SIGQUIT', () => this.initiateGracefulShutdown('SIGQUIT'));
    }
  }

  // BE-13: Initiate graceful shutdown
  public async initiateGracefulShutdown(signal: string): Promise<void> {
    if (shutdownState.isShuttingDown) {
      logger.warn('Graceful shutdown already in progress');
      return;
    }

    shutdownState.isShuttingDown = true;
    shutdownState.shutdownInitiatedAt = Date.now();

    logger.info(`Graceful shutdown initiated by ${signal}`, {
      signal,
      activeJobs: this.activeJobs.size,
      completedJobs: this.completedJobs,
      failedJobs: this.failedJobs,
      shutdownTimeoutMs: shutdownState.shutdownTimeoutMs,
    });

    // Stop accepting new jobs
    this.isRunning = false;

    // Clear the polling interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Emit shutdown event for coordination
    schedulerEvents.emit('shutdown:initiated', {
      signal,
      activeJobs: this.activeJobs.size,
      timestamp: new Date().toISOString(),
    });

    // Wait for active jobs to complete
    try {
      await this.waitForActiveJobs();
    } catch (error) {
      logger.warn('Timeout waiting for active jobs, initiating force shutdown');
      schedulerEvents.emit('shutdown:force', {
        reason: 'timeout',
        activeJobsRemaining: this.activeJobs.size,
      });
    }

    // Cleanup
    this.cleanupActiveJobs();
    
    logger.info('Graceful shutdown completed', {
      totalCompleted: this.completedJobs,
      totalFailed: this.failedJobs,
      shutdownDurationMs: Date.now() - (shutdownState.shutdownInitiatedAt ?? Date.now()),
    });

    schedulerEvents.emit('shutdown:completed', {
      completedJobs: this.completedJobs,
      failedJobs: this.failedJobs,
    });
  }

  // BE-13: Wait for active jobs to complete (with timeout)
  private async waitForActiveJobs(): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 500; // Check every 500ms

    while (this.activeJobs.size > 0) {
      if (Date.now() - startTime > shutdownState.shutdownTimeoutMs) {
        throw new Error('Graceful shutdown timeout');
      }

      logger.debug(`Waiting for ${this.activeJobs.size} active jobs to complete...`);
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));

      schedulerEvents.emit('shutdown:progress', {
        activeJobs: this.activeJobs.size,
        waitTimeMs: Date.now() - startTime,
      });
    }
  }

  // BE-13: Force cleanup of any remaining active jobs
  private cleanupActiveJobs(): void {
    for (const [jobId, timeout] of this.activeJobs) {
      clearTimeout(timeout);
      logger.warn(`Force cleanup: cleared active job ${jobId}`);
    }
    this.activeJobs.clear();
  }

  // BE-13: Check if scheduler is shutting down
  public isShuttingDown(): boolean {
    return shutdownState.isShuttingDown;
  }

  // BE-13: Get shutdown status
  public getShutdownStatus(): {
    isShuttingDown: boolean;
    shutdownDurationMs: number | null;
    activeJobs: number;
  } {
    return {
      isShuttingDown: shutdownState.isShuttingDown,
      shutdownDurationMs: shutdownState.shutdownInitiatedAt 
        ? Date.now() - shutdownState.shutdownInitiatedAt 
        : null,
      activeJobs: this.activeJobs.size,
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('JobScheduler is already running');
      return;
    }

    if (shutdownState.isShuttingDown) {
      logger.warn('Cannot start JobScheduler while shutting down');
      return;
    }

    this.isRunning = true;
    logger.info('JobScheduler started', {
      maxConcurrentJobs: this.maxConcurrentJobs,
      pollIntervalMs: this.pollIntervalMs,
    });

    this.intervalId = setInterval(() => {
      this.pollAndProcessJobs().catch((error) => {
        logger.error('Error in job polling loop', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, this.pollIntervalMs);

    await this.pollAndProcessJobs();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    for (const [jobId, timeout] of this.activeJobs) {
      clearTimeout(timeout);
      logger.warn(`Cleared active job ${jobId}`);
    }
    this.activeJobs.clear();

    logger.info('JobScheduler stopped');
  }

  async scheduleJob(
    type: JobType,
    payload: Record<string, unknown>,
    options: {
      priority?: number;
      scheduledAt?: Date;
      maxAttempts?: number;
    }
  ): Promise<number> {
    const db = getDb();
    const now = new Date();

    const jobId = await queries.insertJob(db, {
      type,
      status: 'pending',
      priority: options.priority ?? 0,
      payload: JSON.stringify(payload),
      maxAttempts: options.maxAttempts ?? 3,
      scheduledAt: options.scheduledAt ?? now,
    });

    logger.info(`Scheduled job ${jobId}`, { type, priority: options.priority });

    return jobId;
  }

  async cancelJob(jobId: number): Promise<boolean> {
    const db = getDb();
    const activeTimeout = this.activeJobs.get(jobId);

    if (activeTimeout) {
      clearTimeout(activeTimeout);
      this.activeJobs.delete(jobId);
    }

    await queries.updateJobStatus(db, jobId, 'pending');

    logger.info(`Cancelled job ${jobId}`);
    return true;
  }

  private async pollAndProcessJobs(): Promise<void> {
    // BE-13: Check if shutting down before processing
    if (!this.isRunning || shutdownState.isShuttingDown) {
      return;
    }

    const availableSlots = this.maxConcurrentJobs - this.activeJobs.size;
    if (availableSlots <= 0) {
      return;
    }

    const db = getDb();
    const pendingJobs = await queries.getPendingJobs(db, availableSlots);

    if (pendingJobs.length === 0) {
      return;
    }

    const jobPromises = pendingJobs.map((row) => {
      const job = mapRowToJob(row);
      if (this.activeJobs.has(job.id)) {
        return Promise.resolve();
      }
      // BE-13: Check shutdown status before starting new job
      if (shutdownState.isShuttingDown) {
        return Promise.resolve();
      }
      return this.processJob(job).catch((error) => {
        logger.error('Job processing threw uncaught error', {
          jobId: job.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    });

    await Promise.all(jobPromises);
  }

  private async processJob(job: JobRecord): Promise<void> {
    // BE-13: Check shutdown before starting
    if (shutdownState.isShuttingDown) {
      logger.info(`Skipping job ${job.id} due to shutdown`);
      return;
    }

    const db = getDb();

    await queries.updateJobStatus(db, job.id, 'processing');

    const jobWithTimestamp = { ...job, startedAt: new Date() };
    publishJobEvent('job:started', jobWithTimestamp);

    logger.info(`Processing job ${job.id}`, { type: job.type });

    try {
      const result = await this.executeJob(job);

      await queries.updateJobStatus(db, job.id, 'completed', JSON.stringify(result), null);
      await queries.incrementJobAttempts(db, job.id);

      // BE-13: Track completed jobs
      this.completedJobs++;

      const completedJob = { ...job, status: 'completed' as const, result, attempts: job.attempts + 1 };
      publishJobEvent('job:completed', completedJob);

      logger.info(`Job ${job.id} completed successfully`, { type: job.type });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Job ${job.id} failed`, { type: job.type, error: errorMessage });

      await queries.incrementJobAttempts(db, job.id);

      if (job.attempts + 1 >= job.maxAttempts) {
        // BE-9: Move to dead letter queue (failed_jobs table) after max attempts
        await queries.insertFailedJob(db, {
          originalJobId: job.id,
          type: job.type,
          payload: typeof job.payload === 'string' ? job.payload : JSON.stringify(job.payload),
          error: errorMessage,
          attempts: job.attempts + 1,
          maxAttempts: job.maxAttempts,
        });
        await queries.updateJobStatus(db, job.id, 'failed', null, errorMessage);

        // BE-13: Track failed jobs
        this.failedJobs++;

        const failedJob = { ...job, status: 'failed' as const, error: errorMessage, attempts: job.attempts + 1 };
        publishJobEvent('job:failed', failedJob);
      } else {
        await queries.updateJobStatus(db, job.id, 'pending');

        const retryDelay = Math.min(1000 * Math.pow(2, job.attempts), 30000);
        const timeout = setTimeout(() => {
          this.activeJobs.delete(job.id);
          // BE-13: Check shutdown on retry
          if (!shutdownState.isShuttingDown) {
            this.pollAndProcessJobs().catch((err) => {
              logger.error('Error in retry poll', {
                error: err instanceof Error ? err.message : 'Unknown error',
              });
            });
          }
        }, retryDelay);

        this.activeJobs.set(job.id, timeout);
      }
    }
  }

  private async executeJob(job: JobRecord): Promise<Record<string, unknown>> {
    const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;

    switch (job.type) {
      case 'ai-analysis':
        return JSON.parse(JSON.stringify(await processAiAnalysisJob(payload)));

      case 'ai-analysis-batch':
        return JSON.parse(JSON.stringify(await processAiAnalysisBatchJob(payload)));

      case 'date-extraction':
        return JSON.parse(JSON.stringify(await processDateExtractionJob(payload)));

      case 'weekly-report':
        return JSON.parse(JSON.stringify(await processWeeklyReportJob(payload)));

      case 'status-recalc':
        return JSON.parse(JSON.stringify(await processStatusRecalcJob(payload)));

      case 'momentum-recalc':
        return JSON.parse(JSON.stringify(await processMomentumRecalcJob(payload)));

      case 'scrape':
        return await processScrapeJob(payload);

      case 'similarity-recalc': {
        // Migration 022 — admin-triggered full recompute of
        // campaign_similarities. The work is synchronous and lightweight
        // (~1s for ~65 campaigns) so we just await it inside the job slot.
        const result = await processSimilarityCalcJob(payload);
        return {
          campaignsConsidered: result.campaignsConsidered,
          pairsEvaluated: result.pairsEvaluated,
          pairsPersisted: result.pairsPersisted,
          averageScore: Number(result.averageScore.toFixed(4)),
          durationMs: result.durationMs,
        };
      }

      case 'competitive-intent-reprocess': {
        // Migration 018. The job kicks off a background runner; the job row
        // itself completes as soon as the run is registered. Progress lives
        // in `competitive_intent_reprocess_runs` and is shown in admin UI.
        const triggeredBy = typeof payload.triggeredBy === 'string'
          ? payload.triggeredBy
          : 'scheduler';
        const campaignIds = Array.isArray(payload.campaignIds)
          ? (payload.campaignIds as unknown[]).filter((id): id is string => typeof id === 'string')
          : undefined;
        const result = await startCompetitiveIntentReprocess({
          triggeredBy,
          campaignIds,
        });
        return {
          runId: result.runId,
          totalCampaigns: result.totalCampaigns,
          alreadyRunning: result.alreadyRunning,
        };
      }

      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  }

  getActiveJobCount(): number {
    return this.activeJobs.size;
  }

  async getQueueDepth(): Promise<number> {
    const db = getDb();
    const result = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM jobs WHERE status = $1', ['pending']);
    return parseInt(result.rows[0]?.count || '0', 10) + this.activeJobs.size;
  }

  isSchedulerRunning(): boolean {
    return this.isRunning;
  }
}

async function processScrapeJob(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const siteCode = payload.siteCode as string;
  const config = payload.config as { baseUrl: string };

  const { scrapeManager } = await import('../core/scraper');

  const siteConfig: SiteConfig = {
    code: siteCode,
    name: siteCode,
    baseUrl: config.baseUrl,
    adapter: siteCode,
    enabled: true,
  };

  const result = await scrapeManager.processSite(siteCode, siteConfig);

  return {
    siteCode,
    status: result.status,
    cardsFound: result.cardsFound,
    newCampaigns: result.newCampaigns,
    updatedCampaigns: result.updatedCampaigns,
    unchanged: result.unchanged,
    errors: result.errors,
  };
}

function mapRowToJob(row: Record<string, unknown>): JobRecord {
  return {
    id: Number(row.id),
    type: row.type as JobType,
    status: row.status as 'pending' | 'processing' | 'completed' | 'failed',
    priority: row.priority as number,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    result: row.result ? JSON.parse(row.result as string) : null,
    error: row.error as string | null,
    attempts: row.attempts as number,
    maxAttempts: row.max_attempts as number,
    scheduledAt: new Date(row.scheduled_at as string),
    startedAt: row.started_at ? new Date(row.started_at as string) : null,
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    createdAt: new Date(row.created_at as string),
  };
}

export const jobScheduler = new JobScheduler();
