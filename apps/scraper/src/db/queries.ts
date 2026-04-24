import type { DbExecutor } from './compat-query';
import { logger } from '../utils/logger';
import { normalizeConfidence01, toDecimal4 } from '../ai/confidence';

/**
 * Coerce any inbound confidence-shaped value into a DB-safe DECIMAL(5,4)
 * (0..0.9999 or null). Inputs may arrive on a 0..1 scale, a 0..100 percent
 * scale, or out of range entirely; persisting raw values triggers MySQL
 * "Out of range" errors and drops the whole INSERT.
 */
function toDbConfidence(value: unknown): number | null {
  const normalized = normalizeConfidence01(value);
  return normalized == null ? null : toDecimal4(normalized);
}

// BE-10: Query timeout configuration (default 30 seconds)
const DEFAULT_QUERY_TIMEOUT_MS = 30000;

/**
 * BE-10: Execute a query with a timeout
 * Cancels the query if it takes longer than the specified timeout
 */
export async function queryWithTimeout<T extends Record<string, unknown>>(
  db: DbExecutor,
  text: string,
  params: unknown[],
  options: { timeoutMs?: number; operationName?: string } = {}
): Promise<{ rows: T[]; rowCount: number }> {
  const { timeoutMs = DEFAULT_QUERY_TIMEOUT_MS, operationName = 'database_query' } = options;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Query timeout after ${timeoutMs}ms: ${operationName}`));
    }, timeoutMs);
  });

  const queryPromise = db.query<T>(text, params);

  try {
    return await Promise.race([queryPromise, timeoutPromise]);
  } catch (error) {
    logger.warn(`Query failed: ${operationName}`, {
      operation: operationName,
      timeoutMs,
      error: error instanceof Error ? error.message : 'Unknown',
      query: text.substring(0, 200),
    });
    throw error;
  }
}

/**
 * BE-4: Structured logging context for database operations
 * Adds consistent logging context to all DB operations
 */
export function logDbOperation(
  operation: string,
  details: Record<string, unknown>
): void {
  logger.info(`DB operation: ${operation}`, {
    dbOperation: operation,
    ...details,
    timestamp: new Date().toISOString(),
  });
}

function requireInsertedId(rows: Record<string, unknown>[]): string {
  const id = rows[0]?.id;
  if (id == null) throw new Error('Expected inserted row id');
  return String(id);
}

function insertedJobId(rows: Record<string, unknown>[]): number {
  return Number(requireInsertedId(rows));
}

function countAggregate(rows: Record<string, unknown>[]): { count: number } | null {
  const row = rows[0];
  if (!row) return null;
  return { count: Number(row.count) };
}

export async function findCampaignByExternalId(
  db: DbExecutor,
  siteId: string,
  externalId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query(
    `SELECT * FROM campaigns WHERE site_id = $1 AND external_id = $2 LIMIT 1`,
    [siteId, externalId]
  );
  return result.rows[0] ?? null;
}

export async function findCampaignByFingerprint(
  db: DbExecutor,
  siteId: string,
  fingerprint: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query(
    `SELECT * FROM campaigns WHERE site_id = $1 AND fingerprint = $2 LIMIT 1`,
    [siteId, fingerprint]
  );
  return result.rows[0] ?? null;
}

export async function insertCampaign(
  db: DbExecutor,
  data: {
    siteId: string;
    externalId: string | null;
    sourceUrl: string;
    canonicalUrl: string | null;
    title: string;
    body: string | null;
    normalizedText: string | null;
    fingerprint: string;
    contentVersion: number;
    primaryImageUrl: string | null;
    validFrom: Date | null;
    validTo: Date | null;
    validFromSource: string | null;
    validToSource: string | null;
    validFromConfidence: number | null;
    validToConfidence: number | null;
    rawDateText: string | null;
    status: string;
    statusReason: string | null;
    tags: string[] | null;
    metadata: Record<string, unknown> | null;
  }
): Promise<string> {
  await db.query(
    `INSERT INTO campaigns (
      site_id, external_id, source_url, canonical_url, title, body, normalized_text,
      fingerprint, version_no, primary_image_url, valid_from, valid_to,
      valid_from_source, valid_to_source, valid_from_confidence, valid_to_confidence,
      raw_date_text, status, status_reason, tags, metadata,
      last_seen_at, last_visible_at, is_visible_on_last_scrape,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
      NOW(), NOW(), true, NOW(), NOW()
    )`,
    [
      data.siteId,
      data.externalId,
      data.sourceUrl,
      data.canonicalUrl,
      data.title,
      data.body,
      data.normalizedText,
      data.fingerprint,
      data.contentVersion,
      data.primaryImageUrl,
      data.validFrom,
      data.validTo,
      data.validFromSource,
      data.validToSource,
      data.validFromConfidence,
      data.validToConfidence,
      data.rawDateText,
      data.status,
      data.statusReason,
      JSON.stringify(data.tags ?? []),
      data.metadata ? JSON.stringify(data.metadata) : null,
    ]
  );

  const row = await db.query<{ id: string }>(
    `SELECT id FROM campaigns WHERE site_id = $1 AND fingerprint = $2 LIMIT 1`,
    [data.siteId, data.fingerprint]
  );
  return requireInsertedId(row.rows);
}

export async function updateCampaignLastSeen(
  db: DbExecutor,
  campaignId: string
): Promise<void> {
  await db.query(
    `UPDATE campaigns SET
      last_seen_at = NOW(),
      last_visible_at = NOW(),
      is_visible_on_last_scrape = true,
      updated_at = NOW()
    WHERE id = $1`,
    [campaignId]
  );
}

export async function insertCampaignVersion(
  db: DbExecutor,
  data: {
    campaignId: string;
    title: string;
    body: string | null;
    normalizedText: string;
    fingerprint: string;
    primaryImageUrl?: string | null;
    validFrom?: Date | null;
    validTo?: Date | null;
    validFromSource?: string | null;
    validToSource?: string | null;
    rawDateText?: string | null;
    versionNo: number;
  }
): Promise<string> {
  await db.query(
    `INSERT INTO campaign_versions (
      campaign_id, title, body, normalized_text,
      fingerprint, primary_image_url, valid_from, valid_to,
      valid_from_source, valid_to_source, raw_date_text,
      version_no, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
    )`,
    [
      data.campaignId,
      data.title,
      data.body,
      data.normalizedText,
      data.fingerprint,
      data.primaryImageUrl ?? null,
      data.validFrom ?? null,
      data.validTo ?? null,
      data.validFromSource ?? null,
      data.validToSource ?? null,
      data.rawDateText ?? null,
      data.versionNo,
    ]
  );

  const row = await db.query<{ id: string }>(
    `SELECT id FROM campaign_versions WHERE campaign_id = $1 AND version_no = $2 ORDER BY created_at DESC LIMIT 1`,
    [data.campaignId, data.versionNo]
  );
  return requireInsertedId(row.rows);
}

export async function recalculateCampaignStatus(
  db: DbExecutor,
  campaignId: string
): Promise<void> {
  await db.query(
    `UPDATE campaigns SET
      status = CASE
        WHEN is_visible_on_last_scrape = 0 THEN 'hidden'
        WHEN valid_to IS NOT NULL AND valid_to < NOW() THEN 'expired'
        ELSE 'active'
      END,
      updated_at = NOW()
    WHERE id = $1`,
    [campaignId]
  );
}

/**
 * Bulk-recalculates the `status` column for every campaign in a single SQL
 * statement using the same CASE rules as {@link recalculateCampaignStatus}:
 *   - is_visible_on_last_scrape = 0  -> 'hidden'
 *   - valid_to IS NOT NULL AND valid_to < NOW()  -> 'expired'
 *   - otherwise                       -> 'active'
 *
 * Returns per-status row counts AFTER the update so the caller can log a
 * concise summary. The function is idempotent and safe to run on a recurring
 * schedule.
 */
export async function recalculateAllCampaignStatuses(
  db: DbExecutor
): Promise<{
  updatedCount: number;
  counts: { active: number; expired: number; hidden: number; other: number };
}> {
  const updateResult = await db.query(
    `UPDATE campaigns SET
      status = CASE
        WHEN is_visible_on_last_scrape = 0 THEN 'hidden'
        WHEN valid_to IS NOT NULL AND valid_to < NOW() THEN 'expired'
        ELSE 'active'
      END,
      updated_at = NOW()`
  );

  const summaryResult = await db.query<{ status: string; count: string | number }>(
    `SELECT status, COUNT(*) AS count FROM campaigns GROUP BY status`
  );

  const counts = { active: 0, expired: 0, hidden: 0, other: 0 };
  for (const row of summaryResult.rows) {
    const n = typeof row.count === 'string' ? parseInt(row.count, 10) : Number(row.count);
    if (row.status === 'active') counts.active = n;
    else if (row.status === 'expired') counts.expired = n;
    else if (row.status === 'hidden') counts.hidden = n;
    else counts.other += n;
  }

  return {
    updatedCount: updateResult.rowCount ?? 0,
    counts,
  };
}

export async function applyAiExtractedDates(
  db: DbExecutor,
  campaignId: string,
  dates: {
    validFrom: Date | null;
    validTo: Date | null;
    validFromSource: string | null;
    validToSource: string | null;
    validFromConfidence: number | null;
    validToConfidence: number | null;
    rawDateText: string | null;
  }
): Promise<void> {
  await db.query(
    `UPDATE campaigns SET
      valid_from = COALESCE($2, valid_from),
      valid_to = COALESCE($3, valid_to),
      valid_from_source = COALESCE($4, valid_from_source),
      valid_to_source = COALESCE($5, valid_to_source),
      valid_from_confidence = COALESCE($6, valid_from_confidence),
      valid_to_confidence = COALESCE($7, valid_to_confidence),
      raw_date_text = COALESCE($8, raw_date_text),
      updated_at = NOW()
    WHERE id = $1`,
    [
      campaignId,
      dates.validFrom,
      dates.validTo,
      dates.validFromSource,
      dates.validToSource,
      dates.validFromConfidence,
      dates.validToConfidence,
      dates.rawDateText,
    ]
  );
}

export async function insertAiAnalysis(
  db: DbExecutor,
  data: {
    campaignId: string;
    campaignVersionId?: string;
    analysisType?: string;
    modelProvider?: string;
    modelName?: string;
    promptVersion?: string;
    status?: string;
    /** Legacy. Migration 018 introduces competitive_intent; new pipeline writes leave this null. */
    sentimentLabel?: string | null;
    sentimentScore?: number | null;
    /** Migration 018 — growth-actionable taxonomy. */
    competitiveIntent?: string | null;
    competitiveIntentConfidence?: number | null;
    categoryCode?: string | null;
    categoryConfidence?: number | null;
    summaryText?: string | null;
    keyPoints?: string[];
    riskFlags?: string[];
    recommendationText?: string | null;
    extractedValidFrom?: string | null;
    extractedValidTo?: string | null;
    extractedDateConfidence?: number | null;
    minDeposit?: number | null;
    maxBonus?: number | null;
    bonusAmount?: number | null;
    bonusPercentage?: number | null;
    freeBetAmount?: number | null;
    cashbackPercent?: number | null;
    turnover?: string | null;
    extractedDetails?: Record<string, unknown>;
    rawRequest?: Record<string, unknown>;
    rawResponse?: Record<string, unknown>;
    tokensInput?: number;
    tokensOutput?: number;
    durationMs?: number;
    confidence?: number;
  }
): Promise<string> {
  // Column count = 34, value count = 34 (32 fields + NOW()).
  // competitive_intent + competitive_intent_confidence inserted between
  // sentiment_score and category_code to mirror the table layout post #018.
  await db.query(
    `INSERT INTO campaign_ai_analyses (
      campaign_id, campaign_version_id, analysis_type, model_provider, model_name,
      prompt_version, status, sentiment_label, sentiment_score,
      competitive_intent, competitive_intent_confidence,
      category_code, category_confidence, summary_text, key_points, risk_flags, recommendation_text,
      extracted_valid_from, extracted_valid_to, extracted_date_confidence,
      min_deposit, max_bonus, bonus_amount, bonus_percentage, free_bet_amount,
      cashback_percent, turnover, extracted_details, raw_request, raw_response,
      tokens_input, tokens_output, duration_ms, confidence, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
      $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, NOW()
    )`,
    [
      data.campaignId,
      data.campaignVersionId ?? null,
      data.analysisType ?? 'content_analysis',
      data.modelProvider ?? 'deepseek',
      data.modelName ?? 'deepseek-chat',
      data.promptVersion ?? 'v1',
      data.status ?? 'completed',
      data.sentimentLabel ?? null,
      toDbConfidence(data.sentimentScore),
      data.competitiveIntent ?? 'unknown',
      toDbConfidence(data.competitiveIntentConfidence),
      data.categoryCode ?? null,
      toDbConfidence(data.categoryConfidence),
      data.summaryText ?? null,
      data.keyPoints ? JSON.stringify(data.keyPoints) : JSON.stringify([]),
      data.riskFlags ? JSON.stringify(data.riskFlags) : JSON.stringify([]),
      data.recommendationText ?? null,
      data.extractedValidFrom ?? null,
      data.extractedValidTo ?? null,
      toDbConfidence(data.extractedDateConfidence),
      data.minDeposit ?? null,
      data.maxBonus ?? null,
      data.bonusAmount ?? null,
      data.bonusPercentage ?? null,
      data.freeBetAmount ?? null,
      data.cashbackPercent ?? null,
      data.turnover ?? null,
      data.extractedDetails ? JSON.stringify(data.extractedDetails) : null,
      data.rawRequest ? JSON.stringify(data.rawRequest) : null,
      data.rawResponse ? JSON.stringify(data.rawResponse) : null,
      data.tokensInput ?? null,
      data.tokensOutput ?? null,
      data.durationMs ?? null,
      toDbConfidence(data.confidence),
    ]
  );

  // MySQL doesn't support RETURNING. We return the latest row for this campaign.
  const row = await db.query<{ id: string }>(
    `SELECT id FROM campaign_ai_analyses WHERE campaign_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [data.campaignId]
  );
  return requireInsertedId(row.rows);
}

