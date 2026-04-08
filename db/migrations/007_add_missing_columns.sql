-- Migration 007: Add missing columns identified during Supabase integration
-- Run this AFTER migrations 001-006

-- ============================================================================
-- sites table: scrape tracking columns
-- ============================================================================
ALTER TABLE sites ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMPTZ;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS last_scrape_status VARCHAR(32);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS last_scrape_error TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS last_scrape_duration INTEGER;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS last_scrape_started_at TIMESTAMPTZ;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS campaign_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS scrape_error_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================================
-- campaigns table: current version reference
-- ============================================================================
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS current_version_id UUID REFERENCES campaign_versions(id) ON DELETE SET NULL;

-- ============================================================================
-- scrape_runs table: campaign-level statistics
-- ============================================================================
ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS cards_found INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS new_campaigns INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS updated_campaigns INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS unchanged INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS errors INTEGER NOT NULL DEFAULT 0;

-- ============================================================================
-- scrape_run_sites table: campaign-level statistics
-- ============================================================================
ALTER TABLE scrape_run_sites ADD COLUMN IF NOT EXISTS cards_found INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scrape_run_sites ADD COLUMN IF NOT EXISTS new_campaigns INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scrape_run_sites ADD COLUMN IF NOT EXISTS updated_campaigns INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scrape_run_sites ADD COLUMN IF NOT EXISTS unchanged INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scrape_run_sites ADD COLUMN IF NOT EXISTS errors INTEGER NOT NULL DEFAULT 0;

-- ============================================================================
-- campaign_ai_analyses table: extracted bonus fields
-- ============================================================================
ALTER TABLE campaign_ai_analyses ADD COLUMN IF NOT EXISTS confidence NUMERIC(5,4);
ALTER TABLE campaign_ai_analyses ADD COLUMN IF NOT EXISTS min_deposit NUMERIC;
ALTER TABLE campaign_ai_analyses ADD COLUMN IF NOT EXISTS max_bonus NUMERIC;
ALTER TABLE campaign_ai_analyses ADD COLUMN IF NOT EXISTS bonus_amount NUMERIC;
ALTER TABLE campaign_ai_analyses ADD COLUMN IF NOT EXISTS bonus_percentage NUMERIC;
ALTER TABLE campaign_ai_analyses ADD COLUMN IF NOT EXISTS free_bet_amount NUMERIC;
ALTER TABLE campaign_ai_analyses ADD COLUMN IF NOT EXISTS cashback_percent NUMERIC;
ALTER TABLE campaign_ai_analyses ADD COLUMN IF NOT EXISTS turnover NUMERIC;
ALTER TABLE campaign_ai_analyses ADD COLUMN IF NOT EXISTS extracted_details JSONB NOT NULL DEFAULT '{}';

-- ============================================================================
-- campaign_similarities table: matched fields
-- ============================================================================
ALTER TABLE campaign_similarities ADD COLUMN IF NOT EXISTS matched_fields TEXT[] NOT NULL DEFAULT '{}';

-- ============================================================================
-- campaign_versions table: source_url
-- ============================================================================
ALTER TABLE campaign_versions ADD COLUMN IF NOT EXISTS source_url TEXT;

-- ============================================================================
-- raw_campaign_snapshots: add campaign_id and raw_data for direct insert
-- (the table already has site_id; this enables inserting full snapshot rows)
-- ============================================================================
ALTER TABLE raw_campaign_snapshots ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE raw_campaign_snapshots ADD COLUMN IF NOT EXISTS raw_data JSONB NOT NULL DEFAULT '{}';
