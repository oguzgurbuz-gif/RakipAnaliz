-- Combined init script for Coolify deployment
-- Database schema for RakipAnaliz project

-- Note: PostgreSQL user 'postgres' is created automatically by the Docker image
-- using POSTGRES_PASSWORD environment variable.

-- ============================================================================
-- Enable UUID extension
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Table: sites
-- ============================================================================
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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_scraped_at TIMESTAMP,
    last_scrape_status VARCHAR(32),
    last_scrape_error TEXT,
    last_scrape_duration INTEGER,
    campaign_count INTEGER DEFAULT 0,
    last_visibility_check TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sites_code ON sites(code);
CREATE INDEX IF NOT EXISTS idx_sites_is_active ON sites(is_active);

-- ============================================================================
-- Table: scrape_runs
-- ============================================================================
CREATE TABLE IF NOT EXISTS scrape_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID REFERENCES sites(id),
    status VARCHAR(32) NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    cards_found INTEGER DEFAULT 0,
    new_campaigns INTEGER DEFAULT 0,
    updated_campaigns INTEGER DEFAULT 0,
    unchanged INTEGER DEFAULT 0,
    errors TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrape_runs_status ON scrape_runs(status);
CREATE INDEX IF NOT EXISTS idx_scrape_runs_started_at ON scrape_runs(started_at);

-- ============================================================================
-- Table: scrape_run_sites
-- ============================================================================
CREATE TABLE IF NOT EXISTS scrape_run_sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scrape_run_id UUID NOT NULL REFERENCES scrape_runs(id),
    site_id UUID NOT NULL REFERENCES sites(id),
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    cards_found INTEGER DEFAULT 0,
    new_campaigns INTEGER DEFAULT 0,
    updated_campaigns INTEGER DEFAULT 0,
    errors TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrape_run_sites_run_id ON scrape_run_sites(scrape_run_id);
CREATE INDEX IF NOT EXISTS idx_scrape_run_sites_site_id ON scrape_run_sites(site_id);