export async function getCampaignForRecalc(
  db: DbExecutor,
  campaignId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query(
    `SELECT c.*, s.id as site_id, s.code as site_code
    FROM campaigns c
    JOIN sites s ON c.site_id = s.id
    WHERE c.id = $1`,
    [campaignId]
  );
  return result.rows[0] ?? null;
}

export async function getAiAnalysisStats(
  db: DbExecutor,
  campaignId?: string
): Promise<Record<string, unknown> | null> {
  let sql: string;
  let params: unknown[];

  if (campaignId !== undefined) {
    sql = `
      SELECT 
        COUNT(*) as total,
        NULL as avg_value_score,
        CAST('{}' AS JSON) as category_dist
      FROM campaign_ai_analyses
      WHERE campaign_id = $1
    `;
    params = [campaignId];
  } else {
    sql = `
      SELECT 
        COUNT(*) as total,
        NULL as avg_value_score,
        CAST('{}' AS JSON) as category_dist
      FROM campaign_ai_analyses
    `;
    params = [];
  }

  const result = await db.query(sql, params);
  return result.rows[0] ?? null;
}

export async function updateCampaignAiAnalysis(
  db: DbExecutor,
  campaignId: string,
  analysis: {
    category: string | null;
    tags: string;
    sentiment: string;
    targetAudience?: string | null;
    valueScore?: number;
    keyPoints?: string[];
    summary?: string;
    expirationRisk?: string;
    extractedTags?: Record<string, unknown>;
    campaign_type?: string;
    type_confidence?: number;
    type_reasoning?: string;
    conditions?: Record<string, unknown>;
    risk_flags?: string[];
    valid_from?: string | null;
    valid_to?: string | null;
    date_confidence?: number;
    extraction_confidence?: number;
    [key: string]: unknown;
  }
): Promise<void> {
  await db.query(
    `UPDATE campaigns SET
      metadata = JSON_SET(
        COALESCE(metadata, JSON_OBJECT()),
        '$.ai_analysis',
        JSON_MERGE_PATCH(
          COALESCE(JSON_EXTRACT(metadata, '$.ai_analysis'), JSON_OBJECT()),
          CAST($2 AS JSON)
        )
      ),
      updated_at = NOW()
    WHERE id = $1`,
    [campaignId, JSON.stringify(analysis)]
  );
}

