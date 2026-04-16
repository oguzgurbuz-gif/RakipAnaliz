import { logger } from '../utils/logger';
import { getDb } from '../db';
import { JobRecord, JobType, SiteConfig } from '../types';
import * as queries from '../db/queries';
import { publishJobEvent } from '../publish/sse';
import { processAiAnalysisJob } from './ai-analysis';
import { processDateExtractionJob } from './date-extraction';
import { processWeeklyReportJob } from './weekly-report';
import { processStatusRecalcJob } from './status-recalc';

export class JobScheduler {
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private pollIntervalMs: number = 5000;
  private maxConcurrentJobs: number = 3;
  private activeJobs: Map<number, NodeJS.Timeout> = new Map();

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('JobScheduler is already running');
      return;
    }

    this.isRunning = true;
    logger.info('JobScheduler started');

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
    if (!this.isRunning) {
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
    const db = getDb();

    await queries.updateJobStatus(db, job.id, 'processing');

    const jobWithTimestamp = { ...job, startedAt: new Date() };
    publishJobEvent('job:started', jobWithTimestamp);

    logger.info(`Processing job ${job.id}`, { type: job.type });

    try {
      const result = await this.executeJob(job);

      await queries.updateJobStatus(db, job.id, 'completed', JSON.stringify(result), null);
      await queries.incrementJobAttempts(db, job.id);

      const completedJob = { ...job, status: 'completed' as const, result, attempts: job.attempts + 1 };
      publishJobEvent('job:completed', completedJob);

      logger.info(`Job ${job.id} completed successfully`, { type: job.type });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Job ${job.id} failed`, { type: job.type, error: errorMessage });

      await queries.incrementJobAttempts(db, job.id);

      if (job.attempts + 1 >= job.maxAttempts) {
        await queries.updateJobStatus(db, job.id, 'failed', null, errorMessage);

        const failedJob = { ...job, status: 'failed' as const, error: errorMessage, attempts: job.attempts + 1 };
        publishJobEvent('job:failed', failedJob);
      } else {
        await queries.updateJobStatus(db, job.id, 'pending');

        const retryDelay = Math.min(1000 * Math.pow(2, job.attempts), 30000);
        const timeout = setTimeout(() => {
          this.activeJobs.delete(job.id);
          this.pollAndProcessJobs().catch((err) => {
            logger.error('Error in retry poll', {
              error: err instanceof Error ? err.message : 'Unknown error',
            });
          });
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

      case 'date-extraction':
        return JSON.parse(JSON.stringify(await processDateExtractionJob(payload)));

      case 'weekly-report':
        return JSON.parse(JSON.stringify(await processWeeklyReportJob(payload)));

      case 'status-recalc':
        return JSON.parse(JSON.stringify(await processStatusRecalcJob(payload)));

      case 'scrape':
        return await processScrapeJob(payload);

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
