-- 018_competitive_intent.sql
--
-- Replaces sentiment with a Growth-actionable taxonomy on
-- campaign_ai_analyses.
--
-- Background: the existing `sentiment_label` field returns ~100% 'positive'
-- because every scraped campaign is sales copy. That signal is useless for
-- competitive intelligence. This migration introduces `competitive_intent`
-- which classifies *why* the competitor ran the campaign:
--   - acquisition: attract new customers (welcome bonus, first deposit, etc.)
--   - retention:   keep existing customers (cashback, loyalty, weekly reload)
--   - brand:       brand building (sponsorship, raffle, event, visibility)
--   - clearance:   inventory / seasonal (special day, holiday, season-end)
--   - unknown:     could not be classified
--
-- The legacy `sentiment_label` column is preserved for backward compat with
-- old rows + dashboards that may still read it; new pipeline writes will not
-- populate it (set to NULL or 'unknown').
--
-- Uses information_schema gating so the migration is safe to re-run.

SET NAMES utf8mb4;
SET @schema := DATABASE();

-- ---------------------------------------------------------------------------
-- Add competitive_intent column
-- ---------------------------------------------------------------------------
SET @has_intent := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema
    AND table_name = 'campaign_ai_analyses'
    AND column_name = 'competitive_intent'
);
SET @sql := IF(
  @has_intent = 0,
  "ALTER TABLE campaign_ai_analyses
     ADD COLUMN competitive_intent
       ENUM('acquisition','retention','brand','clearance','unknown')
       NOT NULL DEFAULT 'unknown'
       AFTER sentiment_label",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Add competitive_intent_confidence column
-- ---------------------------------------------------------------------------
SET @has_intent_conf := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema
    AND table_name = 'campaign_ai_analyses'
    AND column_name = 'competitive_intent_confidence'
);
SET @sql := IF(
  @has_intent_conf = 0,
  "ALTER TABLE campaign_ai_analyses
     ADD COLUMN competitive_intent_confidence DECIMAL(5,4) NULL
       AFTER competitive_intent",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Index for filter queries (?intent=acquisition etc.)
-- ---------------------------------------------------------------------------
SET @has_idx := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema
    AND table_name = 'campaign_ai_analyses'
    AND index_name = 'idx_caa_competitive_intent'
);
SET @sql := IF(
  @has_idx = 0,
  'CREATE INDEX idx_caa_competitive_intent ON campaign_ai_analyses(competitive_intent)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Reprocess job status table (singleton-style; latest run is what UI shows).
-- Background re-process pipeline writes progress here so admin UI can poll.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competitive_intent_reprocess_runs (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  status ENUM('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
  total_campaigns INT NOT NULL DEFAULT 0,
  processed_count INT NOT NULL DEFAULT 0,
  succeeded_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  acquisition_count INT NOT NULL DEFAULT 0,
  retention_count INT NOT NULL DEFAULT 0,
  brand_count INT NOT NULL DEFAULT 0,
  clearance_count INT NOT NULL DEFAULT 0,
  unknown_count INT NOT NULL DEFAULT 0,
  triggered_by VARCHAR(64) NULL,
  error_message TEXT NULL,
  started_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  completed_at TIMESTAMP(6) NULL
) ENGINE=InnoDB;