export async function getCampaignForDateExtraction(
  db: DbExecutor,
  campaignId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query(
    `SELECT cv.title, cv.body, c.source_url as terms_url
    FROM campaigns c
    JOIN campaign_versions cv ON c.id = cv.campaign_id
    WHERE c.id = $1
    ORDER BY cv.version_no DESC
    LIMIT 1`,
    [campaignId]
  );
  return result.rows[0] ?? null;
}

export async function getStaleCampaignsWithoutDates(
  db: DbExecutor,
  limit: number
): Promise<string[]> {
  const result = await db.query(
    `SELECT id FROM campaigns
    WHERE valid_to IS NULL
    AND status != 'expired'
    AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
    ORDER BY created_at ASC
    LIMIT $1`,
    [limit]
  );
  return result.rows.map((row) => String(row.id));
}

export async function insertWeeklyReport(
  db: DbExecutor,
  data: {
    periodStart: string;
    periodEnd: string;
    summary: string;
    bySite: string;
    topBonuses: string;
    status: string;
    generatedAt: string;
  }
): Promise<string> {
  await db.query(
    `INSERT INTO weekly_reports (
      period_start, period_end, summary, by_site, top_bonuses, status, generated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON DUPLICATE KEY UPDATE
      summary = VALUES(summary),
      by_site = VALUES(by_site),
      top_bonuses = VALUES(top_bonuses),
      status = VALUES(status),
      generated_at = VALUES(generated_at),
      updated_at = CURRENT_TIMESTAMP(6)
    `,
    [
      data.periodStart,
      data.periodEnd,
      data.summary,
      data.bySite,
      data.topBonuses,
      data.status,
      data.generatedAt,
    ]
  );

  const row = await db.query<{ id: string }>(
    `SELECT id FROM weekly_reports
     WHERE period_start = $1 AND period_end = $2 AND status = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [data.periodStart, data.periodEnd, data.status]
  );
  return requireInsertedId(row.rows);
}

export async function hasWeeklyReportForPeriod(
  db: DbExecutor,
  periodStart: string,
  periodEnd: string
): Promise<boolean> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM weekly_reports
     WHERE period_start = $1 AND period_end = $2`,
    [periodStart, periodEnd]
  );
  return parseInt(result.rows[0]?.count || '0', 10) > 0;
}

