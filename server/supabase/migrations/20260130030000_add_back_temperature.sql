-- Add back temperature table for cycle phase detection
-- Temperature is valuable for predicting menstrual cycle phase which affects insulin sensitivity

CREATE TABLE IF NOT EXISTS fitbit_temperature (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  temp_skin DECIMAL(5, 2),  -- Relative to baseline (can be negative)
  temp_core DECIMAL(5, 2),  -- Absolute temperature
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_fitbit_temperature_user_date 
ON fitbit_temperature(user_id, date DESC);

-- Trigger to update updated_at
CREATE TRIGGER update_fitbit_temperature_updated_at
  BEFORE UPDATE ON fitbit_temperature
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE fitbit_temperature ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on fitbit_temperature"
ON fitbit_temperature FOR ALL TO service_role USING (true) WITH CHECK (true);
