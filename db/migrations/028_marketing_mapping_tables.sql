-- 028_marketing_mapping_tables.sql
--
-- Marketing pipeline — Dalga 1 / mapping layer.
--
-- channel_mappings:
--   Excel'deki "GA4_Medium_Grouping" + "Adjust_Medium_Grouping" sheet'lerinin
--   DB karşılığı. Supermetrics'ten gelen ham source key (örn "google / cpc"
--   veya "App Samurai") → canonical kategori (örn "Google Ads") + segment
--   (Paid/Unpaid/Other) eşleştirmesi. Mapping engine her gün bu tabloyu
--   sorgulayarak marketing_metrics_daily.category + segment alanlarını
--   doldurur. PRD §2 Locked Decision #5.
--
-- unmapped_sources:
--   Mapping bulunamayan source key'leri admin queue olarak biriktirir.
--   Pipeline mapping yoksa metrik satırını yine yazar (segment='Other',
--   category='Other') ama bu tabloya da bir kayıt atar ki admin UI'da
--   "yeni unknown source çıktı, mapping ekle" akışı kurulabilsin.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS. Bu dosya sadece şema; seed satırları
-- 033_marketing_seed_channel_mappings.sql içinde (Excel'den otomatik üretildi).

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ---------------------------------------------------------------------------
-- 3) channel_mappings — Excel-driven canonical channel taxonomy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_mappings (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  property_id BIGINT NOT NULL,
  source_system ENUM('ga4','adjust') NOT NULL,
  source_key VARCHAR(255) NOT NULL,         -- "google / cpc", "App Samurai", ...
  segment ENUM('Paid','Unpaid','Other') NOT NULL,
  category VARCHAR(100) NOT NULL,           -- canonical channel: "Google Ads"
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_channel_mapping_key (property_id, source_system, source_key),
  INDEX idx_channel_mapping_lookup (property_id, source_system, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 4) unmapped_sources — admin queue for unknown source keys
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unmapped_sources (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  property_id BIGINT NOT NULL,
  source_system ENUM('ga4','adjust','ads') NOT NULL,
  source_key VARCHAR(255) NOT NULL,
  first_seen DATE NOT NULL,
  last_seen DATE NOT NULL,
  occurrence_count BIGINT NOT NULL DEFAULT 1,
  resolved TINYINT(1) NOT NULL DEFAULT 0,
  resolved_at TIMESTAMP NULL,
  resolved_to_mapping_id BIGINT NULL,
  UNIQUE KEY uq_unmapped_source_key (property_id, source_system, source_key),
  INDEX idx_unmapped_open (property_id, resolved, last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