export async function getWeeklyReportItems(
  db: DbExecutor,
  reportId: string
): Promise<Record<string, unknown>[]> {
  const result = await db.query(
    `SELECT * FROM weekly_reports WHERE id = $1`,
    [reportId]
  );
  return result.rows;
}

export async function findSimilarCampaigns(
  db: DbExecutor,
  campaignId: string,
  category: string | null,
  limit: number
): Promise<Record<string, unknown>[]> {
  let query = `
    SELECT c.*, cs.similarity_score as similarity_score
    FROM campaigns c
    JOIN campaign_similarities cs ON c.id = cs.campaign_id_2
    WHERE cs.campaign_id_1 = $1
  `;
  const params: unknown[] = [campaignId];

  if (category) {
    query += ` AND COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.category')),
      JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.campaign_type'))
    ) = $2`;
    params.push(category);
  }

  query += ` ORDER BY cs.similarity_score DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await db.query(query, params);
  return result.rows;
}

export async function insertCampaignSimilarity(
  db: DbExecutor,
  data: {
    campaignId: string;
    similarCampaignId: string;
    similarityScore: number;
    comparisonType?: string;
  }
): Promise<string> {
  await db.query(
    `INSERT INTO campaign_similarities (
      campaign_id_1, campaign_id_2, similarity_score, comparison_type
    ) VALUES ($1, $2, $3, $4)
    ON DUPLICATE KEY UPDATE
      similarity_score = VALUES(similarity_score),
      comparison_type = VALUES(comparison_type)`,
    [
      data.campaignId,
      data.similarCampaignId,
      data.similarityScore,
      data.comparisonType ?? null,
    ]
  );
  const row = await db.query(
    `SELECT id FROM campaign_similarities WHERE campaign_id_1 = $1 AND campaign_id_2 = $2 LIMIT 1`,
    [data.campaignId, data.similarCampaignId]
  );
  return requireInsertedId(row.rows);
}

export async function insertScrapeRun(
  db: DbExecutor,
  data: {
    siteId: string;
    status: string;
    startedAt: Date;
    cardsFound: number;
    newCampaigns: number;
    updatedCampaigns: number;
    unchanged: number;
    errors: string | null;
  }
): Promise<string> {
  await db.query(
    `INSERT INTO scrape_runs (
      site_id, status, started_at, cards_found,
      new_campaigns, updated_campaigns, unchanged, errors
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      data.siteId,
      data.status,
      data.startedAt,
      data.cardsFound,
      data.newCampaigns,
      data.updatedCampaigns,
      data.unchanged,
      data.errors,
    ]
  );

  const row = await db.query<{ id: string }>(
    `SELECT id FROM scrape_runs
     WHERE site_id = $1 AND status = $2 AND started_at = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [data.siteId, data.status, data.startedAt]
  );
  return requireInsertedId(row.rows);
}

export async function updateScrapeRun(
  db: DbExecutor,
  runId: string,
  data: {
    status?: string;
    completedAt?: Date;
    cardsFound?: number;
    newCampaigns?: number;
    updatedCampaigns?: number;
    unchanged?: number;
    errors?: string | null;
  }
): Promise<void> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (data.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    params.push(data.status);
  }
  if (data.completedAt !== undefined) {
    updates.push(`completed_at = $${paramIndex++}`);
    params.push(data.completedAt);
  }
  if (data.cardsFound !== undefined) {
    updates.push(`cards_found = $${paramIndex++}`);
    params.push(data.cardsFound);
  }
  if (data.newCampaigns !== undefined) {
    updates.push(`new_campaigns = $${paramIndex++}`);
    params.push(data.newCampaigns);
  }
  if (data.updatedCampaigns !== undefined) {
    updates.push(`updated_campaigns = $${paramIndex++}`);
    params.push(data.updatedCampaigns);
  }
  if (data.unchanged !== undefined) {
    updates.push(`unchanged = $${paramIndex++}`);
    params.push(data.unchanged);
  }
  if (data.errors !== undefined) {
    updates.push(`errors = $${paramIndex++}`);
    params.push(data.errors);
  }

  if (updates.length === 0) return;

  params.push(runId);
  await db.query(
    `UPDATE scrape_runs SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    params
  );
}

