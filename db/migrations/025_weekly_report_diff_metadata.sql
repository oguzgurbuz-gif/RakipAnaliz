-- BE-11: Weekly report schema validation + diff check
--
-- Adds two JSON columns used by the diff-check pipeline:
--   * `anomaly_flags`   — array of detected anomalies vs. previous week
--                         (e.g. ["campaign_volume_swing", "category_appeared:freebet"]).
--                         Empty array when nothing flagged. UI can show or
--                         ignore; for now consumed only by logs/metadata.
--   * `diff_metadata`   — full structured payload comparing this week's
--                         report against the previous one (totals delta,
--                         category set diff, ai confidence delta, threshold
--                         values used). Stored so we can audit anomalies
--                         after the fact without re-computing.
--
-- Both default to empty JSON ({} / []) so existing rows stay valid and
-- inserts that don't supply the columns continue to work. Re-runnable via
-- information_schema gating (consistent with 013_weekly_report_ai_columns).

SET @schema := DATABASE();

SET @has_anomaly := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema
    AND table_name = 'weekly_reports'
    AND column_name = 'anomaly_flags'
);
SET @sql := IF(
  @has_anomaly = 0,
  'ALTER TABLE weekly_reports ADD COLUMN anomaly_flags JSON NOT NULL DEFAULT (JSON_ARRAY())',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_diff := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema
    AND table_name = 'weekly_reports'
    AND column_name = 'diff_metadata'
);
SET @sql := IF(
  @has_diff = 0,
  'ALTER TABLE weekly_reports ADD COLUMN diff_metadata JSON NOT NULL DEFAULT (JSON_OBJECT())',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
