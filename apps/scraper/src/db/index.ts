import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { NormalizedCampaignInput, Campaign, CampaignVersion, CampaignDiff, SiteRecord } from '../types';
import * as queries from './queries';

let pool: Pool | null = null;

export function getDb(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    pool.on('error', (err) => {
      logger.error('Unexpected database pool error', { error: err.message });
    });
  }
  return pool;
}

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const db = getDb();
  const result = await db.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = unknown>(text: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection closed');
  }
}

export async function getTransaction() {
  const db = getDb();
  const client = await db.connect();
  await client.query('BEGIN');
  return {
    client: client as unknown as Pool,
    async commit() {
      await client.query('COMMIT');
      client.release();
    },
    async rollback() {
      await client.query('ROLLBACK');
      client.release();
    }
  };
}

export async function findExistingCampaign(fingerprint: string): Promise<Campaign | null> {
  const db = getDb();
  const row = await queries.findExistingCampaign(db, fingerprint);
  return row ? mapRowToCampaign(row) : null;
}

export async function insertCampaign(normalized: NormalizedCampaignInput): Promise<string> {
  const now = new Date();

  const siteRow = await queryOne<{ id: string }>(
    `SELECT id FROM sites WHERE code = $1`,
    [normalized.siteCode]
  );
  if (!siteRow) {
    throw new Error(`Site not found: ${normalized.siteCode}`);
  }

  const tx = await getTransaction();
  try {
    const campaignId = await queries.insertCampaign(tx.client, {
      siteId: siteRow.id,
      externalId: null,
      sourceUrl: normalized.url,
      canonicalUrl: null,
      title: normalized.title,
      body: normalized.description,
      normalizedText: '',
      fingerprint: normalized.fingerprint,
      contentVersion: 1,
      primaryImageUrl: normalized.imageUrl,
      validFrom: normalized.startDate,
      validTo: normalized.endDate,
      validFromSource: null,
      validToSource: null,
      validFromConfidence: null,
      validToConfidence: null,
      rawDateText: null,
      status: 'active',
      statusReason: null,
      tags: [],
      metadata: { visibility: normalized.visibility, rawFingerprint: normalized.rawFingerprint },
    });

    await queries.insertCampaignVersion(tx.client, {
      campaignId,
      title: normalized.title,
      body: normalized.description,
      normalizedText: '',
      fingerprint: normalized.fingerprint,
      primaryImageUrl: normalized.imageUrl,
      validFrom: normalized.startDate,
      validTo: normalized.endDate,
      validFromSource: null,
      validToSource: null,
      rawDateText: null,
      versionNo: 1,
    });

    await tx.commit();

    // Schedule AI analysis for new campaign
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
          priority: 'medium',
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
        { priority: 50 }
      );
      logger.info(`Scheduled AI analysis job for new campaign ${campaignId}`);
    } catch (jobError) {
      // Non-fatal: log but don't fail campaign insertion
      logger.error(`Failed to schedule AI analysis job for campaign ${campaignId}`, {
        error: jobError instanceof Error ? jobError.message : 'Unknown error'
      });
    }

    return campaignId;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function insertCampaignVersion(
  db: Pool,
  campaignId: string,
  normalized: NormalizedCampaignInput,
  diff: CampaignDiff | null,
  changeType: 'created' | 'updated' | 'reactivated' | 'expired' | 'removed'
): Promise<string> {
  const versionCountResult = await queries.getVersionCount(db, campaignId);
  const versionCount = (versionCountResult?.count ?? 0) + 1;

  const versionId = await queries.insertCampaignVersion(db, {
    campaignId,
    title: normalized.title,
    body: normalized.description,
    normalizedText: '',
    fingerprint: normalized.fingerprint,
    primaryImageUrl: normalized.imageUrl,
    validFrom: normalized.startDate,
    validTo: normalized.endDate,
    validFromSource: null,
    validToSource: null,
    rawDateText: null,
    versionNo: versionCount,
  });

  await queries.incrementVersionCount(db, campaignId);

  return versionId;
}

export async function updateCampaign(campaignId: string, normalized: NormalizedCampaignInput): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  await queries.updateCampaign(db, campaignId, {
    title: normalized.title,
    body: normalized.description,
    status: 'active',
    lastSeenAt: now,
  });
}

export async function markCampaignSeen(campaignId: string): Promise<void> {
  const db = getDb();
  await queries.updateCampaignLastSeen(db, campaignId);
}

