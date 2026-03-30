-- Migration 003: Fix schema issues
-- 1. Creates jobs table (scraper expects 'jobs' but migration created 'job_queue')
-- 2. Adds site_id column to scrape_runs table
-- 3. Creates proper indexes

-- ============================================================================
-- Fix jobs table: ensure payload is JSONB type
-- ============================================================================
ALTER TABLE jobs ALTER COLUMN payload TYPE JSONB USING payload::JSONB;

-- ============================================================================
-- Add site_id column to scrape_runs table (if not exists)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scrape_runs' AND column_name = 'site_id') THEN
        ALTER TABLE scrape_runs ADD COLUMN site_id UUID REFERENCES sites(id);
    END IF;
END $$;

-- Add index on site_id for scrape_runs (if not exists)
CREATE INDEX IF NOT EXISTS idx_scrape_runs_site_id ON scrape_runs(site_id);

-- ============================================================================
-- Ensure idx_jobs_pick index exists for jobs table
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_jobs_pick ON jobs(status, scheduled_at, priority);

-- ============================================================================
-- Ensure idx_job_queue_pick index exists for job_queue table
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_job_queue_pick ON job_queue(status, available_at, priority);
