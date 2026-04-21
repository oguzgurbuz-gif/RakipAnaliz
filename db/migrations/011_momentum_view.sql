-- View for real-time momentum calculation (alternative to storing in sites table)
-- This calculates momentum on-the-fly without needing to update columns

CREATE OR REPLACE VIEW site_momentum_view AS
SELECT 
  s.id,
  s.name,
  s.code,
  (
    SELECT COUNT(*) 
    FROM campaigns c 
    WHERE c.site_id = s.id 
      AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
  ) AS last_7_days,
  (
    SELECT COUNT(*) 
    FROM campaigns c 
    WHERE c.site_id = s.id 
      AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
      AND c.first_seen_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
  ) AS prev_7_days,
  CASE 
    WHEN (
      SELECT COUNT(*) 
      FROM campaigns c 
      WHERE c.site_id = s.id 
        AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
        AND c.first_seen_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
    ) > 0 THEN ROUND(
      (
        (SELECT COUNT(*) FROM campaigns c WHERE c.site_id = s.id AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))
        -
        (SELECT COUNT(*) FROM campaigns c WHERE c.site_id = s.id AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND c.first_seen_at < DATE_SUB(NOW(), INTERVAL 7 DAY))
      ) / 
      (SELECT COUNT(*) FROM campaigns c WHERE c.site_id = s.id AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND c.first_seen_at < DATE_SUB(NOW(), INTERVAL 7 DAY))
      * 100
    )
    WHEN (
      SELECT COUNT(*) 
      FROM campaigns c 
      WHERE c.site_id = s.id 
        AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    ) > 0 THEN 100
    ELSE 0
  END AS momentum_score,
  CASE 
    WHEN (
      SELECT COUNT(*) 
      FROM campaigns c 
      WHERE c.site_id = s.id 
        AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
        AND c.first_seen_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
    ) > 0 
    AND (
      (
        (SELECT COUNT(*) FROM campaigns c WHERE c.site_id = s.id AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))
        -
        (SELECT COUNT(*) FROM campaigns c WHERE c.site_id = s.id AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND c.first_seen_at < DATE_SUB(NOW(), INTERVAL 7 DAY))
      ) / 
      (SELECT COUNT(*) FROM campaigns c WHERE c.site_id = s.id AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND c.first_seen_at < DATE_SUB(NOW(), INTERVAL 7 DAY))
    ) >= 0.20 THEN 'up'
    WHEN (
      SELECT COUNT(*) 
      FROM campaigns c 
      WHERE c.site_id = s.id 
        AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
        AND c.first_seen_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
    ) > 0 
    AND (
      (
        (SELECT COUNT(*) FROM campaigns c WHERE c.site_id = s.id AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))
        -
        (SELECT COUNT(*) FROM campaigns c WHERE c.site_id = s.id AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND c.first_seen_at < DATE_SUB(NOW(), INTERVAL 7 DAY))
      ) / 
      (SELECT COUNT(*) FROM campaigns c WHERE c.site_id = s.id AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND c.first_seen_at < DATE_SUB(NOW(), INTERVAL 7 DAY))
    ) <= -0.20 THEN 'down'
    ELSE 'stable'
  END AS momentum_direction
FROM sites s;
