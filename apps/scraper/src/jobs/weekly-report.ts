import { logger } from '../utils/logger';
import { getDb } from '../db';
import * as queries from '../db/queries';

export interface WeeklyReportPayload {
  weekStartDate: string;
  weekEndDate: string;
  includeSites?: string[];
}

export interface WeeklyReport {
  period: {
    start: string;
    end: string;
  };
  summary: {
    totalCampaigns: number;
    newCampaigns: number;
    expiredCampaigns: number;
    updatedCampaigns: number;
    activeSites: number;
  };
  bySite: Array<{
    siteCode: string;
    totalCampaigns: number;
    newCampaigns: number;
    updatedCampaigns: number;
    expiredCampaigns: number;
  }>;
  topBonuses: Array<{
    siteCode: string;
    title: string;
    bonusAmount: number | null;
    bonusPercentage: number | null;
    valueScore: number;
  }>;
  status: {
    visible: number;
    hidden: number;
    expired: number;
    pending: number;
  };
  generatedAt: string;
}

export async function processWeeklyReportJob(
  payload: Record<string, unknown>
): Promise<WeeklyReport> {
  const { weekStartDate, weekEndDate, includeSites } = payload as unknown as WeeklyReportPayload;

  logger.info(`Generating weekly report for ${weekStartDate} to ${weekEndDate}`);

  const report = await generateWeeklyReport(weekStartDate, weekEndDate, includeSites);

  await storeWeeklyReport(report);

  logger.info(`Weekly report generated successfully`, {
    totalCampaigns: report.summary.totalCampaigns,
    newCampaigns: report.summary.newCampaigns,
  });

  return report;
}

async function generateWeeklyReport(
  startDate: string,
  endDate: string,
  includeSites?: string[]
): Promise<WeeklyReport> {
  const db = getDb();

  const totalCampaigns = await queries.getTotalCampaignsInPeriod(db, startDate, endDate);
  const newCampaigns = await queries.getNewCampaignsInPeriod(db, startDate, endDate);
  const expiredCampaigns = await queries.getExpiredCampaignsInPeriod(db, startDate, endDate);
  const updatedCampaigns = await queries.getUpdatedCampaignsInPeriod(db, startDate, endDate);
  const activeSites = await queries.getActiveSitesInPeriod(db, startDate, endDate);

  const bySiteData = await queries.getCampaignsBySiteInPeriod(db, startDate, endDate, includeSites);
  const bySite = bySiteData.map((row: Record<string, unknown>) => ({
    siteCode: row.site_code as string,
    totalCampaigns: row.total as number,
    newCampaigns: row.new_count as number,
    updatedCampaigns: row.updated_count as number,
    expiredCampaigns: row.expired_count as number,
  }));

  const topBonusesData = await queries.getTopBonusesInPeriod(db, startDate, endDate, 10);
  const topBonuses = topBonusesData.map((row: Record<string, unknown>) => ({
    siteCode: row.site_code as string,
    title: row.title as string,
    bonusAmount: row.bonus_amount as number | null,
    bonusPercentage: row.bonus_percentage as number | null,
    valueScore: (row.value_score as number) ?? 0,
  }));

  const statusCounts = await queries.getCampaignStatusCounts(db);

  return {
    period: {
      start: startDate,
      end: endDate,
    },
    summary: {
      totalCampaigns: (totalCampaigns?.count ?? 0) as number,
      newCampaigns: (newCampaigns?.count ?? 0) as number,
      expiredCampaigns: (expiredCampaigns?.count ?? 0) as number,
      updatedCampaigns: (updatedCampaigns?.count ?? 0) as number,
      activeSites: (activeSites?.count ?? 0) as number,
    },
    bySite,
    topBonuses,
    status: {
      visible: (statusCounts?.visible ?? 0) as number,
      hidden: (statusCounts?.hidden ?? 0) as number,
      expired: (statusCounts?.expired ?? 0) as number,
      pending: (statusCounts?.pending ?? 0) as number,
    },
    generatedAt: new Date().toISOString(),
  };
}

async function storeWeeklyReport(report: WeeklyReport): Promise<void> {
  const db = getDb();

  try {
    queries.insertWeeklyReport(db, {
      periodStart: report.period.start,
      periodEnd: report.period.end,
      summary: report.summary,
      bySite: report.bySite,
      topBonuses: report.topBonuses,
      status: 'completed',
    });

    logger.debug('Weekly report stored successfully');
  } catch (error) {
    logger.error('Failed to store weekly report', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function getLatestWeeklyReport(): Promise<WeeklyReport | null> {
  const db = getDb();
  const row = await queries.getLatestWeeklyReport(db);

  if (!row) {
    return null;
  }

  const payload = (row.report_payload ?? {}) as Record<string, unknown>;
  return {
    period: {
      start: row.report_week_start as string,
      end: row.report_week_end as string,
    },
    summary: {
      totalCampaigns: (payload.totalCampaigns as number) ?? 0,
      newCampaigns: (payload.newCampaigns as number) ?? 0,
      expiredCampaigns: (payload.expiredCampaigns as number) ?? 0,
      updatedCampaigns: (payload.updatedCampaigns as number) ?? 0,
      activeSites: (payload.activeSites as number) ?? 0,
    },
    bySite: (payload.by_site as WeeklyReport['bySite']) ?? [],
    topBonuses: (payload.top_bonuses as WeeklyReport['topBonuses']) ?? [],
    status: {
      visible: 0,
      hidden: 0,
      expired: 0,
      pending: 0,
    },
    generatedAt: (row.created_at as string) ?? new Date().toISOString(),
  };
}

export async function getWeeklyReportHistory(limit: number = 12): Promise<WeeklyReport[]> {
  const db = getDb();
  const rows = await queries.getWeeklyReportHistory(db, limit);

  return rows.map((row: Record<string, unknown>) => {
    const payload = (row.report_payload ?? {}) as Record<string, unknown>;
    return {
      period: {
        start: row.report_week_start as string,
        end: row.report_week_end as string,
      },
      summary: {
        totalCampaigns: (payload.totalCampaigns as number) ?? 0,
        newCampaigns: (payload.newCampaigns as number) ?? 0,
        expiredCampaigns: (payload.expiredCampaigns as number) ?? 0,
        updatedCampaigns: (payload.updatedCampaigns as number) ?? 0,
        activeSites: (payload.activeSites as number) ?? 0,
      },
      bySite: (payload.by_site as WeeklyReport['bySite']) ?? [],
      topBonuses: (payload.top_bonuses as WeeklyReport['topBonuses']) ?? [],
      status: {
        visible: 0,
        hidden: 0,
        expired: 0,
        pending: 0,
      },
      generatedAt: (row.created_at as string) ?? new Date().toISOString(),
    };
  });
}

export async function scheduleNextWeeklyReport(): Promise<void> {
  const { jobScheduler } = await import('./scheduler');

  const now = new Date();
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7));
  nextMonday.setHours(9, 0, 0, 0);

  if (nextMonday <= now) {
    nextMonday.setDate(nextMonday.getDate() + 7);
  }

  const weekEnd = new Date(nextMonday);
  weekEnd.setDate(weekEnd.getDate() - 7);

  await jobScheduler.scheduleJob(
    'weekly-report',
    {
      weekStartDate: weekEnd.toISOString().split('T')[0],
      weekEndDate: nextMonday.toISOString().split('T')[0],
    },
    {
      priority: 5,
      scheduledAt: nextMonday,
    }
  );

  logger.info(`Scheduled weekly report for ${nextMonday.toISOString()}`);
}
