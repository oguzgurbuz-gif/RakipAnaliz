import { SupabaseClient } from '@supabase/supabase-js';

// ─── Campaigns ───────────────────────────────────────────────────────────────

export async function findExistingCampaign(
  db: SupabaseClient,
  fingerprint: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from('campaigns')
    .select('*')
    .eq('fingerprint', fingerprint)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

export async function insertCampaign(
  db: SupabaseClient,
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
): Promise<{ id: string }> {
  const { data: row, error } = await db
    .from('campaigns')
    .insert({
      site_id: data.siteId,
      external_id: data.externalId,
      source_url: data.sourceUrl,
      canonical_url: data.canonicalUrl,
      title: data.title,
      body: data.body,
      normalized_text: data.normalizedText ?? '',
      fingerprint: data.fingerprint,
      version_no: data.contentVersion,
      primary_image_url: data.primaryImageUrl,
      valid_from: data.validFrom?.toISOString() ?? null,
      valid_to: data.validTo?.toISOString() ?? null,
      valid_from_source: data.validFromSource,
      valid_to_source: data.validToSource,
      valid_from_confidence: data.validFromConfidence,
      valid_to_confidence: data.validToConfidence,
      raw_date_text: data.rawDateText,
      status: data.status,
      status_reason: data.statusReason,
      tags: data.tags ?? [],
      metadata: data.metadata ?? {},
      is_visible_on_last_scrape: true,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: row!.id as string };
}

export async function updateCampaign(
  db: SupabaseClient,
  campaignId: string,
  data: {
    title: string;
    body: string | null;
    status: string;
    lastSeenAt: string;
  }
): Promise<void> {
  const { error } = await db
    .from('campaigns')
    .update({
      title: data.title,
      body: data.body,
      status: data.status,
      last_seen_at: data.lastSeenAt,
    })
    .eq('id', campaignId);
  if (error) throw error;
}

export async function updateCampaignLastSeen(
  db: SupabaseClient,
  campaignId: string
): Promise<void> {
  const { error } = await db
    .from('campaigns')
    .update({
      last_seen_at: new Date().toISOString(),
      last_visible_at: new Date().toISOString(),
      is_visible_on_last_scrape: true,
    })
    .eq('id', campaignId);
  if (error) throw error;
}

export async function updateCampaignVisibility(
  db: SupabaseClient,
  fingerprint: string,
  visibility: string
): Promise<void> {
  const { error } = await db
    .from('campaigns')
    .update({ is_visible_on_last_scrape: visibility === 'visible' })
    .eq('fingerprint', fingerprint);
  if (error) throw error;
}

export async function updateCampaignStatus(
  db: SupabaseClient,
  campaignId: string,
  status: string,
  visibility: string
): Promise<void> {
  const { error } = await db
    .from('campaigns')
    .update({
      status,
      is_visible_on_last_scrape: visibility === 'visible',
    })
    .eq('id', campaignId);
  if (error) throw error;
}

export async function getLatestVersion(
  db: SupabaseClient,
  campaignId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from('campaign_versions')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data as Record<string, unknown> | null;
}

export async function getVersionCount(
  db: SupabaseClient,
  campaignId: string
): Promise<{ count: number } | null> {
  const result = await db
    .from('campaign_versions')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId) as unknown as { data: unknown[]; count: number; error: null };
  if (result.error) throw result.error;
  return { count: result.count ?? 0 };
}

export async function incrementVersionCount(
  db: SupabaseClient,
  campaignId: string
): Promise<void> {
  const { error } = await db.rpc('increment_version_count', { campaign_id: campaignId });
  if (error) {
    const { error: err } = await db.rpc('exec', {
      sql: `UPDATE campaigns SET content_version = content_version + 1, updated_at = NOW() WHERE id = $1`,
      params: [campaignId],
    });
    if (err) throw err;
  }
}

export async function getActiveCampaignsBySite(
  db: SupabaseClient,
  siteCode: string
): Promise<Record<string, unknown>[]> {
  const { data, error } = await db
    .from('campaigns')
    .select('*, sites!inner(code)')
    .eq('sites.code', siteCode)
    .not('status', 'eq', 'expired')
    .not('status', 'eq', 'hidden');
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

export async function getCampaignCountBySite(
  db: SupabaseClient,
  siteCode: string
): Promise<{ count: number } | null> {
  const res2 = await db
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('sites.code', siteCode) as unknown as { data: unknown[]; count: number | null; error: { message: string } | null };
  if (res2.error) throw res2.error;
  return { count: res2.count ?? 0 };
}

export async function updateSiteScrapeStatus(
  db: SupabaseClient,
  siteCode: string,
  data: {
    lastScrapedAt: string;
    lastScrapeStatus: string;
    lastScrapeError: string | null;
    campaignCount: number;
  }
): Promise<void> {
  const { error } = await db
    .from('sites')
    .update({
      last_scraped_at: data.lastScrapedAt,
      last_scrape_status: data.lastScrapeStatus,
      last_scrape_error: data.lastScrapeError,
      campaign_count: data.campaignCount,
    })
    .eq('code', siteCode);
  if (error) throw error;
}

// ─── Campaign versions ───────────────────────────────────────────────────────

export async function insertCampaignVersion(
  db: SupabaseClient,
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
): Promise<{ id: string }> {
  const { data: row, error } = await db
    .from('campaign_versions')
    .insert({
      campaign_id: data.campaignId,
      title: data.title,
      body: data.body,
      normalized_text: data.normalizedText,
      fingerprint: data.fingerprint,
      primary_image_url: data.primaryImageUrl,
      valid_from: data.validFrom?.toISOString() ?? null,
      valid_to: data.validTo?.toISOString() ?? null,
      valid_from_source: data.validFromSource,
      valid_to_source: data.validToSource,
      raw_date_text: data.rawDateText,
      version_no: data.versionNo,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: row!.id as string };
}

export async function updateCampaignVersionId(
  db: SupabaseClient,
  campaignId: string,
  versionId: string
): Promise<void> {
  const { error } = await db
    .from('campaigns')
    .update({ current_version_id: versionId })
    .eq('id', campaignId);
  if (error) throw error;
}

// ─── AI analyses ─────────────────────────────────────────────────────────────

export async function insertAiAnalysis(
  db: SupabaseClient,
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
): Promise<{ id: string }> {
  const { data: row, error } = await db
    .from('campaign_ai_analyses')
    .insert({
      campaign_id: data.campaignId,
      campaign_version_id: data.campaignVersionId ?? null,
      analysis_type: data.analysisType ?? 'content_analysis',
      model_provider: data.modelProvider ?? 'deepseek',
      model_name: data.modelName ?? 'deepseek-chat',
      prompt_version: data.promptVersion ?? '1.0',
      status: data.status ?? 'completed',
      sentiment_label: data.sentimentLabel ?? null,
      sentiment_score: data.sentimentScore ?? null,
      category_code: data.categoryCode ?? null,
      category_confidence: data.categoryConfidence ?? null,
      summary_text: data.summaryText ?? null,
      key_points: data.keyPoints ?? null,
      risk_flags: data.riskFlags ?? null,
      recommendation_text: data.recommendationText ?? null,
      extracted_valid_from: data.extractedValidFrom ?? null,
      extracted_valid_to: data.extractedValidTo ?? null,
      extracted_date_confidence: data.extractedDateConfidence ?? null,
      min_deposit: data.minDeposit ?? null,
      max_bonus: data.maxBonus ?? null,
      bonus_amount: data.bonusAmount ?? null,
      bonus_percentage: data.bonusPercentage ?? null,
      free_bet_amount: data.freeBetAmount ?? null,
      cashback_percent: data.cashbackPercent ?? null,
      turnover: data.turnover ?? null,
      extracted_details: data.extractedDetails ?? null,
      raw_request: data.rawRequest ?? null,
      raw_response: data.rawResponse ?? null,
      tokens_input: data.tokensInput ?? null,
      tokens_output: data.tokensOutput ?? null,
      duration_ms: data.durationMs ?? null,
      confidence: data.confidence ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: row!.id as string };
}

export async function updateCampaignAiAnalysis(
  db: SupabaseClient,
  campaignId: string,
  analysis: Record<string, unknown>
): Promise<void> {
  const { data: current, error: getErr } = await db
    .from('campaigns')
    .select('metadata')
    .eq('id', campaignId)
    .maybeSingle();
  if (getErr) throw getErr;

  const existing = (current?.metadata as Record<string, unknown>) ?? {};
  const merged = { ...existing, ai_analysis: analysis };

  const { error } = await db
    .from('campaigns')
    .update({ metadata: merged })
    .eq('id', campaignId);
  if (error) throw error;
}

// ─── Dates / recalc ──────────────────────────────────────────────────────────

export async function applyAiExtractedDates(
  db: SupabaseClient,
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
  const { error } = await db
    .from('campaigns')
    .update({
      valid_from: dates.validFrom ?? undefined,
      valid_to: dates.validTo ?? undefined,
      valid_from_source: dates.validFromSource,
      valid_to_source: dates.validToSource,
      valid_from_confidence: dates.validFromConfidence,
      valid_to_confidence: dates.validToConfidence,
      raw_date_text: dates.rawDateText,
    })
    .eq('id', campaignId);
  if (error) throw error;
}

export async function recalculateCampaignStatus(
  db: SupabaseClient,
  campaignId: string
): Promise<void> {
  const { error } = await db.rpc('recalculate_campaign_status', { campaign_id: campaignId });
  if (error) throw error;
}

// ─── Jobs ───────────────────────────────────────────────────────────────────

export async function insertJob(
  db: SupabaseClient,
  data: {
    type: string;
    status: string;
    priority: number;
    payload: string;
    maxAttempts: number;
    scheduledAt: string;
  }
): Promise<{ id: number }> {
  const { data: row, error } = await db
    .from('jobs')
    .insert({
      type: data.type,
      status: data.status,
      priority: data.priority,
      payload: JSON.parse(data.payload),
      max_attempts: data.maxAttempts,
      scheduled_at: data.scheduledAt,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: row!.id as number };
}

export async function getPendingJobs(
  db: SupabaseClient,
  limit = 10
): Promise<Record<string, unknown>[]> {
  const { data, error } = await db
    .from('jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('priority', { ascending: false })
    .order('scheduled_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

export async function updateJobStatus(
  db: SupabaseClient,
  jobId: number,
  status: string,
  result?: string | null,
  errorMsg?: string | null
): Promise<void> {
  const updates: Record<string, unknown> = { status };
  if (status === 'processing') updates.started_at = new Date().toISOString();
  if (status === 'completed' || status === 'failed') {
    updates.result = result ?? null;
    updates.error = errorMsg ?? null;
    updates.completed_at = new Date().toISOString();
  }

  const { error } = await db.from('jobs').update(updates).eq('id', jobId);
  if (error) throw error;
}

export async function incrementJobAttempts(
  db: SupabaseClient,
  jobId: number
): Promise<void> {
  const { error } = await db.rpc('increment_job_attempts', { job_id: jobId });
  if (error) {
    const { error: err } = await db.rpc('exec', {
      sql: `UPDATE jobs SET attempts = attempts + 1 WHERE id = $1`,
      params: [jobId],
    });
    if (err) throw err;
  }
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export async function insertWeeklyReport(
  db: SupabaseClient,
  data: {
    periodStart: string;
    periodEnd: string;
    summary: Record<string, unknown>;
    bySite: Record<string, unknown>[];
    topBonuses: Record<string, unknown>[];
    status: string;
  }
): Promise<{ id: number }> {
  const { data: row, error } = await db
    .from('weekly_reports')
    .insert({
      report_week_start: data.periodStart,
      report_week_end: data.periodEnd,
      executive_summary: data.summary.executiveSummary as string ?? null,
      report_payload: {
        activeSites: data.summary.activeSites,
        totalCampaigns: data.summary.totalCampaigns,
        newCampaigns: data.summary.newCampaigns,
        expiredCampaigns: data.summary.expiredCampaigns,
        updatedCampaigns: data.summary.updatedCampaigns,
        by_site: data.bySite,
        top_bonuses: data.topBonuses,
      },
      status: data.status,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: row!.id as number };
}

export async function getLatestWeeklyReport(
  db: SupabaseClient
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from('weekly_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data as Record<string, unknown> | null;
}

export async function getWeeklyReportHistory(
  db: SupabaseClient,
  limit = 10
): Promise<Record<string, unknown>[]> {
  const { data, error } = await db
    .from('weekly_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

// ─── Scrape runs ─────────────────────────────────────────────────────────────

export async function insertScrapeRun(
  db: SupabaseClient,
  data: {
    siteId: string;
    status: string;
    startedAt: Date;
    cardsFound: number;
    newCampaigns: number;
    updatedCampaigns: number;
    unchanged: number;
    errors: number | null;
  }
): Promise<{ id: string }> {
  const { data: row, error } = await db
    .from('scrape_runs')
    .insert({
      site_id: data.siteId,
      status: data.status,
      started_at: data.startedAt.toISOString(),
      cards_found: data.cardsFound,
      new_campaigns: data.newCampaigns,
      updated_campaigns: data.updatedCampaigns,
      unchanged: data.unchanged,
      errors: data.errors,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: row!.id as string };
}

export async function updateScrapeRun(
  db: SupabaseClient,
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
  const updates: Record<string, unknown> = {};
  if (data.status !== undefined) updates.status = data.status;
  if (data.completedAt !== undefined) updates.completed_at = data.completedAt.toISOString();
  if (data.cardsFound !== undefined) updates.cards_found = data.cardsFound;
  if (data.newCampaigns !== undefined) updates.new_campaigns = data.newCampaigns;
  if (data.updatedCampaigns !== undefined) updates.updated_campaigns = data.updatedCampaigns;
  if (data.unchanged !== undefined) updates.unchanged = data.unchanged;
  if (data.errors !== undefined) updates.errors = data.errors;

  if (Object.keys(updates).length === 0) return;

  const { error } = await db.from('scrape_runs').update(updates).eq('id', runId);
  if (error) throw error;
}

export async function insertScrapeRunSite(
  db: SupabaseClient,
  data: {
    scrapeRunId: string;
    siteId: string;
    status: string;
    cardsFound: number;
    newCampaigns: number;
    updatedCampaigns: number;
    unchanged: number;
    errors: number | null;
  }
): Promise<{ id: string }> {
  const { data: row, error } = await db
    .from('scrape_run_sites')
    .insert({
      scrape_run_id: data.scrapeRunId,
      site_id: data.siteId,
      status: data.status,
      cards_found: data.cardsFound,
      new_campaigns: data.newCampaigns,
      updated_campaigns: data.updatedCampaigns,
      unchanged: data.unchanged,
      errors: data.errors,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: row!.id as string };
}

export async function updateScrapeRunSite(
  db: SupabaseClient,
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
  const updates: Record<string, unknown> = {};
  if (data.status !== undefined) updates.status = data.status;
  if (data.cardsFound !== undefined) updates.cards_found = data.cardsFound;
  if (data.newCampaigns !== undefined) updates.new_campaigns = data.newCampaigns;
  if (data.updatedCampaigns !== undefined) updates.updated_campaigns = data.updatedCampaigns;
  if (data.unchanged !== undefined) updates.unchanged = data.unchanged;
  if (data.errors !== undefined) updates.errors = data.errors;

  if (Object.keys(updates).length === 0) return;

  const { error } = await db.from('scrape_run_sites').update(updates).eq('id', siteRunId);
  if (error) throw error;
}

// ─── Raw snapshots ───────────────────────────────────────────────────────────

export async function insertRawSnapshot(
  db: SupabaseClient,
  data: {
    campaignId: string;
    siteId: string;
    rawData: Record<string, unknown>;
  }
): Promise<{ id: string }> {
  const { data: row, error } = await db
    .from('raw_campaign_snapshots')
    .insert({
      campaign_id: data.campaignId,
      site_id: data.siteId,
      raw_data: data.rawData,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: row!.id as string };
}

// ─── SSE events ─────────────────────────────────────────────────────────────

export async function publishSseEvent(
  db: SupabaseClient,
  eventType: string,
  channel: string,
  payload: Record<string, unknown>
): Promise<void> {
  const { error } = await db.from('sse_events').insert({
    event_type: eventType,
    event_channel: channel,
    payload,
  });
  if (error) throw error;
}

// ─── Similarity ─────────────────────────────────────────────────────────────

export async function insertCampaignSimilarity(
  db: SupabaseClient,
  data: {
    campaignId: string;
    similarCampaignId: string;
    similarityScore: number;
    matchedFields: string[];
  }
): Promise<{ id: string }> {
  const { data: row, error } = await db
    .from('campaign_similarities')
    .upsert(
      {
        campaign_id: data.campaignId,
        similar_campaign_id: data.similarCampaignId,
        similarity_score: data.similarityScore,
        matched_fields: data.matchedFields,
      },
      { onConflict: 'campaign_id,similar_campaign_id' }
    )
    .select('id')
    .single();
  if (error) throw error;
  return { id: row!.id as string };
}

// ─── Stats / reporting queries ───────────────────────────────────────────────

export async function getCampaignStatusCounts(
  db: SupabaseClient
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from('campaigns')
    .select('status, is_visible_on_last_scrape');
  if (error) throw error;

  const result: Record<string, number> = { visible: 0, hidden: 0, expired: 0, pending: 0 };
  for (const row of data ?? []) {
    const r = row as { status: string; is_visible_on_last_scrape: boolean };
    if (r.is_visible_on_last_scrape) result.visible++;
    else result.hidden++;
    if (r.status === 'expired') result.expired++;
    if (r.status === 'pending') result.pending++;
  }
  return result;
}

export async function getTotalCampaignsInPeriod(
  db: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<{ count: number } | null> {
  const r = await db
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startDate)
    .lte('created_at', endDate) as unknown as { data: unknown[]; count: number | null; error: { message: string } | null };
  if (r.error) throw r.error;
  return { count: r.count ?? 0 };
}

export async function getNewCampaignsInPeriod(
  db: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<{ count: number } | null> {
  const r = await db
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .eq('status_reason', 'created') as unknown as { data: unknown[]; count: number | null; error: { message: string } | null };
  if (r.error) throw r.error;
  return { count: r.count ?? 0 };
}

export async function getExpiredCampaignsInPeriod(
  db: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<{ count: number } | null> {
  const r = await db
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .gte('updated_at', startDate)
    .lte('updated_at', endDate)
    .eq('status', 'expired') as unknown as { data: unknown[]; count: number | null; error: { message: string } | null };
  if (r.error) throw r.error;
  return { count: r.count ?? 0 };
}

export async function getUpdatedCampaignsInPeriod(
  db: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<{ count: number } | null> {
  const r = await db
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .gte('updated_at', startDate)
    .lte('updated_at', endDate)
    .eq('status', 'updated') as unknown as { data: unknown[]; count: number | null; error: { message: string } | null };
  if (r.error) throw r.error;
  return { count: r.count ?? 0 };
}

export async function getActiveSitesInPeriod(
  db: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<{ count: number } | null> {
  const { data, error } = await db
    .from('campaigns')
    .select('site_id')
    .gte('created_at', startDate)
    .lte('created_at', endDate);
  if (error) throw error;
  const unique = new Set(
    (data ?? []).map((r: Record<string, unknown>) => r.site_id as string)
  );
  return { count: unique.size };
}

export async function getCampaignsBySiteInPeriod(
  db: SupabaseClient,
  startDate: string,
  endDate: string,
  includeSites?: string[]
): Promise<Record<string, unknown>[]> {
  let q = db
    .from('campaigns')
    .select('*, sites!inner(code)')
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  if (includeSites && includeSites.length > 0) {
    q = q.in('sites.code', includeSites);
  }

  const { data, error } = await q;
  if (error) throw error;

  // Group by site in application code
  const bySite: Record<string, Record<string, number>> = {};
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const code = (r.site_code ?? ((r.sites as Record<string, unknown>)?.code as string)) as string;
    if (!bySite[code]) bySite[code] = { total: 0, new_count: 0, updated_count: 0, expired_count: 0 };
    bySite[code].total++;
    if (r.status_reason === 'created') bySite[code].new_count++;
    if (r.status === 'updated') bySite[code].updated_count++;
    if (r.status === 'expired') bySite[code].expired_count++;
  }

  return Object.entries(bySite).map(([site_code, counts]) => ({ site_code, ...counts }));
}

export async function getTopBonusesInPeriod(
  db: SupabaseClient,
  startDate: string,
  endDate: string,
  limit: number
): Promise<Record<string, unknown>[]> {
  // Supabase PostgREST doesn't support ->> for JSONB extraction easily,
  // so we over-fetch and post-process client-side.
  const { data, error } = await db
    .from('campaigns')
    .select('*, sites!inner(code), campaign_versions(title)')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .limit(limit * 3);
  if (error) throw error;

  return (data ?? [])
    .map((r: Record<string, unknown>) => {
      const meta = (r.metadata as Record<string, unknown>) ?? {};
      return {
        site_code: ((r.sites as Record<string, unknown>)?.code ?? r.site_code) as string,
        title: ((r.campaign_versions as Record<string, unknown>[]) ?? [])[0]?.title as string ?? r.title,
        value_score: meta.valueScore as number ?? 0,
        ai_analysis: meta.ai_analysis as Record<string, unknown>,
      };
    })
    .sort((a, b) => ((b as { value_score: number }).value_score ?? 0) - ((a as { value_score: number }).value_score ?? 0))
    .slice(0, limit);
}

export async function getStaleCampaignsWithoutDates(
  db: SupabaseClient,
  limit: number
): Promise<string[]> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from('campaigns')
    .select('id')
    .is('valid_to', null)
    .neq('status', 'expired')
    .lt('created_at', cutoff)
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => r.id as string);
}

export async function getCampaignForDateExtraction(
  db: SupabaseClient,
  campaignId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from('campaign_versions')
    .select('campaign_id, title, body, source_url')
    .eq('campaign_id', campaignId)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data as Record<string, unknown> | null;
}

export async function getCampaignForRecalc(
  db: SupabaseClient,
  campaignId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from('campaigns')
    .select('*, sites!inner(id, code)')
    .eq('id', campaignId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data as Record<string, unknown> | null;
}

export async function findSimilarCampaigns(
  db: SupabaseClient,
  campaignId: string,
  _category: string | null,
  limit: number
): Promise<Record<string, unknown>[]> {
  const { data, error } = await db
    .from('campaign_similarities')
    .select('*, campaigns(*)')
    .eq('campaign_id', campaignId)
    .order('similarity_score', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

export async function getExpiredCampaignIds(
  db: SupabaseClient
): Promise<string[]> {
  const { data, error } = await db
    .from('campaigns')
    .select('id')
    .eq('status', 'expired');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => r.id as string);
}

export async function getPendingCampaignIds(
  db: SupabaseClient
): Promise<string[]> {
  const { data, error } = await db
    .from('campaigns')
    .select('id')
    .eq('status', 'pending');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => r.id as string);
}

export async function getCampaignIdsBySite(
  db: SupabaseClient,
  siteCode: string,
  batchSize: number
): Promise<string[]> {
  const { data, error } = await db
    .from('campaigns')
    .select('id')
    .eq('sites.code', siteCode)
    .limit(batchSize);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => r.id as string);
}

export async function getAllCampaignIds(
  db: SupabaseClient,
  batchSize: number
): Promise<string[]> {
  const { data, error } = await db
    .from('campaigns')
    .select('id')
    .limit(batchSize);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => r.id as string);
}

export async function getLatestVersionForCampaign(
  db: SupabaseClient,
  campaignId: string
): Promise<Record<string, unknown> | null> {
  return await getLatestVersion(db, campaignId);
}

export async function getCampaignStatus(
  db: SupabaseClient,
  campaignId: string
): Promise<{ status: string } | null> {
  const { data, error } = await db
    .from('campaigns')
    .select('status')
    .eq('id', campaignId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data as { status: string } | null;
}

export async function getWeeklyReportItems(
  _db: SupabaseClient,
  _reportId: string
): Promise<Record<string, unknown>[]> {
  // Implemented via exec RPC if needed; stub for compatibility
  return [];
}

export async function getAiAnalysisStats(
  _db: SupabaseClient,
  _campaignId?: number
): Promise<Record<string, unknown> | null> {
  // Stub — not critical for scraper
  return null;
}

export async function findCampaignByExternalId(
  db: SupabaseClient,
  siteId: string,
  externalId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from('campaigns')
    .select('*')
    .eq('site_id', siteId)
    .eq('external_id', externalId)
    .limit(1)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data as Record<string, unknown> | null;
}

export async function findCampaignByFingerprint(
  db: SupabaseClient,
  siteId: string,
  fingerprint: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from('campaigns')
    .select('*')
    .eq('site_id', siteId)
    .eq('fingerprint', fingerprint)
    .limit(1)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data as Record<string, unknown> | null;
}
