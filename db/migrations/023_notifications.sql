-- 023_notifications.sql
--
-- Unified notification center backing the dashboard header bell + the new
-- /notifications page. Other modules (alert-generator, momentum-recalc,
-- campaign-alerts, weekly-report, site bootstrap) write rows here in parallel
-- to their own domain-specific tables so the user has a single inbox without
-- losing the typed history that those tables already provide.
--
-- Sources expected to write here (best-effort, never block the producing job):
--
--   notification_type      | severity            | written by
--   -----------------------+---------------------+--------------------------------
--   smart_alert            | low | medium | high | apps/scraper/.../alert-generator.ts
--   momentum_shift         | medium              | apps/scraper/.../momentum-recalc.ts
--   new_competitor         | low                 | apps/scraper/.../index.ts (boot scan)
--   campaign_end           | medium              | apps/scraper/.../campaign-alerts.ts
--   weekly_report_ready    | low                 | apps/scraper/.../weekly-report.ts
--   system                 | low | medium | high | reserved for future internal use
--
-- The producer is responsible for ensuring idempotency where applicable
-- (e.g. weekly_report_ready uses report_id as source_id; new_competitor uses
-- the site_id; momentum_shift uses site_id + transition kombinasyonu).

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  notification_type VARCHAR(64) NOT NULL,
  severity ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  title VARCHAR(500) NOT NULL,
  message TEXT NULL,
  payload JSON NULL,
  read_at TIMESTAMP(6) NULL,
  archived_at TIMESTAMP(6) NULL,
  source_table VARCHAR(64) NULL,
  source_id VARCHAR(100) NULL,
  link_url VARCHAR(500) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX idx_notif_unread (read_at, created_at),
  INDEX idx_notif_severity (severity, created_at),
  INDEX idx_notif_type (notification_type),
  INDEX idx_notif_archived (archived_at, created_at),
  INDEX idx_notif_source (source_table, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
