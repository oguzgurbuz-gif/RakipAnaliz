-- Migration: Calculate momentum scores for all sites
-- This compares campaign counts from last 7 days vs previous 7 days

-- First, update the momentum columns based on campaign activity
UPDATE sites s
SET 
  momentum_last_7_days = (
    SELECT COUNT(*) 
    FROM campaigns c 
    WHERE c.site_id = s.id 
      AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
  ),
  momentum_prev_7_days = (
    SELECT COUNT(*) 
    FROM campaigns c 
    WHERE c.site_id = s.id 
      AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
      AND c.first_seen_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
  ),
  momentum_updated_at = CURRENT_TIMESTAMP(6);

-- Calculate momentum_score and direction
UPDATE sites s
SET 
  momentum_score = CASE 
    WHEN momentum_prev_7_days > 0 THEN 
      ROUND((momentum_last_7_days - momentum_prev_7_days) / momentum_prev_7_days * 100)
    WHEN momentum_last_7_days > 0 THEN 100
    ELSE 0
  END,
  momentum_direction = CASE 
    WHEN momentum_prev_7_days > 0 AND 
         (momentum_last_7_days - momentum_prev_7_days) / momentum_prev_7_days >= 0.20 THEN 'up'
    WHEN momentum_prev_7_days > 0 AND 
         (momentum_last_7_days - momentum_prev_7_days) / momentum_prev_7_days <= -0.20 THEN 'down'
    ELSE 'stable'
  END,
  momentum_updated_at = CURRENT_TIMESTAMP(6);
