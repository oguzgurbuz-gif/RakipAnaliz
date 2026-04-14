-- MySQL 8.0.13+ consolidated schema (migrated from PostgreSQL)
-- Uses CHAR(36) UUID strings and JSON columns.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS sites (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  code VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  base_url TEXT NOT NULL,
  campaigns_url TEXT NULL,
  adapter_key VARCHAR(128) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  priority SMALLINT NOT NULL DEFAULT 100,
  config JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  last_scraped_at TIMESTAMP(6) NULL,
  last_scrape_status VARCHAR(32) NULL,
  last_scrape_error TEXT NULL,
  last_scrape_duration INT NULL,
  campaign_count INT NOT NULL DEFAULT 0,
  last_visibility_check TIMESTAMP(6) NULL,
  UNIQUE KEY uq_sites_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS scrape_runs (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  site_id CHAR(36) NULL,
  run_type VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  trigger_source VARCHAR(32) NOT NULL DEFAULT 'scheduler',
  status VARCHAR(32) NOT NULL DEFAULT 'running',
  started_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  completed_at TIMESTAMP(6) NULL,
  total_sites INT NOT NULL DEFAULT 0,
  completed_sites INT NOT NULL DEFAULT 0,
  failed_sites INT NOT NULL DEFAULT 0,
  inserted_count INT NOT NULL DEFAULT 0,
  updated_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  cards_found INT NOT NULL DEFAULT 0,
  new_campaigns INT NOT NULL DEFAULT 0,
  updated_campaigns INT NOT NULL DEFAULT 0,
  unchanged INT NOT NULL DEFAULT 0,
  errors TEXT NULL,
  metadata JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_scrape_runs_site FOREIGN KEY (site_id) REFERENCES sites (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS scrape_run_sites (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  scrape_run_id CHAR(36) NOT NULL,
  site_id CHAR(36) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'running',
  started_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  completed_at TIMESTAMP(6) NULL,
  raw_count INT NOT NULL DEFAULT 0,
  inserted_count INT NOT NULL DEFAULT 0,
  updated_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  retry_count INT NOT NULL DEFAULT 0,
  error_code VARCHAR(64) NULL,
  error_message TEXT NULL,
  metrics JSON NOT NULL DEFAULT (JSON_OBJECT()),
  cards_found INT NOT NULL DEFAULT 0,
  new_campaigns INT NOT NULL DEFAULT 0,
  updated_campaigns INT NOT NULL DEFAULT 0,
  unchanged INT NOT NULL DEFAULT 0,
  errors TEXT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_srs_run FOREIGN KEY (scrape_run_id) REFERENCES scrape_runs (id) ON DELETE CASCADE,
  CONSTRAINT fk_srs_site FOREIGN KEY (site_id) REFERENCES sites (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS campaigns (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  site_id CHAR(36) NOT NULL,
  external_id VARCHAR(255) NULL,
  source_url TEXT NOT NULL,
  canonical_url TEXT NULL,
  title TEXT NOT NULL,
  body TEXT NULL,
  normalized_text TEXT NOT NULL DEFAULT '',
  fingerprint CHAR(64) NOT NULL,
  content_version INT NOT NULL DEFAULT 1,
  version_no INT NOT NULL DEFAULT 1,
  primary_image_url TEXT NULL,
  valid_from TIMESTAMP(6) NULL,
  valid_to TIMESTAMP(6) NULL,
  valid_from_source VARCHAR(32) NULL,
  valid_to_source VARCHAR(32) NULL,
  valid_from_confidence DECIMAL(5,4) NULL,
  valid_to_confidence DECIMAL(5,4) NULL,
  raw_date_text TEXT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'passive',
  status_reason VARCHAR(64) NULL,
  status_calculated_at TIMESTAMP(6) NULL,
  first_seen_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  last_seen_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  last_visible_at TIMESTAMP(6) NULL,
  removed_from_source_at TIMESTAMP(6) NULL,
  is_visible_on_last_scrape TINYINT(1) NOT NULL DEFAULT 1,
  tags JSON NOT NULL DEFAULT (JSON_ARRAY()),
  metadata JSON NOT NULL DEFAULT (JSON_OBJECT()),
  current_version_id CHAR(36) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_campaigns_site_fingerprint (site_id, fingerprint),
  CONSTRAINT fk_campaigns_site FOREIGN KEY (site_id) REFERENCES sites (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS campaign_images (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  campaign_id CHAR(36) NOT NULL,
  image_url TEXT NOT NULL,
  image_type VARCHAR(32) NOT NULL DEFAULT 'primary',
  display_order INT NOT NULL DEFAULT 0,
  source VARCHAR(32) NOT NULL DEFAULT 'scraper',
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ci_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS raw_campaign_snapshots (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  campaign_id CHAR(36) NULL,
  site_id CHAR(36) NOT NULL,
  raw_data JSON NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_rcs_site FOREIGN KEY (site_id) REFERENCES sites (id),
  CONSTRAINT fk_rcs_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS campaign_versions (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  campaign_id CHAR(36) NOT NULL,
  version_no INT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NULL,
  normalized_text TEXT NOT NULL DEFAULT '',
  fingerprint CHAR(64) NOT NULL,
  primary_image_url TEXT NULL,
  valid_from TIMESTAMP(6) NULL,
  valid_to TIMESTAMP(6) NULL,
  valid_from_source VARCHAR(32) NULL,
  valid_to_source VARCHAR(32) NULL,
  raw_date_text TEXT NULL,
  diff_summary JSON NOT NULL DEFAULT (JSON_OBJECT()),
  snapshot_id CHAR(36) NULL,
  status VARCHAR(32) NULL,
  change_type VARCHAR(32) NULL,
  change_summary TEXT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_cv_campaign_version (campaign_id, version_no),
  CONSTRAINT fk_cv_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
  CONSTRAINT fk_cv_snapshot FOREIGN KEY (snapshot_id) REFERENCES raw_campaign_snapshots (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS campaign_status_history (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  campaign_id CHAR(36) NOT NULL,
  old_status VARCHAR(32) NULL,
  new_status VARCHAR(32) NOT NULL,
  reason TEXT NOT NULL,
  context JSON NOT NULL DEFAULT (JSON_OBJECT()),
  changed_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_csh_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS campaign_ai_analyses (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  campaign_id CHAR(36) NOT NULL,
  campaign_version_id CHAR(36) NULL,
  analysis_type VARCHAR(32) NOT NULL DEFAULT 'content_analysis',
  model_provider VARCHAR(64) NOT NULL,
  model_name VARCHAR(128) NOT NULL,
  prompt_version VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'completed',
  sentiment_label VARCHAR(32) NULL,
  sentiment_score DECIMAL(5,4) NULL,
  category_code VARCHAR(64) NULL,
  category_confidence DECIMAL(5,4) NULL,
  summary_text TEXT NULL,
  key_points JSON NOT NULL DEFAULT (JSON_ARRAY()),
  risk_flags JSON NOT NULL DEFAULT (JSON_ARRAY()),
  recommendation_text TEXT NULL,
  extracted_valid_from TIMESTAMP(6) NULL,
  extracted_valid_to TIMESTAMP(6) NULL,
  extracted_date_confidence DECIMAL(5,4) NULL,
  min_deposit DECIMAL(12,2) NULL,
  max_bonus DECIMAL(12,2) NULL,
  bonus_amount DECIMAL(12,2) NULL,
  bonus_percentage DECIMAL(12,2) NULL,
  free_bet_amount DECIMAL(12,2) NULL,
  cashback_percent DECIMAL(12,2) NULL,
  turnover VARCHAR(255) NULL,
  extracted_details JSON NULL,
  raw_request JSON NULL,
  raw_response JSON NULL,
  tokens_input INT NULL,
  tokens_output INT NULL,
  duration_ms INT NULL,
  confidence DECIMAL(5,4) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_caa_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
  CONSTRAINT fk_caa_version FOREIGN KEY (campaign_version_id) REFERENCES campaign_versions (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS campaign_similarities (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  campaign_id_1 CHAR(36) NOT NULL,
  campaign_id_2 CHAR(36) NOT NULL,
  similarity_score DECIMAL(5,4) NOT NULL,
  comparison_type VARCHAR(50) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_sim_pair (campaign_id_1, campaign_id_2),
  CONSTRAINT fk_sim_c1 FOREIGN KEY (campaign_id_1) REFERENCES campaigns (id) ON DELETE CASCADE,
  CONSTRAINT fk_sim_c2 FOREIGN KEY (campaign_id_2) REFERENCES campaigns (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS campaign_notes (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  campaign_id CHAR(36) NOT NULL,
  author_name VARCHAR(255) NULL,
  note_text TEXT NOT NULL,
  note_type VARCHAR(32) NOT NULL DEFAULT 'general',
  is_pinned TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_notes_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS weekly_reports (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  period_start DATE NULL,
  period_end DATE NULL,
  report_week_start DATE NULL,
  report_week_end DATE NULL,
  title VARCHAR(255) NULL,
  executive_summary TEXT NULL,
  summary TEXT NULL,
  by_site TEXT NULL,
  top_bonuses TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  site_coverage_count INT NOT NULL DEFAULT 0,
  campaign_count INT NOT NULL DEFAULT 0,
  started_count INT NOT NULL DEFAULT 0,
  ended_count INT NOT NULL DEFAULT 0,
  active_overlap_count INT NOT NULL DEFAULT 0,
  changed_count INT NOT NULL DEFAULT 0,
  passive_count INT NOT NULL DEFAULT 0,
  report_payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  generated_at TIMESTAMP(6) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS weekly_report_items (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  weekly_report_id CHAR(36) NOT NULL,
  item_type VARCHAR(64) NOT NULL,
  item_order INT NOT NULL DEFAULT 0,
  title TEXT NULL,
  body TEXT NULL,
  payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_wri_report FOREIGN KEY (weekly_report_id) REFERENCES weekly_reports (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS jobs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  priority INT NOT NULL DEFAULT 0,
  payload JSON NULL,
  scheduled_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  available_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  max_attempts INT NOT NULL DEFAULT 3,
  attempts INT NOT NULL DEFAULT 0,
  started_at TIMESTAMP(6) NULL,
  completed_at TIMESTAMP(6) NULL,
  result TEXT NULL,
  error TEXT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_queue (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  job_type VARCHAR(64) NOT NULL,
  job_key VARCHAR(255) NULL,
  payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  priority INT NOT NULL DEFAULT 100,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  available_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  locked_at TIMESTAMP(6) NULL,
  locked_by VARCHAR(255) NULL,
  last_error_code VARCHAR(64) NULL,
  last_error_message TEXT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sse_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  event_channel VARCHAR(255) NOT NULL,
  payload JSON NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS error_logs (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  error_code VARCHAR(64) NULL,
  error_message TEXT NOT NULL,
  context JSON NOT NULL DEFAULT (JSON_OBJECT()),
  stack_trace TEXT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'error',
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

CREATE INDEX idx_campaigns_site_status ON campaigns (site_id, status);
CREATE INDEX idx_campaigns_valid_from ON campaigns (valid_from);
CREATE INDEX idx_campaigns_valid_to ON campaigns (valid_to);
CREATE INDEX idx_campaigns_first_seen ON campaigns (first_seen_at);
CREATE INDEX idx_campaigns_last_seen ON campaigns (last_seen_at);
CREATE INDEX idx_campaigns_fingerprint ON campaigns (fingerprint);
CREATE INDEX idx_campaign_versions_campaign_created ON campaign_versions (campaign_id, created_at);
CREATE INDEX idx_job_queue_pick ON job_queue (status, available_at, priority);
CREATE INDEX idx_jobs_pick ON jobs (status, scheduled_at, priority);
CREATE INDEX idx_jobs_status_scheduled ON jobs (status, scheduled_at);
CREATE INDEX idx_sse_events_channel ON sse_events (event_channel, id);
CREATE INDEX idx_scrape_runs_status_started ON scrape_runs (status, started_at);
