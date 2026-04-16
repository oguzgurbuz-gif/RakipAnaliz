-- Seed competitor sites (MySQL)
INSERT INTO sites (code, name, base_url, campaigns_url, adapter_key, is_active, priority) VALUES
('4nala', '4Nala', 'https://4nala.com', 'https://4nala.com/kampanyalar', '4nala', 1, 100),
('altiliganyan', 'Altılı Ganyan', 'https://altiliganyan.com', 'https://altiliganyan.com/iptal-ve-garanti', 'altiliganyan', 1, 90),
('atyarisi', 'At Yarışı', 'https://atyarisi.com', 'https://atyarisi.com/kampanyalar', 'atyarisi', 1, 85),
('bitalih', 'Bitalih', 'https://bitalih.com', 'https://bitalih.com/kampanyalar', 'bitalih', 1, 95),
('bilyoner', 'Bilyoner', 'https://bilyoner.com', 'https://bilyoner.com/bonus-ve-kampanyalar', 'bilyoner', 1, 95),
('birebin', 'Birebin', 'https://birebin.com', 'https://birebin.com/bonuskampanya', 'birebin', 1, 90),
('ekuri', 'Eküri', 'https://ekuri.com', 'https://ekuri.com/kampanyalar', 'ekuri', 1, 80),
('hipodrom', 'Hipodrom', 'https://hipodrom.com', 'https://hipodrom.com/bonus-ve-kampanyalar', 'hipodrom', 1, 75),
('misli', 'Misli', 'https://misli.com', 'https://misli.com/bonus-kampanyalari', 'misli', 1, 95),
('nesine', 'Nesine', 'https://nesine.com', 'https://nesine.com/bonus-kampanyalari', 'nesine', 1, 100),
('oley', 'Oley', 'https://oley.com', 'https://oley.com/kampanyalar', 'oley', 1, 90),
('sonduzluk', 'SonDüzlük', 'https://sonduzluk.com', 'https://sonduzluk.com/kampanyalar', 'sonduzluk', 1, 70),
('sundzulyuk', 'SonDüzlük Eski', 'https://sundzulyuk.com', 'https://sundzulyuk.com/bonus-ve-kampanyalar', 'sonduzluk', 0, 60)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  base_url = VALUES(base_url),
  campaigns_url = VALUES(campaigns_url),
  adapter_key = VALUES(adapter_key),
  is_active = VALUES(is_active),
  priority = VALUES(priority);
