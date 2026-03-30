-- Migration 004: Fix database schema issues for bitalih
-- Fixes identified issues:
-- 1. Ensure site_id column exists in scrape_runs
-- 2. Ensure jobs table has proper structure (INTEGER id as code expects)
-- 3. Ensure triggers use proper PostgreSQL syntax (no SQLite IF NOT EXISTS in triggers)

-- ============================================================================
-- 1. Add site_id to scrape_runs if not exists (PostgreSQL DO $$ block)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'scrape_runs' AND column_name = 'site_id') THEN
        ALTER TABLE scrape_runs ADD COLUMN site_id UUID REFERENCES sites(id);
    END IF;
END $$;

-- ============================================================================
-- 2. Create jobs table if not exists
-- Note: Code expects INTEGER id (see scheduler.ts JobRecord interface)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables 
                   WHERE table_name = 'jobs') THEN
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
    END IF;
END $$;

-- ============================================================================
-- 3. Ensure indexes exist for jobs table (PostgreSQL syntax)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_jobs_pick ON jobs(status, scheduled_at, priority);
CREATE INDEX IF NOT EXISTS idx_jobs_status_scheduled ON jobs(status, scheduled_at);

-- ============================================================================
-- 4. Ensure site_id index exists for scrape_runs
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_scrape_runs_site_id ON scrape_runs(site_id);

-- ============================================================================
-- 5. Recreate trigger functions and triggers with proper PostgreSQL syntax
-- Using OR REPLACE for functions and DROP/CREATE for triggers (not SQLite syntax)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist (PostgreSQL syntax, not SQLite)
DROP TRIGGER IF EXISTS update_sites_updated_at ON sites;
DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
DROP TRIGGER IF EXISTS update_job_queue_updated_at ON job_queue;
DROP TRIGGER IF EXISTS update_campaign_notes_updated_at ON campaign_notes;

-- Create triggers (PostgreSQL syntax - no IF NOT EXISTS for triggers)
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
