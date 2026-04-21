-- Persistent storage for scheduled email report subscriptions.
-- Replaces the previous localStorage-only mock used by the dashboard
-- ScheduleForm component so that schedules survive page reloads and
-- can be processed by future server-side delivery jobs.

CREATE TABLE IF NOT EXISTS report_schedules (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  frequency ENUM('weekly', 'monthly') NOT NULL,
  recipients JSON NOT NULL,
  day_of_week INT NULL,
  hour INT NOT NULL DEFAULT 9,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  last_sent_at TIMESTAMP(6) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_report_schedules_enabled (enabled),
  INDEX idx_report_schedules_frequency (frequency)
) ENGINE=InnoDB;
