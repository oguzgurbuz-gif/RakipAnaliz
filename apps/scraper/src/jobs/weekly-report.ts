import { logger } from '../utils/logger';
import { getDb } from '../db';
import * as queries from '../db/queries';
import { callDeepSeek } from '../ai/client';

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

  try {
    const report = await generateWeeklyReport(weekStartDate, weekEndDate, includeSites);

    const reportId = await storeWeeklyReport(report);

    logger.info(`Weekly report generated successfully`, {
      reportId,
      totalCampaigns: report.summary.totalCampaigns,
      newCampaigns: report.summary.newCampaigns,
    });

    // AI executive summary is best-effort. DeepSeek failures must NOT
    // mark the weekly report as failed nor break the recurring chain.
    await enrichWeeklyReportWithAiSummary(reportId, report);

    return report;
  } finally {
    // Self-perpetuating chain: ensure next-week schedule exists even on failure,
    // so a single broken run cannot break the recurring cadence.
    try {
      await scheduleNextWeeklyReport();
    } catch (chainError) {
      logger.error('Failed to schedule next weekly report after job completion', {
        error: chainError instanceof Error ? chainError.message : String(chainError),
      });
    }
  }
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
    generatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
  };
}

async function storeWeeklyReport(report: WeeklyReport): Promise<string> {
  const db = getDb();
  const id = await queries.insertWeeklyReport(db, {
    periodStart: report.period.start,
    periodEnd: report.period.end,
    summary: JSON.stringify(report.summary),
    bySite: JSON.stringify(report.bySite),
    topBonuses: JSON.stringify(report.topBonuses),
    status: 'completed',
    generatedAt: report.generatedAt,
  });
  logger.debug('Weekly report stored successfully', { reportId: id });
  return id;
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

/**
 * Compute the next upcoming Monday at 09:00 UTC strictly in the future.
 */
function computeNextMondayAt0900Utc(now: Date = new Date()): Date {
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    9, 0, 0, 0
  ));
  // 1 = Monday in JS getUTCDay
  const dayOfWeek = next.getUTCDay();
  const daysUntilMonday = (1 + 7 - dayOfWeek) % 7;
  next.setUTCDate(next.getUTCDate() + daysUntilMonday);
  // If the computed Monday is now or in the past, jump one week ahead.
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 7);
  }
  return next;
}

/**
 * Schedule the next Monday 09:00 UTC weekly-report job. Idempotent: if a
 * pending/processing job already exists for that exact scheduledAt, it is a
 * no-op (prevents duplicate accumulation when called from multiple paths:
 * startup catch-up + self-perpetuating chain).
 */
export async function scheduleNextWeeklyReport(): Promise<void> {
  // Dynamic import preserves the existing pattern that breaks the
  // weekly-report <-> scheduler circular reference at module init time.
  const { jobScheduler } = await import('./scheduler');

  const nextMonday = computeNextMondayAt0900Utc();
  const weekEnd = new Date(nextMonday);
  weekEnd.setUTCDate(weekEnd.getUTCDate() - 7);

  const weekStartDate = weekEnd.toISOString().split('T')[0];
  const weekEndDate = nextMonday.toISOString().split('T')[0];

  const db = getDb();
  const alreadyScheduled = await queries.hasPendingWeeklyReportJobAt(db, nextMonday);
  if (alreadyScheduled) {
    logger.info('Next weekly report already scheduled, skipping duplicate', {
      scheduledAt: nextMonday.toISOString(),
      weekStartDate,
      weekEndDate,
    });
    return;
  }

  await jobScheduler.scheduleJob(
    'weekly-report',
    { weekStartDate, weekEndDate },
    { priority: 5, scheduledAt: nextMonday }
  );

  logger.info(`Next weekly report scheduled at ${nextMonday.toISOString()}`, {
    weekStartDate,
    weekEndDate,
  });
}

/**
 * Compute the most recent past Monday at 09:00 UTC (i.e. the start of the
 * current weekly window). Used as the reference "current" period_start.
 */
