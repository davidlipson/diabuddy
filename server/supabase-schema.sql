-- diabuddy Supabase Schema
-- Run this in your Supabase SQL Editor to set up the required tables
-- NOTE: Prefer using `npm run db:push` to apply migrations instead

-- Glucose readings table
-- Only stores value + timestamp. Trend data (trendArrow, isHigh, isLow)
-- is only returned for current reading from live polling, not stored.
CREATE TABLE IF NOT EXISTS glucose (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  value_mg_dl INTEGER NOT NULL,
  value_mmol DECIMAL(4, 2) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicate readings
  UNIQUE(user_id, timestamp)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_glucose_user_timestamp 
ON glucose(user_id, timestamp DESC);

-- Index for time-range queries
CREATE INDEX IF NOT EXISTS idx_glucose_timestamp 
ON glucose(timestamp DESC);

-- Connections table (stores LibreLinkUp connection info)
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

-- Trigger to auto-update updated_at
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
ALTER TABLE glucose ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- Policies for service role access (server uses service key)
CREATE POLICY "Service role full access on glucose"
ON glucose FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on connections"
ON connections FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Optional: Allow anon/authenticated read access for the frontend
-- Uncomment if your frontend needs to query Supabase directly
-- 
-- CREATE POLICY "Allow read access on glucose"
-- ON glucose FOR SELECT
-- TO anon, authenticated
-- USING (true);
-- 
-- CREATE POLICY "Allow read access on connections"
-- ON connections FOR SELECT
-- TO anon, authenticated
-- USING (true);

-- =============================================================================
-- INSULIN & FOOD TABLES (simplified - exercise covered by Fitbit)
-- =============================================================================

-- See migration 20260130020000_simplify_activity_tables.sql for full schema
-- Tables: insulin, food

-- =============================================================================
-- FITBIT INTEGRATION TABLES
-- =============================================================================
-- See migrations for full schema. Tables useful for BG modeling:
-- - fitbit_tokens (OAuth)
-- - fitbit_heart_rate (1-min HR for activity/stress detection)
-- - fitbit_resting_heart_rate (baseline health indicator)
-- - fitbit_hrv_daily, fitbit_hrv_intraday (stress/recovery)
-- - fitbit_sleep_sessions (sleep quality affects insulin sensitivity)
-- - fitbit_activity_daily (overall activity level)
-- - fitbit_steps_intraday (precise activity timing)
