-- 020_competitive_stance.sql
--
-- Adds "Atak/Defans" (Aggressive/Neutral/Defensive) stance scoring to the
-- `sites` table. Stance is derived by the scraper's
-- `competitive-stance-calc.ts` job (24h cadence) using:
--
--   last_7d_count   = COUNT(campaigns first_seen_at >= NOW() - 7d)
--   last_4w_avg     = COUNT(campaigns first_seen_at >= NOW() - 28d) / 4
--   velocity_delta  = last_7d_count - last_4w_avg
--
--   AGGRESSIVE  velocity_delta >  +2  (yeni kampanya hız artıyor)
--   DEFENSIVE   velocity_delta <  -2  (yeni kampanya hız azalıyor)
--   NEUTRAL     arası
--   UNKNOWN     henüz hesaplanmadı (default)
--
-- Bonus enflasyonu (avg_bonus son 7g vs son 28g >%20) AGGRESSIVE'i güçlendirir
-- ve `stance_score` ile rapor edilir (-INF..+INF, ham velocity_delta + bonus
-- katsayısı). UI badge'i sadece etiket + delta kullanır.
--
-- Migration uses information_schema gating so it is idempotent / safe to
-- re-run (mirrors the convention used by 018_competitive_intent.sql).

SET NAMES utf8mb4;
SET @schema := DATABASE();

-- ---------------------------------------------------------------------------
-- stance ENUM
-- ---------------------------------------------------------------------------
SET @has_stance := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema
    AND table_name = 'sites'
    AND column_name = 'stance'
);
SET @sql := IF(
  @has_stance = 0,
  "ALTER TABLE sites
     ADD COLUMN stance
       ENUM('aggressive','neutral','defensive','unknown')
       NOT NULL DEFAULT 'unknown'
       AFTER momentum_direction",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- stance_score (DECIMAL 6,2) — ham komposit skor (debug / future ranking)
-- ---------------------------------------------------------------------------
SET @has_score := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema
    AND table_name = 'sites'
    AND column_name = 'stance_score'
);
SET @sql := IF(
  @has_score = 0,
  "ALTER TABLE sites
     ADD COLUMN stance_score DECIMAL(6,2) NULL
       AFTER stance",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- stance_velocity_delta (INT) — last_7d_count - last_4w_avg, yuvarlanmış
-- UI badge'inin gösterdiği "+5 cmp / -3 cmp" değeri.
-- ---------------------------------------------------------------------------
SET @has_delta := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema
    AND table_name = 'sites'
    AND column_name = 'stance_velocity_delta'
);
SET @sql := IF(
  @has_delta = 0,
  "ALTER TABLE sites
     ADD COLUMN stance_velocity_delta INT NOT NULL DEFAULT 0
       AFTER stance_score",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- stance_updated_at — son hesaplama timestamp'i (stale detection için)
-- ---------------------------------------------------------------------------
SET @has_updated := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema
    AND table_name = 'sites'
    AND column_name = 'stance_updated_at'
);
SET @sql := IF(
  @has_updated = 0,
  "ALTER TABLE sites
     ADD COLUMN stance_updated_at TIMESTAMP NULL
       AFTER stance_velocity_delta",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Index for filter queries (?stance=aggressive vb.)
-- ---------------------------------------------------------------------------
SET @has_idx := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema
    AND table_name = 'sites'
    AND index_name = 'idx_sites_stance'
);
SET @sql := IF(
  @has_idx = 0,
  'CREATE INDEX idx_sites_stance ON sites(stance)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
