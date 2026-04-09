-- Migration 006: Add performance indexes for search and queries
-- 1. Trigram index for ILIKE search on campaigns.title and campaigns.body
-- 2. Index for jobs status/scheduled_at pickup
-- 3. Index for campaign_versions campaign_id lookup

-- ============================================================================
-- 1. Trigram indexes for search performance (ILIKE with leading wildcard)
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_title_trgm ON campaigns USING gin (title gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_body_trgm ON campaigns USING gin (body gin_trgm_ops);

-- ============================================================================
-- 2. Jobs table index for pickup query
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_jobs_status_scheduled_priority ON jobs(status, scheduled_at, priority DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON jobs(status, available_at) WHERE status = 'pending';

-- ============================================================================
-- 3. Campaign versions index for fast version lookup
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_campaign_versions_campaign_id ON campaign_versions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_versions_created ON campaign_versions(created_at DESC);

-- ============================================================================
-- 4. Scrape run indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_scrape_runs_status_started ON scrape_runs(status, started_at DESC);

-- ============================================================================
-- 5. Campaign status history for fast lookups
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'campaign_status_history' AND column_name = 'changed_at') THEN
        CREATE INDEX IF NOT EXISTS idx_campaign_status_history_campaign_changed ON campaign_status_history(campaign_id, changed_at DESC);
    END IF;
END $$;

-- ============================================================================
-- 6. Campaign images for fast lookups
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_campaign_images_campaign_id ON campaign_images(campaign_id);