export async function insertScrapeRunSite(
  db: DbExecutor,
  data: {
    scrapeRunId: string;
    siteId: string;
    status: string;
    cardsFound: number;
    newCampaigns: number;
    updatedCampaigns: number;
    unchanged: number;
    errors: string | null;
  }
): Promise<string> {
  await db.query(
    `INSERT INTO scrape_run_sites (
      scrape_run_id, site_id, status, cards_found,
      new_campaigns, updated_campaigns, unchanged, errors
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      data.scrapeRunId,
      data.siteId,
      data.status,
      data.cardsFound,
      data.newCampaigns,
      data.updatedCampaigns,
      data.unchanged,
      data.errors,
    ]
  );

  const row = await db.query<{ id: string }>(
    `SELECT id FROM scrape_run_sites
     WHERE scrape_run_id = $1 AND site_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [data.scrapeRunId, data.siteId]
  );
  return requireInsertedId(row.rows);
}

export async function updateScrapeRunSite(
  db: DbExecutor,
  siteRunId: string,
  data: {
    status?: string;
    cardsFound?: number;
    newCampaigns?: number;
    updatedCampaigns?: number;
    unchanged?: number;
    errors?: string | null;
  }
): Promise<void> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (data.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    params.push(data.status);
  }
  if (data.cardsFound !== undefined) {
    updates.push(`cards_found = $${paramIndex++}`);
    params.push(data.cardsFound);
  }
  if (data.newCampaigns !== undefined) {
    updates.push(`new_campaigns = $${paramIndex++}`);
    params.push(data.newCampaigns);
  }
  if (data.updatedCampaigns !== undefined) {
    updates.push(`updated_campaigns = $${paramIndex++}`);
    params.push(data.updatedCampaigns);
  }
  if (data.unchanged !== undefined) {
    updates.push(`unchanged = $${paramIndex++}`);
    params.push(data.unchanged);
  }
  if (data.errors !== undefined) {
    updates.push(`errors = $${paramIndex++}`);
    params.push(data.errors);
  }

  if (updates.length === 0) return;

  params.push(siteRunId);
  await db.query(
    `UPDATE scrape_run_sites SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    params
  );
}

export async function insertRawSnapshot(
  db: DbExecutor,
  data: {
    campaignId: string;
    siteId: string;
    rawData: Record<string, unknown>;
  }
): Promise<string> {
  await db.query(
    `INSERT INTO raw_campaign_snapshots (campaign_id, site_id, raw_data, created_at)
    VALUES ($1, $2, $3, NOW())`,
    [data.campaignId, data.siteId, JSON.stringify(data.rawData)]
  );

  const row = await db.query<{ id: string }>(
    `SELECT id FROM raw_campaign_snapshots
     WHERE campaign_id = $1 AND site_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [data.campaignId, data.siteId]
  );
  return requireInsertedId(row.rows);
}

export async function publishSseEvent(
  db: DbExecutor,
  eventType: string,
  channel: string,
  payload: Record<string, unknown>
): Promise<void> {
  await db.query(
    `INSERT INTO sse_events (event_type, event_channel, payload, created_at)
    VALUES ($1, $2, $3, NOW())`,
    [eventType, channel, JSON.stringify(payload)]
  );
}

export async function findExistingCampaign(
  db: DbExecutor,
  fingerprint: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query(
    `SELECT * FROM campaigns WHERE fingerprint = $1 LIMIT 1`,
    [fingerprint]
  );
  return result.rows[0] ?? null;
}

export async function getActiveCampaignsBySite(
  db: DbExecutor,
  siteCode: string
): Promise<Record<string, unknown>[]> {
  const result = await db.query(
    `SELECT c.* FROM campaigns c
    JOIN sites s ON c.site_id = s.id
    WHERE s.code = $1 AND c.status NOT IN ('expired', 'hidden')`,
    [siteCode]
  );
  return result.rows;
}

export async function updateCampaignVisibility(
  db: DbExecutor,
  fingerprint: string,
  visibility: string
): Promise<void> {
  await db.query(
    `UPDATE campaigns SET is_visible_on_last_scrape = $1, updated_at = NOW() WHERE fingerprint = $2`,
    [visibility === 'visible', fingerprint]
  );
}

