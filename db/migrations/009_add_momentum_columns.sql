-- Add momentum columns to sites table
-- Momentum is calculated as: (last_7_days_campaigns - previous_7_days_campaigns) / previous_7_days_campaigns * 100
-- +20% and above = 'up', -20% and below = 'down', between = 'stable'

ALTER TABLE sites
ADD COLUMN momentum_score INT NOT NULL DEFAULT 0,
ADD COLUMN momentum_direction ENUM('up', 'down', 'stable') NOT NULL DEFAULT 'stable',
ADD COLUMN momentum_last_7_days INT NOT NULL DEFAULT 0,
ADD COLUMN momentum_prev_7_days INT NOT NULL DEFAULT 0,
ADD COLUMN momentum_updated_at TIMESTAMP(6) NULL DEFAULT CURRENT_TIMESTAMP(6);

-- Index for faster lookups
CREATE INDEX idx_sites_momentum ON sites (momentum_direction);
