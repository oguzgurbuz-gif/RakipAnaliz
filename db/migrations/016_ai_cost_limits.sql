-- 016_ai_cost_limits.sql
-- Wave 1 #1.6 — DeepSeek (ve diğer AI) cost circuit breaker.
-- Tek satırlı (id=1) konfigürasyon tablosu: günlük + aylık USD limit ve
-- "limit aşıldığında otomatik duraklatma" toggle'ı. cost-guard helper bu
-- satırı okur, campaign_ai_analyses üzerinden mevcut harcamayı hesaplar ve
-- aşımda AI çağrılarını kısa devre eder.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS ai_cost_limits (
  id INT NOT NULL PRIMARY KEY DEFAULT 1,
  daily_limit_usd DECIMAL(10,2) NOT NULL DEFAULT 5.00,
  monthly_limit_usd DECIMAL(10,2) NOT NULL DEFAULT 100.00,
  pause_on_breach TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT single_row CHECK (id = 1)
) ENGINE=InnoDB;

INSERT IGNORE INTO ai_cost_limits (id, daily_limit_usd, monthly_limit_usd, pause_on_breach)
VALUES (1, 5.00, 100.00, 1);