export async function updateCampaign(
  db: DbExecutor,
  campaignId: string,
  data: {
    title: string;
    body: string | null;
    status: string;
    lastSeenAt: string;
    validFrom?: Date | null;
    validTo?: Date | null;
    validFromSource?: string | null;
    validToSource?: string | null;
    validFromConfidence?: number | null;
    validToConfidence?: number | null;
    rawDateText?: string | null;
  }
): Promise<void> {
  // Convert ISO timestamp to MySQL timestamp format (replace T with space, remove Z)
  const toMySQLTimestamp = (isoString: string): string => {
    return isoString.replace('T', ' ').replace('Z', '');
  };

  // Status'u DB tarafında türet: hint olarak gelen $3'ü kullan ama valid_to
  // (yeni veya eski) NOW()'dan küçükse 'expired', is_visible_on_last_scrape=0
  // ise 'hidden'. Bu sayede AI date extraction valid_to'yu sonradan güncellese
  // bile bir sonraki scrape update'inde status doğru olur.
  await db.query(
    `UPDATE campaigns SET
      title = $1,
      body = $2,
      status = CASE
        WHEN is_visible_on_last_scrape = 0 THEN 'hidden'
        WHEN COALESCE($6, valid_to) IS NOT NULL AND COALESCE($6, valid_to) < NOW() THEN 'expired'
        ELSE $3
      END,
      last_seen_at = $4,
      valid_from = COALESCE($5, valid_from),
      valid_to = COALESCE($6, valid_to),
      valid_from_source = COALESCE($7, valid_from_source),
      valid_to_source = COALESCE($8, valid_to_source),
      valid_from_confidence = COALESCE($9, valid_from_confidence),
      valid_to_confidence = COALESCE($10, valid_to_confidence),
      raw_date_text = COALESCE($11, raw_date_text),
      updated_at = NOW()
    WHERE id = $12`,
    [
      data.title,
      data.body,
      data.status,
      toMySQLTimestamp(data.lastSeenAt),
      data.validFrom ?? null,
      data.validTo ?? null,
      data.validFromSource ?? null,
      data.validToSource ?? null,
      data.validFromConfidence ?? null,
      data.validToConfidence ?? null,
      data.rawDateText ?? null,
      campaignId,
    ]
  );
}

export async function updateSiteScrapeStatus(
  db: DbExecutor,
  siteCode: string,
  data: {
    lastScrapedAt: Date;
    lastScrapeStatus: string;
    lastScrapeError: string | null;
    campaignCount: number;
  }
): Promise<void> {
  await db.query(
    `UPDATE sites SET
      last_scraped_at = $1,
      last_scrape_status = $2,
      last_scrape_error = $3,
      campaign_count = $4,
      updated_at = NOW()
    WHERE code = $5`,
    [
      data.lastScrapedAt,
      data.lastScrapeStatus,
      data.lastScrapeError,
      data.campaignCount,
      siteCode,
    ]
  );
}

export async function getCampaignCountBySite(
  db: DbExecutor,
  siteCode: string
): Promise<{ count: number } | null> {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM campaigns c
    JOIN sites s ON c.site_id = s.id
    WHERE s.code = $1`,
    [siteCode]
  );
  return countAggregate(result.rows);
}

export async function getLatestVersion(
  db: DbExecutor,
  campaignId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query(
    `SELECT * FROM campaign_versions
    WHERE campaign_id = $1
    ORDER BY version_no DESC
    LIMIT 1`,
    [campaignId]
  );
  return result.rows[0] ?? null;
}

export async function getVersionCount(
  db: DbExecutor,
  campaignId: string
): Promise<{ count: number } | null> {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM campaign_versions WHERE campaign_id = $1`,
    [campaignId]
  );
  return countAggregate(result.rows);
}

// version_no is auto-managed by trigger or app logic

export async function updateCampaignVersionId(
  db: DbExecutor,
  campaignId: string,
  versionId: string
): Promise<void> {
  await db.query(
    `UPDATE campaigns SET current_version_id = $1 WHERE id = $2`,
    [versionId, campaignId]
  );
}

export async function insertJob(
  db: DbExecutor,
  data: {
    type: string;
    status: string;
    priority: number;
    payload: string;
    maxAttempts: number;
    scheduledAt: Date;
  }
): Promise<number> {
  await db.query(
    `INSERT INTO jobs (type, status, priority, payload, max_attempts, scheduled_at)
    VALUES ($1, $2, $3, CAST($4 AS JSON), $5, $6)
    `,
    [data.type, data.status, data.priority, data.payload, data.maxAttempts, data.scheduledAt]
  );

  const row = await db.query<{ id: number }>(
    `SELECT id FROM jobs
     WHERE type = $1 AND status = $2 AND scheduled_at = $3
     ORDER BY id DESC
     LIMIT 1`,
    [data.type, data.status, data.scheduledAt]
  );
  return insertedJobId(row.rows);
}

