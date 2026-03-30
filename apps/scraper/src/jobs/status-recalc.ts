import { logger } from '../utils/logger';
import { getDb, recalculateCampaignStatus as dbRecalculateStatus } from '../db';
import * as queries from '../db/queries';
import { parseDateText } from '../normalizers/date';

export interface StatusRecalcPayload {
  campaignId?: string;
  siteCode?: string;
  batchSize?: number;
  force?: boolean;
}

export interface StatusRecalcResult {
  processedCount: number;
  statusChanges: {
    activated: number;
    expired: number;
    hidden: number;
    pending: number;
  };
  errors: Array<{
    campaignId: string;
    error: string;
  }>;
  duration: number;
}

export async function processStatusRecalcJob(
  payload: Record<string, unknown>
): Promise<StatusRecalcResult> {
  const { campaignId, siteCode, batchSize = 100, force = false } = payload as StatusRecalcPayload;

  logger.info(`Processing status recalculation`, { campaignId, siteCode, batchSize, force });

  const startTime = Date.now();
  const result: StatusRecalcResult = {
    processedCount: 0,
    statusChanges: {
      activated: 0,
      expired: 0,
      hidden: 0,
      pending: 0,
    },
    errors: [],
    duration: 0,
  };

  const db = getDb();

  let campaignIds: string[];

  if (campaignId) {
    campaignIds = [campaignId];
  } else if (siteCode) {
    campaignIds = await queries.getCampaignIdsBySite(db, siteCode, batchSize);
  } else {
    campaignIds = await queries.getAllCampaignIds(db, batchSize);
  }

  for (const id of campaignIds) {
    try {
      const previousStatus = await getCampaignStatus(id);
      const statusChange = await recalculateSingleCampaign(id, force);
      const newStatus = await getCampaignStatus(id);

      if (previousStatus !== newStatus) {
        result.statusChanges[statusChange]++;
      }

      result.processedCount++;
    } catch (error) {
      result.errors.push({
        campaignId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  result.duration = Date.now() - startTime;

  logger.info(`Status recalculation completed`, {
    processedCount: result.processedCount,
    statusChanges: result.statusChanges,
    errors: result.errors.length,
    durationMs: result.duration,
  });

  return result;
}

async function recalculateSingleCampaign(campaignId: string, force: boolean = false): Promise<'activated' | 'expired' | 'hidden' | 'pending'> {
  const db = getDb();
  const campaign = await queries.getCampaignForRecalc(db, campaignId);

  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  const currentVersion = await queries.getLatestVersionForCampaign(db, campaignId);

  let newStatus: 'active' | 'expired' | 'pending' = 'active';
  let newVisibility: 'visible' | 'hidden' | 'expired' | 'pending' = 'visible';

  const now = new Date();

  if (currentVersion) {
    const endDate = currentVersion.valid_to ? new Date(currentVersion.valid_to as string) : null;
    const startDate = currentVersion.valid_from ? new Date(currentVersion.valid_from as string) : null;

    if (endDate && endDate < now) {
      newStatus = 'expired';
      newVisibility = 'expired';
    } else if (startDate && startDate > now) {
      newStatus = 'pending';
      newVisibility = 'pending';
    }
  }

  if (force || newStatus !== (campaign.status as string) || newVisibility !== (campaign.visibility as string)) {
    await queries.updateCampaignStatus(db, campaignId, newStatus, newVisibility);
  }

  if (newStatus === 'active' && (campaign.status as string) === 'expired') {
    return 'activated';
  } else if (newStatus === 'expired') {
    return 'expired';
  } else if (newStatus === 'pending') {
    return 'pending';
  }

  return 'activated';
}

async function getCampaignStatus(campaignId: string): Promise<string | null> {
  const db = getDb();
  const row = await queries.getCampaignStatus(db, campaignId);
  return row?.status as string | null;
}

export async function recalculateAllCampaigns(batchSize: number = 100): Promise<StatusRecalcResult> {
  return await processStatusRecalcJob({
    batchSize,
    force: true,
  });
}

export async function recalculateSiteCampaigns(siteCode: string): Promise<StatusRecalcResult> {
  return await processStatusRecalcJob({
    siteCode,
    force: true,
  });
}

export async function recalculateExpiredCampaigns(): Promise<number> {
  const db = getDb();
  const expiredIds = await queries.getExpiredCampaignIds(db);

  logger.info(`Found ${expiredIds.length} expired campaigns to recalculate`);

  let activatedCount = 0;

  for (const campaignId of expiredIds) {
    try {
      const previousStatus = await getCampaignStatus(campaignId);
      const statusChange = await recalculateSingleCampaign(campaignId, true);
      const newStatus = await getCampaignStatus(campaignId);

      if (previousStatus !== newStatus && statusChange === 'activated') {
        activatedCount++;
      }
    } catch (error) {
      logger.error(`Failed to recalculate expired campaign ${campaignId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return activatedCount;
}

export async function recalculatePendingCampaigns(): Promise<number> {
  const db = getDb();
  const pendingIds = await queries.getPendingCampaignIds(db);

  logger.info(`Found ${pendingIds.length} pending campaigns to recalculate`);

  let activatedCount = 0;

  for (const campaignId of pendingIds) {
    try {
      const statusChange = await recalculateSingleCampaign(campaignId, true);

      if (statusChange === 'activated') {
        activatedCount++;
      }
    } catch (error) {
      logger.error(`Failed to recalculate pending campaign ${campaignId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return activatedCount;
}
