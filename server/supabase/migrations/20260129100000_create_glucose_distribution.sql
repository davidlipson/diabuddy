-- Daily glucose distribution table for storing aggregated statistics
-- by 30-minute intervals throughout the day

CREATE TABLE daily_glucose_distribution (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  interval_index INTEGER NOT NULL, -- 0-47 (48 x 30-min intervals)
  interval_start_minutes INTEGER NOT NULL, -- 0, 30, 60, ..., 1410
  mean DECIMAL(4, 2) NOT NULL,
  std_dev DECIMAL(4, 2) NOT NULL,
  sample_count INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, interval_index)
);

-- Index for efficient lookups by user
CREATE INDEX idx_glucose_distribution_user ON daily_glucose_distribution(user_id);

-- Enable RLS
ALTER TABLE daily_glucose_distribution ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role can manage glucose distribution"
  ON daily_glucose_distribution
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
