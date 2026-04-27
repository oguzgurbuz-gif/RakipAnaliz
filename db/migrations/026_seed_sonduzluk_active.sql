-- FE-17: Sondüzlük rakip aktivasyon doğrulama (defensive seed).
--
-- Migration 002_seed_sites.sql zaten `sonduzluk` satırını is_active=1 ile
-- ekliyor; ama migration runner'ı sadece henüz çalıştırılmamış dosyaları
-- uyguladığı için (schema_migrations checksum karşılaştırması), elle DB
-- üzerinde sonduzluk satırı kapatılmış / silinmiş bir cluster'da bu satır
-- restore edilmez.
--
-- Bu migration tamamen idempotent: satır yoksa ekler, varsa is_active=1
-- garantisi verir. `priority` (scraper importance) ve `name` doğrulanır.
--
-- Kullanılan sütunlar 001_initial_schema.sql ile uyumlu — `is_priority` bu
-- branch'te yok (main'deki 024_add_is_priority.sql sonraki merge'de gelecek).

INSERT INTO sites (code, name, base_url, campaigns_url, adapter_key, is_active, priority)
VALUES (
  'sonduzluk',
  'SonDüzlük',
  'https://sonduzluk.com',
  'https://sonduzluk.com/kampanyalar',
  'sonduzluk',
  1,
  70
)
ON DUPLICATE KEY UPDATE
  name = 'SonDüzlük',
  base_url = VALUES(base_url),
  campaigns_url = VALUES(campaigns_url),
  adapter_key = 'sonduzluk',
  is_active = 1,
  priority = GREATEST(priority, 70);

-- Eski `sundzulyuk` satırı (sondüzlük'ün eski domain'i) is_active=0
-- kalmalı — adapter registry'de alias olarak tanımlı ama scraper kuyruğuna
-- girmemeli (çift kayıt ve yanlış URL'ye scrape engellemek için).
UPDATE sites
   SET is_active = 0
 WHERE code = 'sundzulyuk';