function computeMostRecentMondayDate(now: Date = new Date()): Date {
  const ref = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ));
  const dayOfWeek = ref.getUTCDay();
  // Days to subtract to reach Monday (1). If today is Sunday (0), go back 6.
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  ref.setUTCDate(ref.getUTCDate() - daysSinceMonday);
  return ref;
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Generate (and persist) a single weekly report synchronously, bypassing the
 * job queue. Used by catch-up to back-fill missed weeks idempotently.
 */
async function generateAndStoreWeeklyReportNow(
  weekStartDate: string,
  weekEndDate: string
): Promise<void> {
  const report = await generateWeeklyReport(weekStartDate, weekEndDate);
  const reportId = await storeWeeklyReport(report);
  logger.info('Catch-up weekly report stored', {
    reportId,
    weekStartDate,
    weekEndDate,
    totalCampaigns: report.summary.totalCampaigns,
  });
  await enrichWeeklyReportWithAiSummary(reportId, report);
}

/**
 * Startup catch-up:
 *  - If no weekly report exists, generate one for the current 7-day window.
 *  - If the most recent period_start is older than 8 days, generate one
 *    report per missed week, idempotently (insertWeeklyReport uses
 *    ON DUPLICATE KEY UPDATE on uq_weekly_reports_period).
 *  - Always (re)schedule the next Monday 09:00 UTC job.
 *
 * Wrapped with try/finally to guarantee the schedule chain is established
 * even when back-fill fails midway.
 */
