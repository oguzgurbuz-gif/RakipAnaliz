-- ============================================================================
-- RakipAnaliz - Supabase SQL Editor Setup
-- Run this entire file in Supabase SQL Editor (SQL Editor > New Query)
-- Migration order: 001 → 002 → 003 → 004 → 005 → 006
-- ============================================================================

-- ============================================================================
-- MIGRATION 001: Initial Schema
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- sites
CREATE TABLE IF NOT EXISTS sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    base_url TEXT NOT NULL,
    campaigns_url TEXT,
    adapter_key VARCHAR(128) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    priority SMALLINT NOT NULL DEFAULT 100,
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- scrape_runs
CREATE TABLE IF NOT EXISTS scrape_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_type VARCHAR(32) NOT NULL DEFAULT 'scheduled',
    trigger_source VARCHAR(32) NOT NULL DEFAULT 'scheduler',
    status VARCHAR(32) NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    total_sites INTEGER NOT NULL DEFAULT 0,
    completed_sites INTEGER NOT NULL DEFAULT 0,
    failed_sites INTEGER NOT NULL DEFAULT 0,
    inserted_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'
);

-- scrape_run_sites
CREATE TABLE IF NOT EXISTS scrape_run_sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scrape_run_id UUID NOT NULL REFERENCES scrape_runs(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id),
    status VARCHAR(32) NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    raw_count INTEGER NOT NULL DEFAULT 0,
    inserted_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_code VARCHAR(64),
    error_message TEXT,
    metrics JSONB NOT NULL DEFAULT '{}'
);

-- raw_campaign_snapshots
CREATE TABLE IF NOT EXISTS raw_campaign_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scrape_run_id UUID REFERENCES scrape_runs(id) ON DELETE SET NULL,
    scrape_run_site_id UUID REFERENCES scrape_run_sites(id) ON DELETE SET NULL,
    site_id UUID NOT NULL REFERENCES sites(id),
    source_url TEXT,
    page_url TEXT,
    external_id VARCHAR(255),
    raw_title TEXT,
    raw_body TEXT,
    raw_image_urls JSONB NOT NULL DEFAULT '[]',
    raw_date_text TEXT,
    raw_html TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}',
    raw_hash CHAR(64) NOT NULL,
    extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- campaigns
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id),
    external_id VARCHAR(255),
    source_url TEXT NOT NULL,
    canonical_url TEXT,
    title TEXT NOT NULL,
    body TEXT,
    normalized_text TEXT NOT NULL,
    fingerprint CHAR(64) NOT NULL,
    content_version INTEGER NOT NULL DEFAULT 1,
    primary_image_url TEXT,
    valid_from TIMESTAMPTZ,
    valid_to TIMESTAMPTZ,
    valid_from_source VARCHAR(32),
    valid_to_source VARCHAR(32),
    valid_from_confidence NUMERIC(5,4),
    valid_to_confidence NUMERIC(5,4),
    raw_date_text TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'passive',
    status_reason VARCHAR(64),
    status_calculated_at TIMESTAMPTZ,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_visible_at TIMESTAMPTZ,
    removed_from_source_at TIMESTAMPTZ,
    is_visible_on_last_scrape BOOLEAN NOT NULL DEFAULT true,
    tags TEXT[] NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(site_id, fingerprint)
);

-- campaign_images
CREATE TABLE IF NOT EXISTS campaign_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    image_type VARCHAR(32) NOT NULL DEFAULT 'primary',
    display_order INTEGER NOT NULL DEFAULT 0,
    source VARCHAR(32) NOT NULL DEFAULT 'scraper',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- campaign_versions
CREATE TABLE IF NOT EXISTS campaign_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    version_no INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    normalized_text TEXT NOT NULL,
    fingerprint CHAR(64) NOT NULL,
    primary_image_url TEXT,
    valid_from TIMESTAMPTZ,
    valid_to TIMESTAMPTZ,
    valid_from_source VARCHAR(32),
    valid_to_source VARCHAR(32),
    raw_date_text TEXT,
    diff_summary JSONB NOT NULL DEFAULT '{}',
    snapshot_id UUID REFERENCES raw_campaign_snapshots(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(campaign_id, version_no)
);

-- campaign_status_history
CREATE TABLE IF NOT EXISTS campaign_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    previous_status VARCHAR(16),
    new_status VARCHAR(16) NOT NULL,
    reason VARCHAR(64) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    context JSONB NOT NULL DEFAULT '{}'
);

