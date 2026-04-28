-- 032_marketing_seed_properties_fx.sql
--
-- Marketing pipeline — Dalga 1 / config seed.
--
-- 1) properties: id=1 Bi'Talih (Europe/Istanbul). MVP'de tek property.
--    INSERT IGNORE çünkü dev/staging'de manuel oluşturulmuş olabilir
--    (uq_properties_name çakışması bypass edilir).
--
-- 2) fx_rates: USD→TRY 45.0000, effective 2026-04-28 (Locked Decision #1).
--    effective_to NULL = açık uçlu (mevcut). Kur değişirse yeni satır eklenir;
--    mapping engine asOf tarihinde geçerli rate'i seçer.
--
-- Idempotent: INSERT IGNORE her iki blokta da. Migration runner çalıştırılınca
-- duplicate hata vermez.

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- properties seed
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO properties (id, name, timezone)
VALUES (1, 'Bi''Talih', 'Europe/Istanbul');

-- ---------------------------------------------------------------------------
-- fx_rates seed (USD -> TRY 45)
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO fx_rates
  (from_currency, to_currency, rate, effective_from, effective_to, source, notes)
VALUES
  ('USD', 'TRY', 45.0000, '2026-04-28', NULL, 'manual',
   'Bi''Talih ekibi locked decision (PRD 2026-04-28 §2). Spend USD->TRY için sabit 45.');
