-- 022_campaign_similarities.sql
--
-- Adds the missing pieces of the `campaign_similarities` schema so the
-- similarity-calc job (apps/scraper/src/jobs/similarity-calc.ts) can store a
-- human-readable `reason`, refresh existing rows in place via `updated_at`,
-- and use the `comparison_type` column as a `similarity_method` flag.
--
-- The base table already exists from migration 001 with columns
--   id, campaign_id_1, campaign_id_2, similarity_score, comparison_type,
--   created_at
-- and a UNIQUE KEY (campaign_id_1, campaign_id_2). To keep backwards
-- compatibility with the dashboard API (which already joins on
-- campaign_id_1/_2 and reads comparison_type), we keep those names instead
-- of renaming to campaign_a_id/_b_id.
--
-- Migration uses information_schema gating so it is idempotent / safe to
-- re-run (mirrors the convention used by 018, 020, 021).

SET NAMES utf8mb4;
SET @schema := DATABASE();

-- ---------------------------------------------------------------------------
-- reason TEXT — human-readable explanation, e.g. "ayni kategori (cashback) +
-- benzer bonus (1500 vs 1400)". Populated by the hybrid similarity job.
-- ---------------------------------------------------------------------------
SET @has_reason := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema
    AND table_name = 'campaign_similarities'
    AND column_name = 'reason'
);
SET @sql := IF(
  @has_reason = 0,
  "ALTER TABLE campaign_similarities
     ADD COLUMN reason TEXT NULL
       AFTER comparison_type",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- updated_at — bumped every time the job re-scores an existing pair so we
-- can detect stale rows for partial re-runs.
-- ---------------------------------------------------------------------------
SET @has_updated := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema
    AND table_name = 'campaign_similarities'
    AND column_name = 'updated_at'
);
SET @sql := IF(
  @has_updated = 0,
  "ALTER TABLE campaign_similarities
     ADD COLUMN updated_at TIMESTAMP(6) NOT NULL
       DEFAULT CURRENT_TIMESTAMP(6)
       ON UPDATE CURRENT_TIMESTAMP(6)
       AFTER created_at",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Hot-path index for the dashboard query:
--   SELECT ... FROM campaign_similarities
--   WHERE campaign_id_1 = ?
--   ORDER BY similarity_score DESC
--   LIMIT 5
-- The existing UNIQUE KEY (campaign_id_1, campaign_id_2) covers the WHERE
-- but not the ORDER BY, so MySQL filesorts. This composite avoids that.
-- ---------------------------------------------------------------------------
SET @has_idx := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema
    AND table_name = 'campaign_similarities'
    AND index_name = 'idx_sim_a_score'
);
SET @sql := IF(
  @has_idx = 0,
  'CREATE INDEX idx_sim_a_score
     ON campaign_similarities (campaign_id_1, similarity_score DESC)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
