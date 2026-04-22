-- 019_press_events.sql
--
-- Press / event calendar overlay for the dashboard.
--
-- Stores Türkiye-spesifik major events (religious holidays, sports finals,
-- national days, commercial peaks) so the campaign calendar can overlay an
-- "external context" layer. The Growth team uses this to:
--   - explain spikes ("rakipler Ramazan'da freebet açtı, biz açmadık")
--   - plan ahead ("önümüzdeki ay GS-FB derbisi var, bonus pipeline'ı hazırla")
--   - YoY karşılaştırma ("geçen Ramazan rakipler ne yaptı?")
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + INSERT IGNORE on a (name, start_date)
-- uniqueness key. Re-running the migration won't duplicate seeds.
--
-- impact_score (1-10): Growth ekibinin "izleme önceliği":
--   10 = ulusal-çapta yüksek etkili (Ramazan, Kurban, Yılbaşı, derbi)
--    7 = yüksek (resmi tatiller, milli takım maçları)
--    5 = orta (Sevgililer Günü, Anneler Günü)
--    3 = düşük (Mevlid Kandili, küçük lig maçları)

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS press_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  event_type ENUM('religious','sports','national','commercial','other') NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  description TEXT,
  country VARCHAR(8) NOT NULL DEFAULT 'TR',
  impact_score TINYINT NOT NULL DEFAULT 5,
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_press_dates (start_date, end_date),
  INDEX idx_press_type (event_type),
  -- Aynı isim+başlangıç tek event olmalı; INSERT IGNORE ile re-run güvenli.
  UNIQUE KEY uq_press_name_start (name, start_date)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Seeds — Türkiye 2025 / 2026 / 2027
-- ---------------------------------------------------------------------------
-- Religious — hicri takvim tahminleri (Diyanet astronomik hesaplama).
-- Tarihler ±1 gün kayabilir; admin UI'dan düzenlenebilir.
INSERT IGNORE INTO press_events
  (name, event_type, start_date, end_date, description, impact_score)
VALUES
  ('Ramazan 2025', 'religious', '2025-03-01', '2025-03-29',
   'Ramazan ayı — iftar saatleri trafiği değişir, gece kullanımı artar.', 10),
  ('Ramazan Bayramı 2025', 'religious', '2025-03-30', '2025-04-01',
   'Ramazan Bayramı — 3 gün resmi tatil, kampanya yoğunluğu yüksek.', 10),
  ('Kurban Bayramı 2025', 'religious', '2025-06-06', '2025-06-09',
   'Kurban Bayramı — 4 gün resmi tatil, ailecek seyahat dönemi.', 9),
  ('Mevlid Kandili 2025', 'religious', '2025-09-04', '2025-09-04',
   'Mevlid Kandili — dini gün, görece düşük ticari etki.', 3),

  ('Ramazan 2026', 'religious', '2026-02-18', '2026-03-19',
   'Ramazan ayı — iftar saatleri trafiği değişir, gece kullanımı artar.', 10),
  ('Ramazan Bayramı 2026', 'religious', '2026-03-20', '2026-03-22',
   'Ramazan Bayramı — 3 gün resmi tatil, kampanya yoğunluğu yüksek.', 10),
  ('Kurban Bayramı 2026', 'religious', '2026-05-26', '2026-05-29',
   'Kurban Bayramı — 4 gün resmi tatil, ailecek seyahat dönemi.', 9),
  ('Mevlid Kandili 2026', 'religious', '2026-08-24', '2026-08-24',
   'Mevlid Kandili — dini gün, görece düşük ticari etki.', 3),

  ('Ramazan 2027', 'religious', '2027-02-08', '2027-03-09',
   'Ramazan ayı — iftar saatleri trafiği değişir, gece kullanımı artar.', 10),
  ('Ramazan Bayramı 2027', 'religious', '2027-03-10', '2027-03-12',
   'Ramazan Bayramı — 3 gün resmi tatil, kampanya yoğunluğu yüksek.', 10),
  ('Kurban Bayramı 2027', 'religious', '2027-05-16', '2027-05-19',
   'Kurban Bayramı — 4 gün resmi tatil, ailecek seyahat dönemi.', 9);

-- Sports — büyük derbiler + Avrupa finalleri.
-- Galatasaray-Fenerbahçe ve Beşiktaş derbi tarihleri 2025-26 sezon takvimine
-- yakın tahminlerdir; resmi takvim yayınlanınca admin UI'dan güncellenmelidir.
INSERT IGNORE INTO press_events
  (name, event_type, start_date, end_date, description, impact_score)
