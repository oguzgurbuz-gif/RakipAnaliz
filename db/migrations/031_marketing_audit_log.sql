-- 031_marketing_audit_log.sql
--
-- Marketing pipeline — Dalga 1 / audit trail.
--
-- marketing_audit_log:
--   Pipeline'daki her ana eylem (cron fetch, mapping update, snapshot
--   freeze, manuel düzeltme, AI yorum üretimi) buraya tek satır yazar.
--   Amaç: incident sonrası "neden bu hafta sayıları farklı?" sorusuna
--   cevap. actor: 'cron' veya kullanıcı email'i. action: bilinen sabit
--   set'in elemanı (uygulamada string, DB'de free-form ki yeni eylem
--   eklemek migration istemesin).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS. Bu tablo append-only olduğu için
-- seed verisi yok.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS marketing_audit_log (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  property_id BIGINT NOT NULL,
  actor VARCHAR(100) NULL,                  -- 'cron' / kullanıcı email
  action VARCHAR(50) NOT NULL,              -- 'fetch','map','snapshot','freeze','manual_edit','ai_generate'
  target_table VARCHAR(50) NULL,
  target_id BIGINT NULL,
  details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_property_time (property_id, created_at),
  INDEX idx_audit_action_time (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
