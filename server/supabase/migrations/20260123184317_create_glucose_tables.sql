-- Create glucose_readings table
CREATE TABLE IF NOT EXISTS glucose_readings (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  value_mg_dl INTEGER NOT NULL,
  value_mmol DECIMAL(4, 2) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  trend_arrow INTEGER NOT NULL DEFAULT 3,
  is_high BOOLEAN NOT NULL DEFAULT FALSE,
  is_low BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicate readings
  UNIQUE(user_id, timestamp)
);

-- Index for faster queries by user and timestamp
CREATE INDEX IF NOT EXISTS idx_glucose_readings_user_timestamp 
ON glucose_readings(user_id, timestamp DESC);

-- Index for time-range queries
CREATE INDEX IF NOT EXISTS idx_glucose_readings_timestamp 
ON glucose_readings(timestamp DESC);

-- Create connections table (stores LibreLinkUp connection info)
CREATE TABLE IF NOT EXISTS connections (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  connection_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to auto-update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_connections_updated_at
  BEFORE UPDATE ON connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE glucose_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- Policies for service role access (server uses service key)
CREATE POLICY "Service role full access on glucose_readings"
ON glucose_readings FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on connections"
ON connections FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Optional: Allow anon read access for frontend direct queries (if needed)
-- Uncomment these if your frontend queries Supabase directly
-- 
-- CREATE POLICY "Allow anon read on glucose_readings"
-- ON glucose_readings FOR SELECT
-- TO anon
-- USING (true);
-- 
-- CREATE POLICY "Allow anon read on connections"
-- ON connections FOR SELECT
-- TO anon
-- USING (true);
