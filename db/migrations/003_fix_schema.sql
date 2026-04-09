-- Migration 003: Fix schema issues
-- 1. Creates jobs table (scraper expects 'jobs' but migration created 'job_queue')
-- 2. Adds site_id column to scrape_runs table
-- 3. Creates proper indexes
-- 4. Creates sse_events table if not exists

-- ============================================================================
-- Create jobs table if it doesn't exist
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

-- ============================================================================
-- Create index for jobs table
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_jobs_pick ON jobs(status, scheduled_at, priority);

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
-- Ensure idx_job_queue_pick index exists for job_queue table
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_job_queue_pick ON job_queue(status, available_at, priority);

-- ============================================================================
-- Create sse_events table if not exists
-- ============================================================================
CREATE TABLE IF NOT EXISTS sse_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    event_channel VARCHAR(255) NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Create index for sse_events
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_sse_events_channel ON sse_events(event_channel, id);
