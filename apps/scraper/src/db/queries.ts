import { Pool, PoolClient } from 'pg';

export async function findCampaignByExternalId(
  db: Pool,
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
  db: Pool,
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
  db: Pool,
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
  const result = await db.query(
    `INSERT INTO campaigns (
      site_id, external_id, source_url, canonical_url, title, body, normalized_text,
      fingerprint, content_version, primary_image_url, valid_from, valid_to,
      valid_from_source, valid_to_source, valid_from_confidence, valid_to_confidence,
      raw_date_text, status, status_reason, tags, metadata,
      first_seen_at, last_seen_at, last_visible_at, is_visible_on_last_scrape,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
      NOW(), NOW(), NOW(), true, NOW(), NOW()
    ) RETURNING id`,
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
      data.tags || null,
      data.metadata ? JSON.stringify(data.metadata) : null,
    ]
  );
  return result.rows[0].id;
}

export async function updateCampaignLastSeen(
  db: Pool,
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
  db: Pool,
  data: {
    campaignId: string;
    title: string;
    body: string | null;
    normalizedText: string;
    fingerprint: string;
    primaryImageUrl: string | null;
    validFrom: Date | null;
    validTo: Date | null;
    validFromSource: string | null;
    validToSource: string | null;
    rawDateText: string | null;
    versionNo: number;
  }
): Promise<string> {
  const result = await db.query(
    `INSERT INTO campaign_versions (
      campaign_id, title, body, normalized_text,
      fingerprint, primary_image_url, valid_from, valid_to,
      valid_from_source, valid_to_source,
      raw_date_text, version_no, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
    ) RETURNING id`,
    [
      data.campaignId,
      data.title,
      data.body,
      data.normalizedText,
      data.fingerprint,
      data.primaryImageUrl,
      data.validFrom,
      data.validTo,
      data.validFromSource,
      data.validToSource,
      data.rawDateText,
      data.versionNo,
    ]
  );
  return result.rows[0].id;
}

export async function recalculateCampaignStatus(
  db: Pool,
  campaignId: string
): Promise<void> {
  await db.query(`SELECT recalculate_campaign_status($1)`, [campaignId]);
}

