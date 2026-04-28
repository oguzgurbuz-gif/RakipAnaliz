-- 030_marketing_snapshots.sql
--
-- Marketing pipeline — Dalga 1 / snapshot freeze table.
--
-- weekly_snapshots:
--   PRD §2 Locked Decision #7. Her hafta için iki snapshot olabilir:
--     - status='preliminary' (Pzt 06:00 cron sonrası ilk cut)
--     - status='final'       (Çar 06:00 sonrası immutable freeze)
--   matrix_payload JSON: Master_Metric_Table'ın tam karşılığı (TW / LW / 4WA
--   blokları, GA4 ve Adjust ayrı). ai_commentary JSON: Dalga 3'te DeepSeek
--   yorumunu yazar. notification_sent_at: email/in-app push tek-sefer'lik
--   olsun diye. frozen_at: final'a geçtiğinde set.
--
-- UNIQUE (property_id, week_start, status) — aynı hafta için aynı status'tan
-- yalnız bir kayıt; preliminary → final transition için yeni satır eklenir
-- (eski preliminary tarihsel referans olarak korunur).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS weekly_snapshots (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  property_id BIGINT NOT NULL,
  week_start DATE NOT NULL,                 -- haftanın Pazartesi'si
  status ENUM('preliminary','final') NOT NULL,
  matrix_payload JSON NOT NULL,             -- Master_Metric_Table eşleniği
  ai_commentary JSON NULL,                  -- Dalga 3: DeepSeek yorumu
  ai_commentary_generated_at TIMESTAMP NULL,
  notification_sent_at TIMESTAMP NULL,
  frozen_at TIMESTAMP NULL,                 -- final'a geçince set
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_weekly_snapshot_grain (property_id, week_start, status),
  INDEX idx_weekly_snapshot_property_week (property_id, week_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