export async function getPendingJobs(
  db: DbExecutor,
  limit: number = 10
): Promise<Record<string, unknown>[]> {
  const result = await db.query(
    `SELECT * FROM jobs
    WHERE status = 'pending' AND scheduled_at <= NOW()
    ORDER BY priority DESC, scheduled_at ASC
    LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function updateJobStatus(
  db: DbExecutor,
  jobId: number,
  status: string,
  result?: string | null,
  error?: string | null
): Promise<void> {
  if (status === 'processing') {
    await db.query(
      `UPDATE jobs SET status = $1, started_at = NOW() WHERE id = $2`,
      [status, jobId]
    );
  } else if (status === 'completed' || status === 'failed') {
    await db.query(
      `UPDATE jobs SET status = $1, result = $2, error = $3, completed_at = NOW() WHERE id = $4`,
      [status, result ?? null, error ?? null, jobId]
    );
  } else {
    await db.query(
      `UPDATE jobs SET status = $1 WHERE id = $2`,
      [status, jobId]
    );
  }
}

export async function incrementJobAttempts(
  db: DbExecutor,
  jobId: number
): Promise<void> {
  await db.query(
    `UPDATE jobs SET attempts = attempts + 1 WHERE id = $1`,
    [jobId]
  );
}

export async function getTotalCampaignsInPeriod(
  db: DbExecutor,
  startDate: string,
  endDate: string
): Promise<{ count: number } | null> {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM campaigns
    WHERE created_at >= $1 AND created_at <= $2`,
    [startDate, endDate]
  );
  return countAggregate(result.rows);
}

export async function getNewCampaignsInPeriod(
  db: DbExecutor,
  startDate: string,
  endDate: string
): Promise<{ count: number } | null> {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM campaigns
    WHERE created_at >= $1 AND created_at <= $2
    AND status_reason = 'created'`,
    [startDate, endDate]
  );
  return countAggregate(result.rows);
}

export async function getExpiredCampaignsInPeriod(
  db: DbExecutor,
  startDate: string,
  endDate: string
): Promise<{ count: number } | null> {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM campaigns
    WHERE updated_at >= $1 AND updated_at <= $2
    AND status = 'expired'`,
    [startDate, endDate]
  );
  return countAggregate(result.rows);
}

export async function getUpdatedCampaignsInPeriod(
  db: DbExecutor,
  startDate: string,
  endDate: string
): Promise<{ count: number } | null> {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM campaigns
    WHERE updated_at >= $1 AND updated_at <= $2
    AND status = 'updated'`,
    [startDate, endDate]
  );
  return countAggregate(result.rows);
}

export async function getActiveSitesInPeriod(
  db: DbExecutor,
  startDate: string,
  endDate: string
): Promise<{ count: number } | null> {
  const result = await db.query(
    `SELECT COUNT(DISTINCT site_id) as count FROM campaigns
    WHERE created_at >= $1 AND created_at <= $2`,
    [startDate, endDate]
  );
  return countAggregate(result.rows);
}

export async function getCampaignsBySiteInPeriod(
  db: DbExecutor,
  startDate: string,
  endDate: string,
  includeSites?: string[]
): Promise<Record<string, unknown>[]> {
  let query = `
    SELECT 
      s.code as site_code,
      COUNT(c.id) as total,
      COUNT(CASE WHEN c.status_reason = 'created' THEN 1 END) as new_count,
      COUNT(CASE WHEN c.status = 'updated' THEN 1 END) as updated_count,
      COUNT(CASE WHEN c.status = 'expired' THEN 1 END) as expired_count
    FROM campaigns c
    JOIN sites s ON c.site_id = s.id
    WHERE c.created_at >= $1 AND c.created_at <= $2
  `;
  const params: unknown[] = [startDate, endDate];

  if (includeSites && includeSites.length > 0) {
    const placeholders = includeSites.map((_, i) => `$${3 + i}`).join(', ');
    query += ` AND s.code IN (${placeholders})`;
    params.push(...includeSites);
  }

  query += ` GROUP BY s.code`;

  const result = await db.query(query, params);
  return result.rows;
}

export async function getTopBonusesInPeriod(
  db: DbExecutor,
  startDate: string,
  endDate: string,
  limit: number
): Promise<Record<string, unknown>[]> {
  const result = await db.query(
    `SELECT 
      s.code as site_code,
      cv.title,
      CAST(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.valueScore')) AS DECIMAL(20,4)) as value_score,
      JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis')) as ai_analysis
    FROM campaigns c
    JOIN sites s ON c.site_id = s.id
    JOIN campaign_versions cv ON c.id = cv.campaign_id
    WHERE c.created_at >= $1 AND c.created_at <= $2
    ORDER BY (value_score IS NULL), value_score DESC
    LIMIT $3`,
    [startDate, endDate, limit]
  );
  return result.rows;
}

export async function getCampaignStatusCounts(
  db: DbExecutor
): Promise<Record<string, unknown> | null> {
  const result = await db.query(
    `SELECT 
      COUNT(CASE WHEN is_visible_on_last_scrape = true THEN 1 END) as visible,
      COUNT(CASE WHEN is_visible_on_last_scrape = false THEN 1 END) as hidden,
      COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
    FROM campaigns`
  );
  return result.rows[0] ?? null;
}

export async function getLatestWeeklyReport(
  db: DbExecutor
): Promise<Record<string, unknown> | null> {
  const result = await db.query(
    `SELECT * FROM weekly_reports ORDER BY generated_at DESC LIMIT 1`
  );
  return result.rows[0] ?? null;
}

export async function getMaxWeeklyReportPeriodStart(
  db: DbExecutor
): Promise<string | null> {
  const result = await db.query<{ max_period_start: string | Date | null }>(
    `SELECT MAX(period_start) AS max_period_start FROM weekly_reports`
  );
  const value = result.rows[0]?.max_period_start ?? null;
  if (!value) {
    return null;
  }
  // Normalize to YYYY-MM-DD (MySQL may return Date or string)
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  const str = String(value);
  return str.length >= 10 ? str.substring(0, 10) : str;
}

export async function hasPendingWeeklyReportJobAt(
  db: DbExecutor,
  scheduledAt: Date
): Promise<boolean> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM jobs
     WHERE type = 'weekly-report'
       AND status IN ('pending', 'processing')
       AND scheduled_at = $1`,
    [scheduledAt]
  );
  return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
}