-- campaign_ai_analyses
CREATE TABLE IF NOT EXISTS campaign_ai_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    campaign_version_id UUID REFERENCES campaign_versions(id) ON DELETE SET NULL,
    analysis_type VARCHAR(32) NOT NULL DEFAULT 'content_analysis',
    model_provider VARCHAR(64) NOT NULL,
    model_name VARCHAR(128) NOT NULL,
    prompt_version VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'completed',
    sentiment_label VARCHAR(32),
    sentiment_score NUMERIC(5,4),
    category_code VARCHAR(64),
    category_confidence NUMERIC(5,4),
    summary_text TEXT,
    key_points JSONB NOT NULL DEFAULT '[]',
    risk_flags JSONB NOT NULL DEFAULT '[]',
    recommendation_text TEXT,
    extracted_valid_from TIMESTAMPTZ,
    extracted_valid_to TIMESTAMPTZ,
    extracted_date_confidence NUMERIC(5,4),
    tokens_input INTEGER,
    tokens_output INTEGER,
    duration_ms INTEGER,
    raw_request JSONB,
    raw_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- campaign_similarities
CREATE TABLE IF NOT EXISTS campaign_similarities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    similar_campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    similarity_score NUMERIC(5,4) NOT NULL,
    similarity_reason TEXT,
    method VARCHAR(32) NOT NULL DEFAULT 'ai+text',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(campaign_id, similar_campaign_id)
);

-- campaign_notes
CREATE TABLE IF NOT EXISTS campaign_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    author_name VARCHAR(255) NOT NULL,
    note_text TEXT NOT NULL,
    note_type VARCHAR(32) NOT NULL DEFAULT 'general',
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- weekly_reports
CREATE TABLE IF NOT EXISTS weekly_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_week_start DATE NOT NULL,
    report_week_end DATE NOT NULL,
    title TEXT NOT NULL,
    executive_summary TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'completed',
    site_coverage_count INTEGER NOT NULL DEFAULT 0,
    campaign_count INTEGER NOT NULL DEFAULT 0,
    started_count INTEGER NOT NULL DEFAULT 0,
    ended_count INTEGER NOT NULL DEFAULT 0,
    active_overlap_count INTEGER NOT NULL DEFAULT 0,
    changed_count INTEGER NOT NULL DEFAULT 0,
    passive_count INTEGER NOT NULL DEFAULT 0,
    report_payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(report_week_start, report_week_end)
);

-- weekly_report_items
CREATE TABLE IF NOT EXISTS weekly_report_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    weekly_report_id UUID NOT NULL REFERENCES weekly_reports(id) ON DELETE CASCADE,
    item_type VARCHAR(64) NOT NULL,
    item_order INTEGER NOT NULL DEFAULT 0,
    title TEXT,
    body TEXT,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- job_queue
CREATE TABLE IF NOT EXISTS job_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type VARCHAR(64) NOT NULL,
    job_key VARCHAR(255),
    payload JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 100,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    locked_by VARCHAR(255),
    last_error_code VARCHAR(64),
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- sse_events
CREATE TABLE IF NOT EXISTS sse_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    event_channel VARCHAR(64) NOT NULL DEFAULT 'global',
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- error_logs
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    error_code VARCHAR(64),
    error_message TEXT NOT NULL,
    context JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes from 001
