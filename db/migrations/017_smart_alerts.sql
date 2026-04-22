-- 017_smart_alerts.sql
-- Smart change alert system for campaign diff detection.
-- Driven by apps/scraper/src/jobs/alert-generator.ts which inserts rows into
-- smart_alerts when bonus/category/new-campaign/kvkk changes are detected.
-- apps/scraper/src/jobs/slack-pusher.ts then dispatches unpushed alerts to
-- the configured Slack webhook (high severity = near real-time, medium =
-- daily digest, low = weekly digest).
--
-- NOTE: this is intentionally separate from the existing campaign_alerts
-- table (migration 014), which is for campaign end-of-life calendar events.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS smart_alerts (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  alert_type ENUM('bonus_change', 'category_change', 'new_campaign', 'kvkk_change') NOT NULL,
  severity ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  campaign_id CHAR(36) NULL,
  site_id CHAR(36) NULL,
  title VARCHAR(500) NULL,
  description TEXT NULL,
  payload JSON NULL,
  pushed_to_slack TINYINT(1) NOT NULL DEFAULT 0,
  pushed_to_slack_at TIMESTAMP(6) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_alerts_created (created_at DESC),
  KEY idx_alerts_unpushed (pushed_to_slack, severity, created_at),
  KEY idx_alerts_campaign (campaign_id),
  KEY idx_alerts_site (site_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS alert_settings (
  id INT NOT NULL PRIMARY KEY DEFAULT 1,
  slack_webhook_url TEXT NULL,
  bonus_change_threshold_pct DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  digest_time_hour TINYINT NOT NULL DEFAULT 9,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT single_alert_settings_row CHECK (id = 1)
) ENGINE=InnoDB;

INSERT IGNORE INTO alert_settings (id) VALUES (1);