VALUES
  ('Galatasaray - Fenerbahçe Derbi (Güz 2025)', 'sports', '2025-11-02', '2025-11-02',
   'Süper Lig derbisi — bahis hacmi en yüksek tek-maç günlerinden biri.', 10),
  ('Fenerbahçe - Galatasaray Derbi (İlkbahar 2026)', 'sports', '2026-02-22', '2026-02-22',
   'Rövanş derbisi — yine yüksek bahis hacmi.', 10),
  ('Beşiktaş - Galatasaray Derbi 2025', 'sports', '2025-12-21', '2025-12-21',
   'Süper Lig derbisi — yüksek bahis hacmi.', 9),
  ('Beşiktaş - Fenerbahçe Derbi 2026', 'sports', '2026-04-19', '2026-04-19',
   'Süper Lig derbisi — yüksek bahis hacmi.', 9),
  ('Şampiyonlar Ligi Finali 2026', 'sports', '2026-05-30', '2026-05-30',
   'UCL finali — global bahis pic''i, freebet kampanyaları yoğunlaşır.', 10),
  ('UEFA Avrupa Ligi Finali 2026', 'sports', '2026-05-20', '2026-05-20',
   'Avrupa Ligi finali — özellikle Türk takımı varsa hacim fırlar.', 8),
  ('Türkiye A Milli Takım — Euro 2028 Eleme', 'sports', '2026-09-05', '2026-09-08',
   'Milli takım eleme maçları haftası — milli takım bonusları açılır.', 7),
  ('Türkiye A Milli Takım — Euro 2028 Eleme (Ekim)', 'sports', '2026-10-10', '2026-10-13',
   'Milli takım eleme maçları haftası — milli takım bonusları açılır.', 7),
  ('Türkiye Kupası Finali 2026', 'sports', '2026-05-15', '2026-05-15',
   'Türkiye Kupası finali — tek-maç odaklı bonus akını.', 6);

-- National — resmi tatiller + yarı-ticari günler.
INSERT IGNORE INTO press_events
  (name, event_type, start_date, end_date, description, impact_score)
VALUES
  ('Sevgililer Günü 2026', 'national', '2026-02-14', '2026-02-14',
   'Sevgililer Günü — ticari kampanya yoğunluğu, çift-odaklı promosyonlar.', 5),
  ('23 Nisan Ulusal Egemenlik 2026', 'national', '2026-04-23', '2026-04-23',
   'Ulusal Egemenlik ve Çocuk Bayramı — resmi tatil.', 6),
  ('1 Mayıs Emek ve Dayanışma 2026', 'national', '2026-05-01', '2026-05-01',
   'Emek ve Dayanışma Günü — resmi tatil.', 5),
  ('19 Mayıs Atatürk''ü Anma 2026', 'national', '2026-05-19', '2026-05-19',
   'Atatürk''ü Anma, Gençlik ve Spor Bayramı — resmi tatil.', 6),
  ('30 Ağustos Zafer Bayramı 2026', 'national', '2026-08-30', '2026-08-30',
   'Zafer Bayramı — resmi tatil.', 6),
  ('29 Ekim Cumhuriyet Bayramı 2026', 'national', '2026-10-28', '2026-10-29',
   'Cumhuriyet Bayramı — 1.5 gün resmi tatil, "100. yıl" gibi kampanya teması.', 8);

-- Commercial — küresel ve yerel ticari pikler.
INSERT IGNORE INTO press_events
  (name, event_type, start_date, end_date, description, impact_score)
VALUES
  ('Yılbaşı 2025-2026', 'commercial', '2025-12-31', '2026-01-01',
   'Yılbaşı — gece yarısı bahis hacmi, "yeni yıl bonusu" kampanyaları.', 10),
  ('Black Friday 2025', 'commercial', '2025-11-28', '2025-11-30',
   'Black Friday hafta sonu — agresif bonus / freebet yarışı.', 9),
  ('Anneler Günü 2026', 'commercial', '2026-05-10', '2026-05-10',
   'Anneler Günü — yumuşak ticari pik, marka odaklı kampanyalar.', 4),
  ('Babalar Günü 2026', 'commercial', '2026-06-21', '2026-06-21',
   'Babalar Günü — yumuşak ticari pik.', 4),
  ('Black Friday 2026', 'commercial', '2026-11-27', '2026-11-29',
   'Black Friday hafta sonu — agresif bonus / freebet yarışı.', 9),
  ('Yılbaşı 2026-2027', 'commercial', '2026-12-31', '2027-01-01',
   'Yılbaşı — gece yarısı bahis hacmi, "yeni yıl bonusu" kampanyaları.', 10);
