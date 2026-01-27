-- Extended Fitbit tables for additional health metrics

-- ============================================================================
-- CALORIES INTRADAY (1-minute granularity)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fitbit_calories_intraday (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  calories DECIMAL(8, 4) NOT NULL CHECK (calories >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_fitbit_calories_intraday_user_time 
ON fitbit_calories_intraday(user_id, timestamp DESC);

-- ============================================================================
-- ACTIVE ZONE MINUTES INTRADAY (1-minute granularity)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fitbit_azm_intraday (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  active_zone_minutes INTEGER NOT NULL CHECK (active_zone_minutes >= 0),
  fat_burn_minutes INTEGER NOT NULL DEFAULT 0 CHECK (fat_burn_minutes >= 0),
  cardio_minutes INTEGER NOT NULL DEFAULT 0 CHECK (cardio_minutes >= 0),
  peak_minutes INTEGER NOT NULL DEFAULT 0 CHECK (peak_minutes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_fitbit_azm_intraday_user_time 
ON fitbit_azm_intraday(user_id, timestamp DESC);

-- ============================================================================
-- SPO2 (Oxygen Saturation - daily/overnight)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fitbit_spo2 (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  avg_spo2 DECIMAL(5, 2) NOT NULL CHECK (avg_spo2 >= 0 AND avg_spo2 <= 100),
  min_spo2 DECIMAL(5, 2) NOT NULL CHECK (min_spo2 >= 0 AND min_spo2 <= 100),
  max_spo2 DECIMAL(5, 2) NOT NULL CHECK (max_spo2 >= 0 AND max_spo2 <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, date)
);

CREATE TRIGGER update_fitbit_spo2_updated_at
  BEFORE UPDATE ON fitbit_spo2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SPO2 INTRADAY (5-minute during sleep)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fitbit_spo2_intraday (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  spo2 DECIMAL(5, 2) NOT NULL CHECK (spo2 >= 0 AND spo2 <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_fitbit_spo2_intraday_user_time 
ON fitbit_spo2_intraday(user_id, timestamp DESC);

-- ============================================================================
-- TEMPERATURE (daily/overnight)
-- ============================================================================

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

CREATE TRIGGER update_fitbit_temperature_updated_at
  BEFORE UPDATE ON fitbit_temperature
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- BREATHING RATE (daily/overnight)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fitbit_breathing_rate (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  breathing_rate DECIMAL(5, 2) NOT NULL CHECK (breathing_rate > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, date)
);

CREATE TRIGGER update_fitbit_breathing_rate_updated_at
  BEFORE UPDATE ON fitbit_breathing_rate
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- BREATHING RATE BY SLEEP STAGE (one row per night with columns per stage)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fitbit_breathing_rate_by_stage (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  deep_breathing_rate DECIMAL(5, 2) CHECK (deep_breathing_rate > 0),
  light_breathing_rate DECIMAL(5, 2) CHECK (light_breathing_rate > 0),
  rem_breathing_rate DECIMAL(5, 2) CHECK (rem_breathing_rate > 0),
  full_breathing_rate DECIMAL(5, 2) CHECK (full_breathing_rate > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, date)
);

CREATE TRIGGER update_fitbit_br_by_stage_updated_at
  BEFORE UPDATE ON fitbit_breathing_rate_by_stage
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_fitbit_br_by_stage_user_date 
ON fitbit_breathing_rate_by_stage(user_id, date DESC);

-- ============================================================================
-- DISTANCE INTRADAY (1-minute granularity)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fitbit_distance_intraday (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  distance DECIMAL(8, 4) NOT NULL CHECK (distance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_fitbit_distance_intraday_user_time 
ON fitbit_distance_intraday(user_id, timestamp DESC);

-- ============================================================================
-- HEART RATE ZONES (daily summary - time spent in each zone)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fitbit_heart_rate_zones (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  out_of_range_minutes INTEGER NOT NULL DEFAULT 0 CHECK (out_of_range_minutes >= 0),
  fat_burn_minutes INTEGER NOT NULL DEFAULT 0 CHECK (fat_burn_minutes >= 0),
  cardio_minutes INTEGER NOT NULL DEFAULT 0 CHECK (cardio_minutes >= 0),
  peak_minutes INTEGER NOT NULL DEFAULT 0 CHECK (peak_minutes >= 0),
  out_of_range_calories INTEGER DEFAULT 0,
  fat_burn_calories INTEGER DEFAULT 0,
  cardio_calories INTEGER DEFAULT 0,
  peak_calories INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, date)
);

CREATE TRIGGER update_fitbit_hr_zones_updated_at
  BEFORE UPDATE ON fitbit_heart_rate_zones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE fitbit_calories_intraday ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitbit_azm_intraday ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitbit_spo2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitbit_spo2_intraday ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitbit_temperature ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitbit_breathing_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitbit_breathing_rate_by_stage ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitbit_distance_intraday ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitbit_heart_rate_zones ENABLE ROW LEVEL SECURITY;

-- Service role policies
CREATE POLICY "Service role full access on fitbit_calories_intraday"
ON fitbit_calories_intraday FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on fitbit_azm_intraday"
ON fitbit_azm_intraday FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on fitbit_spo2"
ON fitbit_spo2 FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on fitbit_spo2_intraday"
ON fitbit_spo2_intraday FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on fitbit_temperature"
ON fitbit_temperature FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on fitbit_breathing_rate"
ON fitbit_breathing_rate FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on fitbit_breathing_rate_by_stage"
ON fitbit_breathing_rate_by_stage FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on fitbit_distance_intraday"
ON fitbit_distance_intraday FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on fitbit_heart_rate_zones"
ON fitbit_heart_rate_zones FOR ALL TO service_role USING (true) WITH CHECK (true);
