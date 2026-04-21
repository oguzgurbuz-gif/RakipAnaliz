-- 014_campaign_alerts.sql
-- Campaign-end / start alerts table.
-- Driven by the scraper job apps/scraper/src/jobs/campaign-alerts.ts which
-- inserts one row per (campaign_id, alert_type, target_date). The unique
-- constraint allows the job to run safely every 24h with INSERT IGNORE.

CREATE TABLE IF NOT EXISTS campaign_alerts (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  campaign_id CHAR(36) NOT NULL,
  alert_type ENUM('ending_soon', 'ended', 'starting') NOT NULL,
  target_date TIMESTAMP(6) NOT NULL,
  sent_at TIMESTAMP(6) NULL,
  recipient_emails JSON NOT NULL DEFAULT (JSON_ARRAY()),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_campaign_alert (campaign_id, alert_type, target_date),
  KEY idx_campaign_alerts_campaign (campaign_id),
  KEY idx_campaign_alerts_pending (sent_at, target_date),
  CONSTRAINT fk_campaign_alerts_campaign
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE
) ENGINE=InnoDB;
