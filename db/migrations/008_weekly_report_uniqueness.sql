-- Enforce one weekly report per period for idempotent generation.
-- Keep the newest row when duplicates already exist.

DELETE wr
FROM weekly_reports wr
JOIN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY period_start, period_end
        ORDER BY generated_at DESC, created_at DESC, id DESC
      ) AS rn
    FROM weekly_reports
    WHERE period_start IS NOT NULL AND period_end IS NOT NULL
  ) ranked
  WHERE ranked.rn > 1
) dupes ON dupes.id = wr.id;

ALTER TABLE weekly_reports
  ADD UNIQUE KEY uq_weekly_reports_period (period_start, period_end);
