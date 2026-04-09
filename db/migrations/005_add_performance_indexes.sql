-- Migration 005: Add performance indexes
-- Description: Creates indexes for improved query performance on campaigns and related tables

-- Indexes for campaigns table (common query patterns)
CREATE INDEX IF NOT EXISTS idx_campaigns_valid_dates ON campaigns(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_site_status ON campaigns(site_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_fingerprint ON campaigns(fingerprint);
CREATE INDEX IF NOT EXISTS idx_campaigns_last_seen ON campaigns(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_metadata_ai ON campaigns(metadata) WHERE metadata ? 'ai_analysis';

-- Indexes for campaign_ai_analyses table (only if column exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'campaign_ai_analyses' AND column_name = 'category_code') THEN
        CREATE INDEX IF NOT EXISTS idx_campaign_ai_analyses_category ON campaign_ai_analyses(category_code);
    END IF;
END $$;

-- Indexes for campaign_versions table
CREATE INDEX IF NOT EXISTS idx_campaign_versions_campaign ON campaign_versions(campaign_id, version_no DESC);

-- Indexes for campaign_status_history table (only if column exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'campaign_status_history' AND column_name = 'changed_at') THEN
        CREATE INDEX IF NOT EXISTS idx_campaign_status_history_campaign ON campaign_status_history(campaign_id, changed_at DESC);
    END IF;
END $$;