export async function getWeeklyReportHistory(
  db: DbExecutor,
  limit: number
): Promise<Record<string, unknown>[]> {
  const result = await db.query(
    `SELECT * FROM weekly_reports ORDER BY generated_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function getCampaignIdsBySite(
  db: DbExecutor,
  siteCode: string,
  batchSize: number
): Promise<string[]> {
  const result = await db.query(
    `SELECT c.id FROM campaigns c
    JOIN sites s ON c.site_id = s.id
    WHERE s.code = $1
    LIMIT $2`,
    [siteCode, batchSize]
  );
  return result.rows.map((row) => String(row.id));
}

export async function getAllCampaignIds(
  db: DbExecutor,
  batchSize: number
): Promise<string[]> {
  const result = await db.query(
    `SELECT id FROM campaigns LIMIT $1`,
    [batchSize]
  );
  return result.rows.map((row) => String(row.id));
}

export async function getLatestVersionForCampaign(
  db: DbExecutor,
  campaignId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query(
    `SELECT * FROM campaign_versions
    WHERE campaign_id = $1
    ORDER BY version_no DESC
    LIMIT 1`,
    [campaignId]
  );
  return result.rows[0] ?? null;
}

export async function getCampaignStatus(
  db: DbExecutor,
  campaignId: string
): Promise<{ status: string } | null> {
  const result = await db.query(
    `SELECT status FROM campaigns WHERE id = $1`,
    [campaignId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { status: String(row.status) };
}

export async function updateCampaignStatus(
  db: DbExecutor,
  campaignId: string,
  status: string,
  visibility: string
): Promise<void> {
  await db.query(
    `UPDATE campaigns SET status = $1, is_visible_on_last_scrape = $2, updated_at = NOW() WHERE id = $3`,
    [status, visibility === 'visible', campaignId]
  );
}

export async function getExpiredCampaignIds(
  db: DbExecutor
): Promise<string[]> {
  const result = await db.query(
    `SELECT id FROM campaigns WHERE status = 'expired'`
  );
  return result.rows.map((row) => String(row.id));
}

export async function getPendingCampaignIds(
  db: DbExecutor
): Promise<string[]> {
  const result = await db.query(
    `SELECT id FROM campaigns WHERE status = 'pending'`
  );
  return result.rows.map((row) => String(row.id));
}

export async function insertErrorLog(
  db: DbExecutor,
  data: {
    errorCode?: string
    errorMessage: string
    context?: Record<string, unknown>
    stackTrace?: string
    severity?: string
  }
): Promise<string> {
  await db.query(
    `INSERT INTO error_logs (
      error_code, error_message, context, stack_trace, severity
    ) VALUES ($1, $2, $3, $4, $5)
    `,
    [
      data.errorCode || null,
      data.errorMessage,
      data.context ? JSON.stringify(data.context) : '{}',
      data.stackTrace || null,
      data.severity || 'error',
    ]
  );

  const row = await db.query<{ id: string }>(
    `SELECT id FROM error_logs
     WHERE
       (error_code = $1 OR ($1 IS NULL AND error_code IS NULL))
       AND error_message = $2
       AND severity = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [data.errorCode || null, data.errorMessage, data.severity || 'error']
  );
  return requireInsertedId(row.rows);
}

// BE-9: Dead Letter Queue - failed jobs are moved to failed_jobs table after max attempts
export async function insertFailedJob(
  db: DbExecutor,
  data: {
    originalJobId: number;
    type: string;
    payload: string;
    error: string;
    attempts: number;
    maxAttempts: number;
  }
): Promise<string> {
  await db.query(
    `INSERT INTO failed_jobs (
      original_job_id, job_type, payload, error_message, attempts, max_attempts, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `,
    [
      data.originalJobId,
      data.type,
      data.payload,
      data.error,
      data.attempts,
      data.maxAttempts,
    ]
  );

  const row = await db.query<{ id: string }>(
    `SELECT id FROM failed_jobs
     WHERE original_job_id = $1 AND job_type = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [data.originalJobId, data.type]
  );
  return requireInsertedId(row.rows);
}

export async function getFailedJobs(
  db: DbExecutor,
  limit: number = 100
): Promise<Record<string, unknown>[]> {
  const result = await db.query(
    `SELECT * FROM failed_jobs
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function retryFailedJob(
  db: DbExecutor,
  failedJobId: string
): Promise<number> {
  const row = await db.query<{ original_job_id: number; job_type: string; payload: string; max_attempts: number }>(
    `SELECT original_job_id, job_type, payload, max_attempts FROM failed_jobs WHERE id = $1`,
    [failedJobId]
  );
  
  if (row.rows.length === 0) {
    throw new Error('Failed job not found');
  }
  
  const failedJob = row.rows[0];
  
  // Re-insert as a new pending job
  const jobId = await insertJob(db, {
    type: failedJob.job_type,
    status: 'pending',
    priority: 0,
    payload: failedJob.payload,
    maxAttempts: failedJob.max_attempts ?? 3,
    scheduledAt: new Date(),
  });
  
  // Mark the failed job as retried
  await db.query(
    `UPDATE failed_jobs SET retried = true, retried_at = NOW(), new_job_id = $1 WHERE id = $2`,
    [jobId, failedJobId]
  );
  
  return jobId;
}
