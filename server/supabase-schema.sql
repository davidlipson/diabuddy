-- diabuddy Supabase Schema
-- Run this in your Supabase SQL Editor to set up the required tables
-- NOTE: Prefer using `npm run db:push` to apply migrations instead

-- Glucose readings table
-- Only stores value + timestamp. Trend data (trendArrow, isHigh, isLow)
-- is only returned for current reading from live polling, not stored.
CREATE TABLE IF NOT EXISTS glucose_readings (
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
CREATE INDEX IF NOT EXISTS idx_glucose_readings_user_timestamp 
ON glucose_readings(user_id, timestamp DESC);

-- Index for time-range queries
CREATE INDEX IF NOT EXISTS idx_glucose_readings_timestamp 
ON glucose_readings(timestamp DESC);

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

-- Optional: Allow anon/authenticated read access for the frontend
-- Uncomment if your frontend needs to query Supabase directly
-- 
-- CREATE POLICY "Allow read access on glucose_readings"
-- ON glucose_readings FOR SELECT
-- TO anon, authenticated
-- USING (true);
-- 
-- CREATE POLICY "Allow read access on connections"
-- ON connections FOR SELECT
-- TO anon, authenticated
-- USING (true);

-- =============================================================================
-- ACTIVITY TRACKING TABLES
-- =============================================================================

-- Activities base table (stores all activity types)
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('insulin', 'meal', 'exercise')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'predicted')),
  confidence DECIMAL(3, 2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, timestamp, activity_type)
);

-- Insulin details
CREATE TABLE IF NOT EXISTS insulin_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  insulin_type TEXT NOT NULL CHECK (insulin_type IN ('basal', 'bolus')),
  units DECIMAL(5, 2) NOT NULL CHECK (units > 0),
  UNIQUE(activity_id)
);

-- Meal details
-- Description is required (user input), macros are estimated by LLM
CREATE TABLE IF NOT EXISTS meal_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  carbs_grams INTEGER CHECK (carbs_grams IS NULL OR carbs_grams >= 0),
  fiber_grams INTEGER CHECK (fiber_grams IS NULL OR fiber_grams >= 0),
  protein_grams INTEGER CHECK (protein_grams IS NULL OR protein_grams >= 0),
  fat_grams INTEGER CHECK (fat_grams IS NULL OR fat_grams >= 0),
  estimate_confidence TEXT CHECK (estimate_confidence IS NULL OR estimate_confidence IN ('low', 'medium', 'high')),
  UNIQUE(activity_id)
);

-- Exercise details
CREATE TABLE IF NOT EXISTS exercise_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  exercise_type TEXT,
  duration_mins INTEGER CHECK (duration_mins IS NULL OR duration_mins > 0),
  intensity TEXT CHECK (intensity IS NULL OR intensity IN ('low', 'medium', 'high')),
  UNIQUE(activity_id)
);

-- Indexes for activities
CREATE INDEX IF NOT EXISTS idx_activities_user_time 
ON activities(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_activities_type 
ON activities(activity_type);

CREATE INDEX IF NOT EXISTS idx_activities_user_type_time 
ON activities(user_id, activity_type, timestamp DESC);

-- Trigger for updated_at
CREATE TRIGGER update_activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE insulin_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_details ENABLE ROW LEVEL SECURITY;

-- Service role policies
CREATE POLICY "Service role full access on activities"
ON activities FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on insulin_details"
ON insulin_details FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on meal_details"
ON meal_details FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on exercise_details"
ON exercise_details FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
