-- Migration 002: Seed site data
-- Inserts the 13 competitor betting sites

INSERT INTO sites (code, name, base_url, campaigns_url, adapter_key, is_active, priority) VALUES
('4nala', '4Nala', 'https://4nala.com', 'https://4nala.com/kampanyalar', '4nala', true, 100),
('altiliganyan', 'Altılı Ganyan', 'https://altiliganyan.com', 'https://altiliganyan.com/iptal-ve-garanti', 'altiliganyan', true, 90),
('atyarisi', 'At Yarışı', 'https://atyarisi.com', 'https://atyarisi.com/kampanyalar', 'atyarisi', true, 85),
('bitalih', 'Bitalih', 'https://bitalih.com', 'https://bitalih.com/kampanyalar', 'bitalih', true, 95),
('bilyoner', 'Bilyoner', 'https://bilyoner.com', 'https://bilyoner.com/bonus-ve-kampanyalar', 'bilyoner', true, 95),
('birebin', 'Birebin', 'https://birebin.com', 'https://birebin.com/bonuskampanya', 'birebin', true, 90),
('ekuri', 'Eküri', 'https://ekuri.com', 'https://ekuri.com/kampanyalar', 'ekuri', true, 80),
('hipodrom', 'Hipodrom', 'https://hipodrom.com', 'https://hipodrom.com/bonus-ve-kampanyalar', 'hipodrom', true, 75),
('misli', 'Misli', 'https://misli.com', 'https://misli.com/bonus-kampanyalari', 'misli', true, 95),
('nesine', 'Nesine', 'https://nesine.com', 'https://nesine.com/bonus-kampanyalari', 'nesine', true, 100),
('oley', 'Oley', 'https://oley.com', 'https://oley.com/kampanyalar', 'oley', true, 90),
('sonduzluk', 'SonDüzlük', 'https://sonduzluk.com', 'https://sonduzluk.com/kampanyalar', 'sonduzluk', true, 70),
('sundzulyuk', 'SonDüzlük Eski', 'https://sundzulyuk.com', 'https://sundzulyuk.com/bonus-ve-kampanyalar', 'sundzulyuk', true, 60);