-- ============================================================================
-- Table: campaigns
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id),
    external_id VARCHAR(255),
    source_url TEXT NOT NULL,
    canonical_url TEXT,
    title VARCHAR(500) NOT NULL,
    body TEXT,
    normalized_text TEXT,
    fingerprint VARCHAR(64) NOT NULL UNIQUE,
    version_no INTEGER NOT NULL DEFAULT 1,
    primary_image_url TEXT,
    valid_from TIMESTAMPTZ,
    valid_to TIMESTAMPTZ,
    valid_from_source VARCHAR(255),
    valid_to_source VARCHAR(255),
    valid_from_confidence NUMERIC(5,4),
    valid_to_confidence NUMERIC(5,4),
    raw_date_text VARCHAR(500),
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    status_reason TEXT,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    is_visible_on_last_scrape BOOLEAN DEFAULT true,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_visible_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_site_id ON campaigns(site_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_fingerprint ON campaigns(fingerprint);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_valid_from ON campaigns(valid_from);
CREATE INDEX IF NOT EXISTS idx_campaigns_valid_to ON campaigns(valid_to);
CREATE INDEX IF NOT EXISTS idx_campaigns_last_seen_at ON campaigns(last_seen_at);

-- ============================================================================
-- Table: campaign_images
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaign_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    alt_text VARCHAR(255),
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_images_campaign_id ON campaign_images(campaign_id);

-- ============================================================================
-- Table: campaign_versions
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaign_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    version_no INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL,
    body TEXT,
    normalized_text TEXT,
    valid_from TIMESTAMPTZ,
    valid_to TIMESTAMPTZ,
    status VARCHAR(32),
    change_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_versions_campaign_id ON campaign_versions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_versions_version ON campaign_versions(campaign_id, version_no DESC);

-- ============================================================================
-- Table: campaign_status_history
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaign_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    old_status VARCHAR(32),
    new_status VARCHAR(32) NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_status_history_campaign_id ON campaign_status_history(campaign_id);

-- ============================================================================
-- Table: campaign_ai_analyses
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaign_ai_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    analysis_type VARCHAR(50) NOT NULL,
    raw_response JSONB,
    parsed_response JSONB,
    extraction_confidence NUMERIC(5,4),
    processing_time_ms INTEGER,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_ai_analyses_campaign_id ON campaign_ai_analyses(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_ai_analyses_type ON campaign_ai_analyses(analysis_type);

-- ============================================================================
-- Table: campaign_similarities
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaign_similarities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id_1 UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    campaign_id_2 UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    similarity_score NUMERIC(5,4) NOT NULL,
    comparison_type VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(campaign_id_1, campaign_id_2)
);

CREATE INDEX IF NOT EXISTS idx_campaign_similarities_campaign_1 ON campaign_similarities(campaign_id_1);
CREATE INDEX IF NOT EXISTS idx_campaign_similarities_campaign_2 ON campaign_similarities(campaign_id_2);

-- ============================================================================
-- Table: campaign_notes
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaign_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_notes_campaign_id ON campaign_notes(campaign_id);

-- ============================================================================
-- Table: weekly_reports
-- ============================================================================
CREATE TABLE IF NOT EXISTS weekly_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_week_start DATE NOT NULL,
    report_week_end DATE NOT NULL,
    title VARCHAR(255) NOT NULL,
    executive_summary TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    report_payload JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_week ON weekly_reports(report_week_start, report_week_end);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_status ON weekly_reports(status);

-- ============================================================================
-- Table: weekly_report_items
-- ============================================================================
CREATE TABLE IF NOT EXISTS weekly_report_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    weekly_report_id UUID NOT NULL REFERENCES weekly_reports(id) ON DELETE CASCADE,
    item_type VARCHAR(50) NOT NULL,
    item_value JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_report_items_report_id ON weekly_report_items(weekly_report_id);

-- ============================================================================
-- Table: jobs
-- ============================================================================
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 0,
    payload JSONB,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    max_attempts INTEGER NOT NULL DEFAULT 3,
    attempts INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    result TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_pick ON jobs(status, scheduled_at, priority);
CREATE INDEX IF NOT EXISTS idx_jobs_status_scheduled ON jobs(status, scheduled_at);

-- ============================================================================
-- Table: job_queue
-- ============================================================================
CREATE TABLE IF NOT EXISTS job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 0,
    payload JSONB,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    max_attempts INTEGER NOT NULL DEFAULT 3,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_queue_pick ON job_queue(status, available_at, priority);

-- ============================================================================
-- Table: sse_events
-- ============================================================================
CREATE TABLE IF NOT EXISTS sse_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    event_channel VARCHAR(255) NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sse_events_channel ON sse_events(event_channel, id);

-- ============================================================================
-- Table: error_logs
-- ============================================================================
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    error_code VARCHAR(64),
    error_message TEXT NOT NULL,
    context JSONB NOT NULL DEFAULT '{}',
    stack_trace TEXT,
    severity VARCHAR(20) NOT NULL DEFAULT 'error',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_code ON error_logs(error_code);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at);

-- ============================================================================
-- Trigger function for updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Apply updated_at triggers
-- ============================================================================
CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON sites FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_scrape_runs_updated_at BEFORE UPDATE ON scrape_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_job_queue_updated_at BEFORE UPDATE ON job_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Seed sites data
-- ============================================================================
INSERT INTO sites (code, name, base_url, adapter_key, is_active, priority) VALUES
('4nala', '4Nala', 'https://4nala.com', '4nala', true, 100),
('altiliganyan', 'Altılı Ganyan', 'https://www.altiliganyan.com', 'altiliganyan', true, 100),
('atyarisi', 'At Yarışı', 'https://www.atyarisi.com', 'atyarisi', true, 100),
('bilyoner', 'Bilyoner', 'https://www.bilyoner.com', 'bilyoner', true, 100),
('birebin', 'Birebin', 'https://www.birebin.com', 'birebin', true, 100),
('bitalih', 'Bitalih', 'https://www.bitalih.com', 'bitalih', true, 100),
('ekuri', 'Eküri', 'https://www.ekuri.com', 'ekuri', true, 100),
('hipodrom', 'Hipodrom', 'https://www.hipodrom.com', 'hipodrom', true, 100),
('misli', 'Misli', 'https://www.misli.com', 'misli', true, 100),
('nesine', 'Nesine', 'https://www.nesine.com', 'nesine', true, 100),
('oley', 'Oley', 'https://www.oley.com', 'oley', true, 100),
('sonduzluk', 'SonDüzlük', 'https://www.sonduzluk.com', 'sonduzluk', true, 100)
ON CONFLICT (code) DO NOTHING;
