-- 021_ranking_snapshots.sql
--
-- Win/Loss Tracker — günlük site sıralaması snapshot'ları.
--
-- Her gün 04:00 UTC'de scraper, 4 metric için tüm site'lerin o günkü
-- ham değerini ve sıralamasını (1 = lider) bu tabloya yazar. Win/Loss
-- Tracker dashboard'u "bu hafta vs geçen hafta" karşılaştırmasını bu
-- snapshot'lardan üretir.
--
-- Metrikler:
--   - campaign_count:     o gün aktif campaign sayısı (status='active' veya
--                         valid_to >= NOW())
--   - avg_bonus:          site için median bonus_amount (effective bonus)
--   - category_diversity: distinct kategori sayısı
--   - momentum:           sites.momentum_score (-100..+inf)
--
-- Aynı (snapshot_date, site_id, metric) tek satır = re-run safe; job
-- INSERT IGNORE pattern kullanır.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS ranking_snapshots (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  site_id CHAR(36) NOT NULL,
  metric ENUM('campaign_count', 'avg_bonus', 'category_diversity', 'momentum') NOT NULL,
  rank_value DECIMAL(12,4) NOT NULL,
  rank_position INT NOT NULL,
  total_sites INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_snapshot (snapshot_date, site_id, metric),
  INDEX idx_snapshot_date (snapshot_date),
  INDEX idx_snapshot_site_metric (site_id, metric, snapshot_date)
) ENGINE=InnoDB;