export async function runWeeklyReportCatchUp(): Promise<void> {
  try {
    const db = getDb();
    const maxPeriodStart = await queries.getMaxWeeklyReportPeriodStart(db);
    const now = new Date();

    if (!maxPeriodStart) {
      logger.info('No weekly reports found, generating initial report');
      const start = addUtcDays(now, -7);
      const weekStartDate = toIsoDate(start);
      const weekEndDate = toIsoDate(now);
      try {
        await generateAndStoreWeeklyReportNow(weekStartDate, weekEndDate);
      } catch (error) {
        logger.error('Initial weekly report generation failed', {
          error: error instanceof Error ? error.message : String(error),
          weekStartDate,
          weekEndDate,
        });
      }
      return;
    }

    const lastStart = new Date(`${maxPeriodStart}T00:00:00Z`);
    const ageMs = now.getTime() - lastStart.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays < 8) {
      logger.info('Weekly reports up to date, no catch-up needed', {
        latestPeriodStart: maxPeriodStart,
        ageDays: Number(ageDays.toFixed(2)),
      });
      return;
    }

    // Build list of missed week windows: each window is 7 days, starting from
    // (lastStart + 7 days), advancing weekly until current most-recent Monday.
    const currentMonday = computeMostRecentMondayDate(now);
    const missed: Array<{ start: string; end: string }> = [];
    let cursor = addUtcDays(lastStart, 7);
    // Generate weekly windows up to and including the current most-recent
    // Monday window (start = currentMonday, end = currentMonday + 7).
    while (cursor.getTime() <= currentMonday.getTime()) {
      const windowEnd = addUtcDays(cursor, 7);
      missed.push({ start: toIsoDate(cursor), end: toIsoDate(windowEnd) });
      cursor = addUtcDays(cursor, 7);
    }

    if (missed.length === 0) {
      logger.info('No missed weekly reports detected after age check', {
        latestPeriodStart: maxPeriodStart,
      });
      return;
    }

    logger.info(`Catching up ${missed.length} missed weekly reports`, {
      latestPeriodStart: maxPeriodStart,
      from: missed[0]?.start,
      to: missed[missed.length - 1]?.end,
    });

    for (const window of missed) {
      try {
        await generateAndStoreWeeklyReportNow(window.start, window.end);
      } catch (error) {
        logger.error('Catch-up weekly report failed for window', {
          weekStartDate: window.start,
          weekEndDate: window.end,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with next window — do not break the back-fill.
      }
    }
  } catch (error) {
    logger.error('Weekly report catch-up encountered an error', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    try {
      await scheduleNextWeeklyReport();
    } catch (error) {
      logger.error('Failed to schedule next weekly report after catch-up', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// AI executive summary (best-effort, non-blocking)
// ---------------------------------------------------------------------------

interface AiSummaryPayload {
  executive_summary: string;
  risks: string[];
  recommendations: string[];
}

function buildAiSummaryPrompt(report: WeeklyReport): string {
  const topSites = report.bySite
    .slice()
    .sort((a, b) => b.totalCampaigns - a.totalCampaigns)
    .slice(0, 5)
    .map((s) => `${s.siteCode} (${s.totalCampaigns})`)
    .join(', ') || 'veri yok';

  const topBonuses = report.topBonuses
    .slice(0, 5)
    .map((b) => {
      const value = b.bonusAmount != null
        ? `${b.bonusAmount} TL`
        : b.bonusPercentage != null
          ? `%${b.bonusPercentage}`
          : 'değer belirtilmemiş';
      return `${b.siteCode}: ${b.title} (${value})`;
    })
    .join('; ') || 'veri yok';

  return [
    `Bu hafta toplam ${report.summary.totalCampaigns} kampanya gözlemlendi.`,
    `Yeni: ${report.summary.newCampaigns}, biten: ${report.summary.expiredCampaigns}, güncellenen: ${report.summary.updatedCampaigns}, aktif site: ${report.summary.activeSites}.`,
    `Top siteler: ${topSites}.`,
    `Top bonuslar: ${topBonuses}.`,
    '',
    'Yukarıdaki veriye dayanarak SADECE geçerli JSON formatında yanıt ver.',
    'Şema:',
    '{',
    '  "executive_summary": string (Türkçe, tam 2 cümle),',
    '  "risks": string[] (Türkçe, tam 3 madde),',
    '  "recommendations": string[] (Türkçe, tam 3 madde)',
    '}',
    'Markdown veya açıklama ekleme. Sadece JSON döndür.',
  ].join('\n');
}

function parseAiSummary(content: string | undefined): AiSummaryPayload | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const summary = typeof parsed.executive_summary === 'string'
      ? parsed.executive_summary.trim()
      : '';
    const risks = Array.isArray(parsed.risks)
      ? parsed.risks.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      : [];
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.filter(
          (r): r is string => typeof r === 'string' && r.trim().length > 0
        )
      : [];

    if (!summary && risks.length === 0 && recommendations.length === 0) {
      return null;
    }

    return { executive_summary: summary, risks, recommendations };
  } catch {
    return null;
  }
}

async function enrichWeeklyReportWithAiSummary(
  reportId: string,
  report: WeeklyReport
): Promise<void> {
  try {
    if (!process.env.DEEPSEEK_API_KEY) {
      logger.info('Skipping AI summary: DEEPSEEK_API_KEY not configured', { reportId });
      return;
    }

    logger.info('Generating AI summary for weekly report', { reportId });

    const userPrompt = buildAiSummaryPrompt(report);

    const response = await callDeepSeek(
      [
        {
          role: 'system',
          content:
            'Sen haftalık kampanya raporları için kısa, eyleme dönük yönetici özetleri üreten bir analizcisin. Sadece geçerli JSON döndür.',
        },
        { role: 'user', content: userPrompt },
      ],
      {
        temperature: 0.2,
        response_format: { type: 'json_object' },
        max_tokens: 800,
      }
    );

    const content = response.choices?.[0]?.message?.content;
    const parsed = parseAiSummary(content);

    if (!parsed) {
      logger.warn('AI summary parse failed, leaving columns NULL', {
        reportId,
        snippet: content?.substring(0, 200),
      });
      return;
    }

    const db = getDb();
    await db.query(
      `UPDATE weekly_reports
       SET executive_summary = $1,
           risks = CAST($2 AS JSON),
           recommendations = CAST($3 AS JSON),
           updated_at = CURRENT_TIMESTAMP(6)
       WHERE id = $4`,
      [
        parsed.executive_summary,
        JSON.stringify(parsed.risks),
        JSON.stringify(parsed.recommendations),
        reportId,
      ]
    );

    logger.info('AI summary persisted', {
      reportId,
      summaryChars: parsed.executive_summary.length,
      risks: parsed.risks.length,
      recommendations: parsed.recommendations.length,
    });
  } catch (error) {
    logger.warn('AI summary generation failed (report still saved)', {
      reportId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