CREATE INDEX IF NOT EXISTS idx_campaigns_site_status ON campaigns(site_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_valid_from ON campaigns(valid_from);
CREATE INDEX IF NOT EXISTS idx_campaigns_valid_to ON campaigns(valid_to);
CREATE INDEX IF NOT EXISTS idx_campaigns_first_seen ON campaigns(first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_last_seen ON campaigns(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_removed_from_source ON campaigns(removed_from_source_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_visible_last_scrape ON campaigns(is_visible_on_last_scrape);
CREATE INDEX IF NOT EXISTS idx_campaign_versions_campaign_created ON campaign_versions(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_status_history_campaign_changed ON campaign_status_history(campaign_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_ai_analyses_campaign_created ON campaign_ai_analyses(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_queue_pick ON job_queue(status, available_at, priority);
CREATE INDEX IF NOT EXISTS idx_raw_campaign_snapshots_site_extracted ON raw_campaign_snapshots(site_id, extracted_at DESC);

-- ============================================================================
-- MIGRATION 002: Seed Sites
-- ============================================================================

INSERT INTO sites (code, name, base_url, campaigns_url, adapter_key, is_active, priority) VALUES
('4nala', '4Nala', 'https://4nala.com', 'https://4nala.com/kampanyalar', '4nala', true, 100),
('altiliganyan', 'Altılı Ganyan', 'https://altiliganyan.com', 'https://altiliganyan.com/iptal-ve-garanti', 'altiliganyan', true, 90),
('atyarisi', 'At Yarışı', 'https://atyarisi.com', 'https://atyarisi.com/kampanyalar', 'atyarisi', true, 85),
('bitalih', 'Bitalih', 'https://bitalih.com', 'https://bitalih.com/kampanyalar', 'bitalih', true, 95),
('bilyoner', 'Bilyoner', 'https://bilyoner.com', 'https://bilyoner.com/bonus-ve-kampanyalar', 'bilyoner', true, 95),
('birebin', 'Birebin', 'https://birebin.com', 'https://birebin.com/bonuskampanya', 'birebin', true, 90),
('ekuri', 'Eküri', 'https://ekuri.com', 'https://ekuri.com/kampanyalar', 'ekuri', true, 80),
('hipodrom', 'Hipodrom', 'https://hipodrom.com', 'https://hipodrom.com/bonus-ve-kampanyalar', 'hipodrom', true, 75),
('misli', 'Misli', 'https://misli.com', 'https://misli.com/bonus-kampanyalari', 'misli', true, 95),
('nesine', 'Nesine', 'https://nesine.com', 'https://nesine.com/bonus-kampanyalari', 'nesine', true, 100),
('oley', 'Oley', 'https://oley.com', 'https://oley.com/kampanyalar', 'oley', true, 90),
('sonduzluk', 'SonDüzlük', 'https://sonduzluk.com', 'https://sonduzluk.com/kampanyalar', 'sonduzluk', true, 70),
('sundzulyuk', 'SonDüzlük Eski', 'https://sundzulyuk.com', 'https://sundzulyuk.com/bonus-ve-kampanyalar', 'sundzulyuk', true, 60)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- MIGRATION 003: Fix Schema (combined with 004 to ensure correct order)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scrape_runs' AND column_name = 'site_id') THEN
        ALTER TABLE scrape_runs ADD COLUMN site_id UUID REFERENCES sites(id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'jobs') THEN
        CREATE TABLE jobs (
            id SERIAL PRIMARY KEY,
            type VARCHAR(64) NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'pending',
            priority INTEGER NOT NULL DEFAULT 100,
            payload JSONB,
            max_attempts INTEGER NOT NULL DEFAULT 3,
            attempts INTEGER NOT NULL DEFAULT 0,
            scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            result TEXT,
            error TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    ELSE
        ALTER TABLE jobs ALTER COLUMN payload TYPE JSONB USING payload::JSONB;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_scrape_runs_site_id ON scrape_runs(site_id);
CREATE INDEX IF NOT EXISTS idx_jobs_pick ON jobs(status, scheduled_at, priority);
CREATE INDEX IF NOT EXISTS idx_jobs_status_scheduled ON jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_pick ON job_queue(status, available_at, priority);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_sites_updated_at ON sites;
DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
DROP TRIGGER IF EXISTS update_job_queue_updated_at ON job_queue;
DROP TRIGGER IF EXISTS update_campaign_notes_updated_at ON campaign_notes;

CREATE TRIGGER update_sites_updated_at
    BEFORE UPDATE ON sites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_queue_updated_at
    BEFORE UPDATE ON job_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaign_notes_updated_at
    BEFORE UPDATE ON campaign_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION 005: Performance Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_campaigns_valid_dates ON campaigns(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_fingerprint ON campaigns(fingerprint);
CREATE INDEX IF NOT EXISTS idx_campaigns_metadata_ai ON campaigns(metadata) WHERE metadata ? 'ai_analysis';
CREATE INDEX IF NOT EXISTS idx_campaign_ai_analyses_category ON campaign_ai_analyses(category_code);
CREATE INDEX IF NOT EXISTS idx_campaign_versions_campaign ON campaign_versions(campaign_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_status_history_campaign ON campaign_status_history(campaign_id, changed_at DESC);

-- ============================================================================
-- MIGRATION 006: Supabase RPC Functions
-- ============================================================================

-- Raw SQL execution function
CREATE OR REPLACE FUNCTION exec(sql TEXT, params JSONB DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  IF params IS NULL THEN
    EXECUTE sql INTO result;
  ELSE
    EXECUTE sql USING params;
  END IF;
  RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'sql', sql);
END;
$$;

-- Atomic counter helpers
CREATE OR REPLACE FUNCTION increment_version_count(campaign_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE campaigns
  SET version_count = version_count + 1, updated_at = NOW()
  WHERE id = campaign_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_job_attempts(job_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE jobs
  SET attempts = attempts + 1
  WHERE id = job_id;
END;
$$;

-- Campaign status recalculation
CREATE OR REPLACE FUNCTION recalculate_campaign_status(campaign_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record RECORD;
BEGIN
  SELECT cv.valid_from, cv.valid_to, NOW() AS now_ts
  INTO v_record
  FROM campaign_versions cv
  WHERE cv.campaign_id = recalculate_campaign_status.campaign_id
  ORDER BY cv.content_version DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_record.valid_to IS NOT NULL AND v_record.valid_to < v_record.now_ts THEN
    UPDATE campaigns SET status = 'expired', updated_at = NOW()
    WHERE id = campaign_id;
  ELSIF v_record.valid_from IS NOT NULL AND v_record.valid_from > v_record.now_ts THEN
    UPDATE campaigns SET status = 'pending', updated_at = NOW()
    WHERE id = campaign_id;
  ELSE
    UPDATE campaigns SET status = 'active', updated_at = NOW()
    WHERE id = campaign_id;
  END IF;
END;
$$;

-- ============================================================================
-- Done! Verify with:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
-- ============================================================================