export async function applyAiExtractedDates(
  db: Pool,
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
  db: Pool,
  data: {
    campaignId: string;
    campaignVersionId?: string;
    analysisType?: string;
    modelProvider?: string;
    modelName?: string;
    promptVersion?: string;
    status?: string;
    sentimentLabel?: string | null;
    sentimentScore?: number | null;
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
  const result = await db.query(
    `INSERT INTO campaign_ai_analyses (
      campaign_id, campaign_version_id, analysis_type, model_provider, model_name,
      prompt_version, status, sentiment_label, sentiment_score, category_code,
      category_confidence, summary_text, key_points, risk_flags, recommendation_text,
      extracted_valid_from, extracted_valid_to, extracted_date_confidence,
      min_deposit, max_bonus, bonus_amount, bonus_percentage, free_bet_amount,
      cashback_percent, turnover, extracted_details, raw_request, raw_response,
      tokens_input, tokens_output, duration_ms, confidence, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
      $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, NOW()
    ) RETURNING id`,
    [
      data.campaignId,
      data.campaignVersionId ?? null,
      data.analysisType ?? null,
      data.modelProvider ?? null,
      data.modelName ?? null,
      data.promptVersion ?? null,
      data.status ?? null,
      data.sentimentLabel ?? null,
      data.sentimentScore ?? null,
      data.categoryCode ?? null,
      data.categoryConfidence ?? null,
      data.summaryText ?? null,
      data.keyPoints ?? null,
      data.riskFlags ?? null,
      data.recommendationText ?? null,
      data.extractedValidFrom ?? null,
      data.extractedValidTo ?? null,
      data.extractedDateConfidence ?? null,
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
      data.confidence ?? null,
    ]
  );
  return result.rows[0].id;
}

export async function getCampaignForRecalc(
  db: Pool,
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
  db: Pool,
  campaignId?: number
): Promise<Record<string, unknown> | null> {
  let query: string;
  let params: unknown[];

  if (campaignId !== undefined) {
    query = `
      SELECT 
        COUNT(*) as total,
        AVG((analysis->>'valueScore')::numeric) as avg_value_score,
        JSONB_OBJECT_AGG(analysis->>'category', COUNT(*)) as category_dist
      FROM ai_analyses
      WHERE campaign_id = $1
    `;
    params = [campaignId];
  } else {
    query = `
      SELECT 
        COUNT(*) as total,
        AVG((analysis->>'valueScore')::numeric) as avg_value_score,
        JSONB_OBJECT_AGG(analysis->>'category', COUNT(*)) as category_dist
      FROM ai_analyses
    `;
    params = [];
  }

  const result = await db.query(query, params);
  return result.rows[0] ?? null;
}

export async function updateCampaignAiAnalysis(
  db: Pool,
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
      metadata = JSONB_SET(COALESCE(metadata, '{}'), '{ai_analysis}',
        COALESCE(metadata->'ai_analysis', '{}'::jsonb) || $2::jsonb),
      updated_at = NOW()
    WHERE id = $1`,
    [campaignId, JSON.stringify(analysis)]
  );
}

export async function getCampaignForDateExtraction(
  db: Pool,
  campaignId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query(
    `SELECT cv.title, cv.body, cv.source_url as terms_url
    FROM campaigns c
    JOIN campaign_versions cv ON c.id = cv.campaign_id
    WHERE c.id = $1
    ORDER BY cv.content_version DESC
    LIMIT 1`,
    [campaignId]
  );
  return result.rows[0] ?? null;
}

export async function getStaleCampaignsWithoutDates(
  db: Pool,
  limit: number
): Promise<string[]> {
  const result = await db.query(
    `SELECT id FROM campaigns
    WHERE valid_to IS NULL
    AND status != 'expired'
    AND created_at < NOW() - INTERVAL '7 days'
    ORDER BY created_at ASC
    LIMIT $1`,
    [limit]
  );
  return result.rows.map((row) => row.id);
}

export async function insertWeeklyReport(
  db: Pool,
  data: {
    periodStart: string;
    periodEnd: string;
    summary: string;
    bySite: string;
    topBonuses: string;
    status: string;
    generatedAt: string;
  }
): Promise<number> {
  const result = await db.query(
    `INSERT INTO weekly_reports (
      period_start, period_end, summary, by_site, top_bonuses, status, generated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id`,
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
  return result.rows[0].id;
}

export async function getWeeklyReportItems(
  db: Pool,
  reportId: string
): Promise<Record<string, unknown>[]> {
  const result = await db.query(
    `SELECT * FROM weekly_reports WHERE id = $1`,
    [reportId]
  );
  return result.rows;
}

export async function findSimilarCampaigns(
  db: Pool,
  campaignId: string,
  category: string | null,
  limit: number
): Promise<Record<string, unknown>[]> {
  let query = `
    SELECT c.*, similarity_score
    FROM campaigns c
    JOIN campaign_similarities cs ON c.id = cs.similar_campaign_id
    WHERE cs.campaign_id = $1
  `;
  const params: unknown[] = [campaignId];

  if (category) {
    query += ` AND (c.metadata->>'category') = $2`;
    params.push(category);
  }

  query += ` ORDER BY cs.similarity_score DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await db.query(query, params);
  return result.rows;
}

export async function insertCampaignSimilarity(
  db: Pool,
  data: {
    campaignId: string;
    similarCampaignId: string;
    similarityScore: number;
    comparisonType?: string;
  }
): Promise<string> {
  const result = await db.query(
    `INSERT INTO campaign_similarities (
      campaign_id_1, campaign_id_2, similarity_score, comparison_type
    ) VALUES ($1, $2, $3, $4)
    ON CONFLICT (campaign_id_1, campaign_id_2) DO UPDATE
    SET similarity_score = $3, comparison_type = $4
    RETURNING id`,
    [
      data.campaignId,
      data.similarCampaignId,
      data.similarityScore,
      data.comparisonType ?? null,
    ]
  );
  return result.rows[0].id;
}

export async function insertScrapeRun(
  db: Pool,
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
  const result = await db.query(
    `INSERT INTO scrape_runs (
      site_id, status, started_at, cards_found,
      new_campaigns, updated_campaigns, unchanged, errors
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`,
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
  return result.rows[0].id;
}

export async function updateScrapeRun(
  db: Pool,
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
  db: Pool,
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
  const result = await db.query(
    `INSERT INTO scrape_run_sites (
      scrape_run_id, site_id, status, cards_found,
      new_campaigns, updated_campaigns, unchanged, errors
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`,
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
  return result.rows[0].id;
}

export async function updateScrapeRunSite(
  db: Pool,
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
  db: Pool,
  data: {
    campaignId: string;
    siteId: string;
    rawData: Record<string, unknown>;
  }
): Promise<string> {
  const result = await db.query(
    `INSERT INTO raw_campaign_snapshots (campaign_id, site_id, raw_data, created_at)
    VALUES ($1, $2, $3, NOW())
    RETURNING id`,
    [data.campaignId, data.siteId, JSON.stringify(data.rawData)]
  );
  return result.rows[0].id;
}

export async function publishSseEvent(
  db: Pool,
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
  db: Pool,
  fingerprint: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query(
    `SELECT * FROM campaigns WHERE fingerprint = $1 LIMIT 1`,
    [fingerprint]
  );
  return result.rows[0] ?? null;
}

export async function getActiveCampaignsBySite(
  db: Pool,
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
  db: Pool,
  fingerprint: string,
  visibility: string
): Promise<void> {
  await db.query(
    `UPDATE campaigns SET is_visible_on_last_scrape = $1, updated_at = NOW() WHERE fingerprint = $2`,
    [visibility === 'visible', fingerprint]
  );
}

export async function updateCampaign(
  db: Pool,
  campaignId: string,
  data: {
    title: string;
    body: string | null;
    status: string;
    lastSeenAt: string;
  }
): Promise<void> {
  await db.query(
    `UPDATE campaigns SET
      title = $1,
      body = $2,
      status = $3,
      last_seen_at = $4,
      updated_at = NOW()
    WHERE id = $5`,
    [data.title, data.body, data.status, data.lastSeenAt, campaignId]
  );
}

export async function updateSiteScrapeStatus(
  db: Pool,
  siteCode: string,
  data: {
    lastScrapedAt: string;
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
  db: Pool,
  siteCode: string
): Promise<{ count: number } | null> {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM campaigns c
    JOIN sites s ON c.site_id = s.id
    WHERE s.code = $1`,
    [siteCode]
  );
  return result.rows[0] ?? null;
}

export async function getLatestVersion(
  db: Pool,
  campaignId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query(
    `SELECT * FROM campaign_versions
    WHERE campaign_id = $1
    ORDER BY content_version DESC
    LIMIT 1`,
    [campaignId]
  );
  return result.rows[0] ?? null;
}

export async function getVersionCount(
  db: Pool,
  campaignId: string
): Promise<{ count: number } | null> {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM campaign_versions WHERE campaign_id = $1`,
    [campaignId]
  );
  return result.rows[0] ?? null;
}

export async function incrementVersionCount(
  db: Pool,
  campaignId: string
): Promise<void> {
  await db.query(
    `UPDATE campaigns SET version_count = version_count + 1, updated_at = NOW()
    WHERE id = $1`,
    [campaignId]
  );
}

export async function updateCampaignVersionId(
  db: Pool,
  campaignId: string,
  versionId: string
): Promise<void> {
  await db.query(
    `UPDATE campaigns SET current_version_id = $1 WHERE id = $2`,
    [versionId, campaignId]
  );
}

export async function insertJob(
  db: Pool,
  data: {
    type: string;
    status: string;
    priority: number;
    payload: string;
    maxAttempts: number;
    scheduledAt: string;
  }
): Promise<number> {
  const result = await db.query(
    `INSERT INTO jobs (type, status, priority, payload, max_attempts, scheduled_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id`,
    [data.type, data.status, data.priority, data.payload, data.maxAttempts, data.scheduledAt]
  );
  return result.rows[0].id;
}

export async function getPendingJobs(
  db: Pool,
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
  db: Pool,
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
  db: Pool,
  jobId: number
): Promise<void> {
  await db.query(
    `UPDATE jobs SET attempts = attempts + 1 WHERE id = $1`,
    [jobId]
  );
}

export async function getTotalCampaignsInPeriod(
  db: Pool,
  startDate: string,
  endDate: string
): Promise<{ count: number } | null> {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM campaigns
    WHERE created_at >= $1 AND created_at <= $2`,
    [startDate, endDate]
  );
  return result.rows[0] ?? null;
}

export async function getNewCampaignsInPeriod(
  db: Pool,
  startDate: string,
  endDate: string
): Promise<{ count: number } | null> {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM campaigns
    WHERE created_at >= $1 AND created_at <= $2
    AND status_reason = 'created'`,
    [startDate, endDate]
  );
  return result.rows[0] ?? null;
}

export async function getExpiredCampaignsInPeriod(
  db: Pool,
  startDate: string,
  endDate: string
): Promise<{ count: number } | null> {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM campaigns
    WHERE updated_at >= $1 AND updated_at <= $2
    AND status = 'expired'`,
    [startDate, endDate]
  );
  return result.rows[0] ?? null;
}

export async function getUpdatedCampaignsInPeriod(
  db: Pool,
  startDate: string,
  endDate: string
): Promise<{ count: number } | null> {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM campaigns
    WHERE updated_at >= $1 AND updated_at <= $2
    AND status = 'updated'`,
    [startDate, endDate]
  );
  return result.rows[0] ?? null;
}

export async function getActiveSitesInPeriod(
  db: Pool,
  startDate: string,
  endDate: string
): Promise<{ count: number } | null> {
  const result = await db.query(
    `SELECT COUNT(DISTINCT site_id) as count FROM campaigns
    WHERE created_at >= $1 AND created_at <= $2`,
    [startDate, endDate]
  );
  return result.rows[0] ?? null;
}

export async function getCampaignsBySiteInPeriod(
  db: Pool,
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
    query += ` AND s.code = ANY($3)`;
    params.push(includeSites);
  }

  query += ` GROUP BY s.code`;

  const result = await db.query(query, params);
  return result.rows;
}

export async function getTopBonusesInPeriod(
  db: Pool,
  startDate: string,
  endDate: string,
  limit: number
): Promise<Record<string, unknown>[]> {
  const result = await db.query(
    `SELECT 
      s.code as site_code,
      cv.title,
      (c.metadata->>'valueScore')::numeric as value_score,
      (c.metadata->>'ai_analysis') as ai_analysis
    FROM campaigns c
    JOIN sites s ON c.site_id = s.id
    JOIN campaign_versions cv ON c.id = cv.campaign_id
    WHERE c.created_at >= $1 AND c.created_at <= $2
    ORDER BY value_score DESC NULLS LAST
    LIMIT $3`,
    [startDate, endDate, limit]
  );
  return result.rows;
}

export async function getCampaignStatusCounts(
  db: Pool
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
  db: Pool
): Promise<Record<string, unknown> | null> {
  const result = await db.query(
    `SELECT * FROM weekly_reports ORDER BY generated_at DESC LIMIT 1`
  );
  return result.rows[0] ?? null;
}

export async function getWeeklyReportHistory(
  db: Pool,
  limit: number
): Promise<Record<string, unknown>[]> {
  const result = await db.query(
    `SELECT * FROM weekly_reports ORDER BY generated_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function getCampaignIdsBySite(
  db: Pool,
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
  return result.rows.map((row) => row.id);
}

export async function getAllCampaignIds(
  db: Pool,
  batchSize: number
): Promise<string[]> {
  const result = await db.query(
    `SELECT id FROM campaigns LIMIT $1`,
    [batchSize]
  );
  return result.rows.map((row) => row.id);
}

export async function getLatestVersionForCampaign(
  db: Pool,
  campaignId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query(
    `SELECT * FROM campaign_versions
    WHERE campaign_id = $1
    ORDER BY content_version DESC
    LIMIT 1`,
    [campaignId]
  );
  return result.rows[0] ?? null;
}

export async function getCampaignStatus(
  db: Pool,
  campaignId: string
): Promise<{ status: string } | null> {
  const result = await db.query(
    `SELECT status FROM campaigns WHERE id = $1`,
    [campaignId]
  );
  return result.rows[0] ?? null;
}

export async function updateCampaignStatus(
  db: Pool,
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
  db: Pool
): Promise<string[]> {
  const result = await db.query(
    `SELECT id FROM campaigns WHERE status = 'expired'`
  );
  return result.rows.map((row) => row.id);
}

export async function getPendingCampaignIds(
  db: Pool
): Promise<string[]> {
  const result = await db.query(
    `SELECT id FROM campaigns WHERE status = 'pending'`
  );
  return result.rows.map((row) => row.id);
}

export async function insertErrorLog(
  db: Pool,
  data: {
    errorCode?: string
    errorMessage: string
    context?: Record<string, unknown>
    stackTrace?: string
    severity?: string
  }
): Promise<string> {
  const result = await db.query(
    `INSERT INTO error_logs (
      error_code, error_message, context, stack_trace, severity
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING id`,
    [
      data.errorCode || null,
      data.errorMessage,
      data.context ? JSON.stringify(data.context) : '{}',
      data.stackTrace || null,
      data.severity || 'error',
    ]
  );
  return result.rows[0].id;
}
