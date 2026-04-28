-- 027_marketing_config_tables.sql
--
-- Marketing pipeline (Bi'Talih weekly intelligence) — Dalga 1 / config layer.
--
-- Two foundational config tables shared by every downstream marketing job:
--
--   properties — multi-tenant anchor. Every marketing row carries
--     property_id from day one even though the MVP only ships Bi'Talih
--     (id=1). Adding a second property later is then a pure data change.
--
--   fx_rates   — config'lenebilir kur tablosu. Spend kalemleri Supermetrics'ten
--     USD olarak gelebiliyor; Bi'Talih ekibinin kararı USD→TRY için sabit
--     45 oranı kullanmak (PRD §2 Locked Decision #1). Sabit rate'i kod yerine
--     burada tutuyoruz ki ileride değişirse yeni bir effective_from satırı
--     eklemek yeterli olsun (eski snapshot'lar kendi kurunu korur).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS. Seed satırları ayrı migration'larda
-- (032_marketing_seed_properties_fx.sql) — bu dosya sadece şema.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ---------------------------------------------------------------------------
-- 1) properties — multi-tenant anchor
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS properties (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'Europe/Istanbul',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_properties_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 2) fx_rates — currency conversion config
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fx_rates (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  from_currency CHAR(3) NOT NULL,
  to_currency CHAR(3) NOT NULL,
  rate DECIMAL(12,4) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,                   -- NULL = open-ended (current)
  source VARCHAR(50) NOT NULL DEFAULT 'manual',
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fx_pair_from (from_currency, to_currency, effective_from),
  INDEX idx_fx_lookup (from_currency, to_currency, effective_from, effective_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
