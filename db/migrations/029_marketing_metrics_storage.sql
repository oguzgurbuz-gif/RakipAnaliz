-- 029_marketing_metrics_storage.sql
--
-- Marketing pipeline — Dalga 1 / raw metric storage.
--
-- marketing_metrics_daily:
--   Long-format raw metric storage. Her satır TEK metric × TEK gün × TEK
--   source × (opsiyonel OS) kombinasyonu. Wide format (sessions, users,
--   spend... ayrı sütun) yerine long format seçildi çünkü:
--     - Yeni metric eklemek schema migration gerektirmez
--     - Sparse veri (Adjust'ta install ama GA4'te yok) doğal modellenir
--     - Aggregation query'leri SUM(value) WHERE metric=... ile basittir
--   Mapping engine fetched_at sonrası category + segment'i doldurur. Hâlâ
--   mapping bulunmazsa segment='Other', category='Other' yazılır ve eş
--   zamanlı unmapped_sources'a flag düşer.
--
-- weekly_unique_users:
--   GA4 USER metric'i aditif değil — günlük user'lar üst üste toplanırsa
--   ünikleştirme bozulur. PRD §2 Locked Decision #12: ayrı bir tablo,
--   Supermetrics'in `SM_GA4_Weekly_Users` sheet'inin direkt karşılığı.
--   week_start = haftanın Pazartesi'si.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ---------------------------------------------------------------------------
-- 5) marketing_metrics_daily — long-format raw + mapped daily metrics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketing_metrics_daily (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  property_id BIGINT NOT NULL,
  date DATE NOT NULL,
  source_system ENUM('ga4','adjust','ads','adjust_events') NOT NULL,
  raw_source_key VARCHAR(255) NOT NULL,     -- "google / cpc", "App Samurai", ...
  category VARCHAR(100) NOT NULL,           -- mapped canonical: "Google Ads"
  segment ENUM('Paid','Unpaid','Other') NOT NULL,
  os ENUM('android','ios','web','android-tv','other') NULL,  -- Adjust için OS breakdown
  metric VARCHAR(50) NOT NULL,              -- 'sessions','users','impressions','clicks','spend','signups','purchases','revenue','installs'
  value DECIMAL(18,4) NOT NULL DEFAULT 0,
  currency CHAR(3) NULL,                    -- spend için 'USD' veya 'TRY' (diğer metric'lerde NULL)
  fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_dsid VARCHAR(50) NULL,             -- Supermetrics ds_id (debug)
  raw_payload JSON NULL,                    -- ham yanıt (debug / re-process)
  -- NOT: os NULL'ı UNIQUE KEY'de "ayrı bucket" olarak davranır (MySQL'de NULL != NULL).
  -- GA4 (os=NULL) ile Adjust (os=android/ios) doğal olarak çakışmaz; aynı source/metric/gün
  -- içinde Adjust farklı OS'larda ayrı satır taşır.
  UNIQUE KEY uq_metric_daily_grain (property_id, date, source_system, raw_source_key, metric, os),
  INDEX idx_metric_daily_property_date (property_id, date, source_system),
  INDEX idx_metric_daily_category (property_id, category, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 6) weekly_unique_users — GA4 weekly user counts (özel: günlük toplanamaz)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_unique_users (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  property_id BIGINT NOT NULL,
  week_start DATE NOT NULL,                 -- haftanın Pazartesi'si
  raw_source_key VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  total_users BIGINT NOT NULL DEFAULT 0,
  fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_weekly_users_grain (property_id, week_start, raw_source_key),
  INDEX idx_weekly_users_property_week (property_id, week_start),
  INDEX idx_weekly_users_category (property_id, category, week_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
