-- AI-generated executive summary fields for weekly reports.
-- `executive_summary` already exists in the legacy schema, so we only
-- ensure it is present alongside the new `risks` and `recommendations`
-- JSON arrays that hold the DeepSeek output.
--
-- Uses information_schema gating so the migration is safe to re-run on
-- databases where the columns may have been introduced manually.

SET @schema := DATABASE();

SET @has_risks := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema
    AND table_name = 'weekly_reports'
    AND column_name = 'risks'
);
SET @sql := IF(
  @has_risks = 0,
  'ALTER TABLE weekly_reports ADD COLUMN risks JSON NOT NULL DEFAULT (JSON_ARRAY())',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_recs := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema
    AND table_name = 'weekly_reports'
    AND column_name = 'recommendations'
);
SET @sql := IF(
  @has_recs = 0,
  'ALTER TABLE weekly_reports ADD COLUMN recommendations JSON NOT NULL DEFAULT (JSON_ARRAY())',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_summary := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema
    AND table_name = 'weekly_reports'
    AND column_name = 'executive_summary'
);
SET @sql := IF(
  @has_summary = 0,
  'ALTER TABLE weekly_reports ADD COLUMN executive_summary TEXT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
