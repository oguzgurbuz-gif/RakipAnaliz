-- Initial schema for bitalih campaign aggregation platform
-- Migration 001: Creates all core tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Table: sites
-- Description: All competitor betting sites tracked by the platform
-- ============================================================================
CREATE TABLE sites (
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

-- ============================================================================
-- Table: scrape_runs
-- Description: Tracks overall scraping run execution and statistics
-- ============================================================================
CREATE TABLE scrape_runs (
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

-- ============================================================================
-- Table: scrape_run_sites
-- Description: Per-site scraping results within a run
-- ============================================================================
CREATE TABLE scrape_run_sites (
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

-- ============================================================================
-- Table: raw_campaign_snapshots
-- Description: Raw scraped data for audit trail before normalization
-- ============================================================================
CREATE TABLE raw_campaign_snapshots (
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

-- ============================================================================
-- Table: campaigns
-- Description: MAIN TABLE - Normalized campaign data from all sources
-- ============================================================================
CREATE TABLE campaigns (
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

-- ============================================================================
-- Table: campaign_images
-- Description: Campaign image metadata
-- ============================================================================
CREATE TABLE campaign_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    image_type VARCHAR(32) NOT NULL DEFAULT 'primary',
    display_order INTEGER NOT NULL DEFAULT 0,
    source VARCHAR(32) NOT NULL DEFAULT 'scraper',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Table: campaign_versions
-- Description: Version history for campaign changes
-- ============================================================================
CREATE TABLE campaign_versions (
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

-- ============================================================================
-- Table: campaign_status_history
-- Description: Tracks campaign status changes over time
-- ============================================================================
CREATE TABLE campaign_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    previous_status VARCHAR(16),
    new_status VARCHAR(16) NOT NULL,
    reason VARCHAR(64) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    context JSONB NOT NULL DEFAULT '{}'
);

-- ============================================================================
-- Table: campaign_ai_analyses
-- Description: AI-powered analysis results for campaigns
-- ============================================================================
CREATE TABLE campaign_ai_analyses (
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

-- ============================================================================
-- Table: campaign_similarities
-- Description: Tracks similar campaigns across different sites
-- ============================================================================
CREATE TABLE campaign_similarities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    similar_campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    similarity_score NUMERIC(5,4) NOT NULL,
    similarity_reason TEXT,
    method VARCHAR(32) NOT NULL DEFAULT 'ai+text',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(campaign_id, similar_campaign_id)
);

-- ============================================================================
-- Table: campaign_notes
-- Description: User notes attached to campaigns
-- ============================================================================
CREATE TABLE campaign_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    author_name VARCHAR(255) NOT NULL,
    note_text TEXT NOT NULL,
    note_type VARCHAR(32) NOT NULL DEFAULT 'general',
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Table: weekly_reports
-- Description: Weekly aggregated campaign reports
-- ============================================================================
CREATE TABLE weekly_reports (
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

-- ============================================================================
-- Table: weekly_report_items
-- Description: Individual items within a weekly report
-- ============================================================================
CREATE TABLE weekly_report_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    weekly_report_id UUID NOT NULL REFERENCES weekly_reports(id) ON DELETE CASCADE,
    item_type VARCHAR(64) NOT NULL,
    item_order INTEGER NOT NULL DEFAULT 0,
    title TEXT,
    body TEXT,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Table: job_queue
-- Description: Background job queue for async processing
-- ============================================================================
CREATE TABLE job_queue (
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

-- ============================================================================
-- Table: sse_events
-- Description: Server-Sent Events log for real-time updates
-- ============================================================================
CREATE TABLE sse_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    event_channel VARCHAR(64) NOT NULL DEFAULT 'global',
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Table: error_logs
-- Description: Centralized error tracking
-- ============================================================================
CREATE TABLE error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    error_code VARCHAR(64),
    error_message TEXT NOT NULL,
    context JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_campaigns_site_status ON campaigns(site_id, status);
CREATE INDEX idx_campaigns_valid_from ON campaigns(valid_from);
CREATE INDEX idx_campaigns_valid_to ON campaigns(valid_to);
CREATE INDEX idx_campaigns_first_seen ON campaigns(first_seen_at DESC);
CREATE INDEX idx_campaigns_last_seen ON campaigns(last_seen_at DESC);
CREATE INDEX idx_campaigns_removed_from_source ON campaigns(removed_from_source_at);
CREATE INDEX idx_campaigns_visible_last_scrape ON campaigns(is_visible_on_last_scrape);
CREATE INDEX idx_campaign_versions_campaign_created ON campaign_versions(campaign_id, created_at DESC);
CREATE INDEX idx_campaign_status_history_campaign_changed ON campaign_status_history(campaign_id, changed_at DESC);
CREATE INDEX idx_campaign_ai_analyses_campaign_created ON campaign_ai_analyses(campaign_id, created_at DESC);
CREATE INDEX idx_job_queue_pick ON job_queue(status, available_at, priority);
CREATE INDEX idx_raw_campaign_snapshots_site_extracted ON raw_campaign_snapshots(site_id, extracted_at DESC);

-- ============================================================================
-- UPDATED_AT trigger function
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON sites FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_job_queue_updated_at BEFORE UPDATE ON job_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaign_notes_updated_at BEFORE UPDATE ON campaign_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
