import 'dotenv/config';
import { prisma } from './src/db';
import { logger } from './src/utils/logger';

async function main() {
  logger.info('Testing Prisma with Supabase connection...');

  try {
    // Test 1: Sites
    const sites = await prisma.site.findMany({ take: 5 });
    logger.info('✅ Sites query OK', { count: sites.length, first: sites[0]?.code });

    // Test 2: Create job
    const job = await prisma.job.create({
      data: {
        type: 'test-job',
        status: 'pending',
        priority: 50,
        payload: { test: true },
        scheduledAt: new Date(),
        maxAttempts: 3,
        attempts: 0,
      },
    });
    logger.info('✅ Job insert OK', { id: job.id });

    // Test 3: ScrapeRun
    const run = await prisma.scrapeRun.create({
      data: {
        status: 'running',
        startedAt: new Date(),
        totalSites: 1,
      },
    });
    logger.info('✅ ScrapeRun insert OK', { id: run.id });

    // Test 4: Campaign count
    const counts = await prisma.campaign.groupBy({ by: ['status'], _count: true });
    logger.info('✅ Campaign groupBy OK', { counts });

    // Test 5: WeeklyReport
    const report = await prisma.weeklyReport.create({
      data: {
        reportWeekStart: new Date(),
        reportWeekEnd: new Date(),
        title: 'Test Report',
        executiveSummary: 'Test summary',
        status: 'completed',
        reportPayload: { summary: { total: 1 } },
      },
    });
    logger.info('✅ WeeklyReport insert OK', { id: report.id });

    logger.info('\n✅ All Prisma tests passed!');
  } catch (err) {
    logger.error('❌ Prisma test failed', { error: err instanceof Error ? err.message : String(err) });
  } finally {
    await prisma.$disconnect();
  }
}

main();
