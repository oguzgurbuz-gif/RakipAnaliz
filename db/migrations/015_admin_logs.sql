-- 015_admin_logs.sql
-- Admin audit log table. Records admin actions (toggles, retries, scrape triggers,
-- AI reindex, status recalculation) with actor, action, resource and JSON change diff.
--
-- NOTE: 014 is reserved for another concurrent slice.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS admin_logs (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  actor VARCHAR(255) NOT NULL,
  action VARCHAR(64) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(36) NULL,
  changes JSON NULL,
  ip VARCHAR(64) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

CREATE INDEX idx_admin_logs_created_at ON admin_logs (created_at);
CREATE INDEX idx_admin_logs_actor_action ON admin_logs (actor, action);
CREATE INDEX idx_admin_logs_resource ON admin_logs (resource_type, resource_id);