export async function getLatestCampaignVersion(campaignId: string): Promise<CampaignVersion | null> {
  const db = getDb();
  const row = await queries.getLatestVersion(db, campaignId);
  return row ? mapRowToVersion(row) : null;
}

export async function getActiveCampaignsBySite(siteCode: string): Promise<Map<string, Campaign>> {
  const db = getDb();
  const rows = await queries.getActiveCampaignsBySite(db, siteCode);
  const map = new Map<string, Campaign>();

  for (const row of rows) {
    const campaign = mapRowToCampaign(row);
    map.set(campaign.fingerprint, campaign);
  }

  return map;
}

export async function updateCampaignVisibilityByFingerprint(
  fingerprint: string,
  visibility: 'visible' | 'hidden' | 'expired' | 'pending'
): Promise<void> {
  const db = getDb();
  await queries.updateCampaignVisibility(db, fingerprint, visibility);
}

export async function updateSiteScrapeStatus(
  siteCode: string,
  status: 'success' | 'failed' | 'never',
  error: string | null
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  const campaignCountResult = await queries.getCampaignCountBySite(db, siteCode);
  const campaignCount = campaignCountResult?.count ?? 0;

  await queries.updateSiteScrapeStatus(db, siteCode, {
    lastScrapedAt: now,
    lastScrapeStatus: status,
    lastScrapeError: error,
    campaignCount,
  });
}

export async function applyAiExtractedDates(
  campaignId: string,
  startDate: Date | null,
  endDate: Date | null,
  confidence: number
): Promise<void> {
  const db = getDb();
  await queries.applyAiExtractedDates(db, campaignId, {
    validFrom: startDate,
    validTo: endDate,
    validFromSource: 'ai-extracted',
    validToSource: 'ai-extracted',
    validFromConfidence: Math.round(confidence * 100),
    validToConfidence: Math.round(confidence * 100),
    rawDateText: null,
  });
}

export async function recalculateCampaignStatus(campaignId: string): Promise<void> {
  const db = getDb();
  const latestVersion = await getLatestCampaignVersion(campaignId);

  if (!latestVersion) {
    return;
  }

  let newStatus: 'active' | 'updated' | 'expired' | 'pending' | 'hidden' = 'active';
  let newVisibility: 'visible' | 'hidden' | 'expired' | 'pending' = 'visible';

  if (latestVersion.endDate) {
    const endDate = new Date(latestVersion.endDate);
    if (endDate < new Date()) {
      newStatus = 'expired';
      newVisibility = 'expired';
    }
  }

  if (latestVersion.startDate) {
    const startDate = new Date(latestVersion.startDate);
    if (startDate > new Date()) {
      newStatus = 'pending';
      newVisibility = 'pending';
    }
  }

  await queries.updateCampaignStatus(db, campaignId, newStatus, newVisibility);
}

function mapRowToCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: row.id as string,
    siteCode: (row.site_code ?? row.code) as string,
    fingerprint: row.fingerprint as string,
    currentVersionId: row.current_version_id as string,
    title: row.title as string,
    status: (row.status ?? 'active') as 'active' | 'updated' | 'expired' | 'pending' | 'hidden',
    visibility: (row.visibility ?? 'visible') as 'visible' | 'hidden' | 'expired' | 'pending',
    firstSeenAt: new Date(row.first_seen_at as string),
    lastSeenAt: new Date(row.last_seen_at as string),
    versionCount: (row.version_count ?? 1) as number,
    aiExtractedDates: Boolean(row.valid_from_confidence),
    aiConfidence: row.valid_to_confidence as number | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapRowToVersion(row: Record<string, unknown>): CampaignVersion {
  return {
    id: row.id as string,
    campaignId: row.campaign_id as string,
    versionNumber: (row.content_version ?? 1) as number,
    title: row.title as string,
    description: row.body as string | null,
    bonusType: 'percentage' as const,
    bonusAmount: null,
    bonusPercentage: null,
    minDeposit: null,
    maxBonus: null,
    code: null,
    url: (row.source_url ?? row.url) as string,
    imageUrl: row.primary_image_url as string | null,
    startDate: row.valid_from ? new Date(row.valid_from as string) : null,
    endDate: row.valid_to ? new Date(row.valid_to as string) : null,
    termsUrl: null,
    category: 'general',
    isFeatured: false,
    isExclusive: false,
    status: (row.status ?? 'active') as 'active' | 'updated' | 'expired' | 'removed',
    changeType: (row.change_type ?? 'created') as 'created' | 'updated' | 'reactivated' | 'expired' | 'removed',
    diff: null,
    createdAt: new Date(row.created_at as string),
  };
}
