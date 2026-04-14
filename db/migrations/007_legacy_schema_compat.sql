-- Migration 007: Legacy schema compatibility for scraper runtime
-- Ensures older initialized databases can run current scraper queries.

-- ============================================================================
-- Sites table compatibility
-- ============================================================================
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_scrape_status VARCHAR(32),
  ADD COLUMN IF NOT EXISTS last_scrape_error TEXT,
  ADD COLUMN IF NOT EXISTS campaign_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================================
-- Campaigns table compatibility
-- ============================================================================
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS version_no INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'content_version'
  ) THEN
    UPDATE campaigns
    SET version_no = COALESCE(version_no, content_version, 1)
    WHERE version_no IS NULL;
  ELSE
    UPDATE campaigns
    SET version_no = COALESCE(version_no, 1)
    WHERE version_no IS NULL;
  END IF;
END $$;

ALTER TABLE campaigns
  ALTER COLUMN version_no SET DEFAULT 1;

UPDATE campaigns
SET version_no = 1
WHERE version_no IS NULL;

ALTER TABLE campaigns
  ALTER COLUMN version_no SET NOT NULL;

-- ============================================================================
-- Scrape runs compatibility
-- ============================================================================
ALTER TABLE scrape_runs
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id),
  ADD COLUMN IF NOT EXISTS cards_found INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_campaigns INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_campaigns INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unchanged INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS errors TEXT;

-- ============================================================================
-- Per-site scrape results compatibility
-- ============================================================================
ALTER TABLE scrape_run_sites
  ADD COLUMN IF NOT EXISTS cards_found INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_campaigns INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_campaigns INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unchanged INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS errors TEXT;

CREATE INDEX IF NOT EXISTS idx_sites_last_scraped_at ON sites(last_scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_runs_site_id ON scrape_runs(site_id);
