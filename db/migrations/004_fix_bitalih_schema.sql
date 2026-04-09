-- Migration 004: Additional schema fixes for bitalih
-- 1. Add missing columns to jobs table
-- 2. Add missing indexes
-- 3. Recreate trigger functions and triggers with proper PostgreSQL syntax

-- ============================================================================
-- 1. Add missing columns to jobs table if not exists
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'jobs' AND column_name = 'result') THEN
        ALTER TABLE jobs ADD COLUMN result TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'jobs' AND column_name = 'updated_at') THEN
        ALTER TABLE jobs ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- ============================================================================
-- 2. Add site_id to scrape_runs if not exists
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'scrape_runs' AND column_name = 'site_id') THEN
        ALTER TABLE scrape_runs ADD COLUMN site_id UUID REFERENCES sites(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'scrape_runs' AND column_name = 'cards_found') THEN
        ALTER TABLE scrape_runs ADD COLUMN cards_found INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'scrape_runs' AND column_name = 'new_campaigns') THEN
        ALTER TABLE scrape_runs ADD COLUMN new_campaigns INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'scrape_runs' AND column_name = 'updated_campaigns') THEN
        ALTER TABLE scrape_runs ADD COLUMN updated_campaigns INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'scrape_runs' AND column_name = 'unchanged') THEN
        ALTER TABLE scrape_runs ADD COLUMN unchanged INTEGER DEFAULT 0;
    END IF;
END $$;

-- ============================================================================
-- 3. Add columns to scrape_run_sites if not exists
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'scrape_run_sites' AND column_name = 'cards_found') THEN
        ALTER TABLE scrape_run_sites ADD COLUMN cards_found INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'scrape_run_sites' AND column_name = 'new_campaigns') THEN
        ALTER TABLE scrape_run_sites ADD COLUMN new_campaigns INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'scrape_run_sites' AND column_name = 'updated_campaigns') THEN
        ALTER TABLE scrape_run_sites ADD COLUMN updated_campaigns INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'scrape_run_sites' AND column_name = 'unchanged') THEN
        ALTER TABLE scrape_run_sites ADD COLUMN unchanged INTEGER DEFAULT 0;
    END IF;
END $$;

-- ============================================================================
-- 4. Ensure indexes exist for jobs table
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_jobs_pick ON jobs(status, scheduled_at, priority);
CREATE INDEX IF NOT EXISTS idx_jobs_status_scheduled ON jobs(status, scheduled_at);

-- ============================================================================
-- 5. Ensure site_id index exists for scrape_runs
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_scrape_runs_site_id ON scrape_runs(site_id);

-- ============================================================================
-- 6. Recreate trigger functions and triggers with proper PostgreSQL syntax
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_sites_updated_at ON sites;
DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
DROP TRIGGER IF EXISTS update_job_queue_updated_at ON job_queue;
DROP TRIGGER IF EXISTS update_campaign_notes_updated_at ON campaign_notes;

-- Create triggers
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
-- 7. Create recalculate_campaign_status function if not exists
-- ============================================================================
CREATE OR REPLACE FUNCTION recalculate_campaign_status(campaign_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE campaigns SET
        status = CASE
            WHEN is_visible_on_last_scrape = false THEN 'hidden'
            WHEN valid_to IS NOT NULL AND valid_to < NOW() THEN 'expired'
            ELSE 'active'
        END,
        updated_at = NOW()
    WHERE id = campaign_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. Create sites table trigger if not exists
-- ============================================================================
DROP TRIGGER IF EXISTS update_sites_updated_at ON sites;
CREATE TRIGGER update_sites_updated_at
    BEFORE UPDATE ON sites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
