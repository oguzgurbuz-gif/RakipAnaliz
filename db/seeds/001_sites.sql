-- Seed data for sites table
-- 11 competitor betting sites in Turkish market

INSERT INTO sites (code, name, base_url, campaigns_url, adapter_key, is_active, priority) VALUES
('4nala', '4Nala', 'https://www.4nala.com', 'https://www.4nala.com/kampanyalar', 'adapter_4nala', true, 100),
('altiliganyan', 'Altılı Ganyan', 'https://www.altiliganyan.com', 'https://www.altiliganyan.com/iptal-ve-garanti', 'adapter_altiliganyan', true, 90),
('atyarisi', 'At Yarışı', 'https://www.atyarisi.com', 'https://www.atyarisi.com/kampanyalar', 'adapter_atyarisi', true, 85),
('bilyoner', 'Bilyoner', 'https://www.bilyoner.com', 'https://www.bilyoner.com/bonus-ve-kampanyalar', 'adapter_bilyoner', true, 95),
('birebin', 'Birebin', 'https://www.birebin.com', 'https://www.birebin.com/bonuskampanya', 'adapter_birebin', true, 90),
('ekuri', 'Ekuri', 'https://www.ekuri.com', 'https://www.ekuri.com/kampanyalar', 'adapter_ekuri', true, 80),
('hipodrom', 'Hipodrom', 'https://www.hipodrom.com', 'https://www.hipodrom.com/bonus-ve-kampanyalar', 'adapter_hipodrom', true, 75),
('misli', 'Misli', 'https://www.misli.com', 'https://www.misli.com/bonus-kampanyalari', 'adapter_misli', true, 95),
('nesine', 'Nesine', 'https://www.nesine.com', 'https://www.nesine.com/bonus-kampanyalari', 'adapter_nesine', true, 100),
('oley', 'Oley', 'https://www.oley.com', 'https://www.oley.com/kampanyalar', 'adapter_oley', true, 90),
('sonduzluk', 'SonDüzlük', 'https://www.sonduzluk.com', 'https://www.sonduzluk.com/bonus-ve-kampanyalar', 'adapter_sonduzluk', true, 70);
