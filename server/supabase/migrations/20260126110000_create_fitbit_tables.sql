-- Fitbit Integration Tables
-- Stores health data pulled from Fitbit API

-- ============================================================================
-- FITBIT TOKENS (for OAuth persistence)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fitbit_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_fitbit_tokens_updated_at
  BEFORE UPDATE ON fitbit_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- HEART RATE (1-minute granularity)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fitbit_heart_rate (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  heart_rate INTEGER NOT NULL CHECK (heart_rate > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_fitbit_hr_user_time 
ON fitbit_heart_rate(user_id, timestamp DESC);

-- Resting heart rate (daily)
CREATE TABLE IF NOT EXISTS fitbit_resting_heart_rate (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  resting_heart_rate INTEGER NOT NULL CHECK (resting_heart_rate > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, date)
);

CREATE TRIGGER update_fitbit_rhr_updated_at
  BEFORE UPDATE ON fitbit_resting_heart_rate
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- HRV (Heart Rate Variability)
-- ============================================================================

-- Daily HRV summary
CREATE TABLE IF NOT EXISTS fitbit_hrv_daily (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  daily_rmssd DECIMAL(6, 2) NOT NULL,
  deep_rmssd DECIMAL(6, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, date)
);

CREATE TRIGGER update_fitbit_hrv_daily_updated_at
  BEFORE UPDATE ON fitbit_hrv_daily
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Intraday HRV (5-minute during sleep)
CREATE TABLE IF NOT EXISTS fitbit_hrv_intraday (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  rmssd DECIMAL(6, 2) NOT NULL,
  hf DECIMAL(8, 2),  -- High frequency power
  lf DECIMAL(8, 2),  -- Low frequency power
  coverage DECIMAL(4, 3),  -- Data coverage (0-1)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_fitbit_hrv_intraday_user_time 
ON fitbit_hrv_intraday(user_id, timestamp DESC);

-- ============================================================================
-- SLEEP
-- ============================================================================

-- Sleep sessions
CREATE TABLE IF NOT EXISTS fitbit_sleep_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  date_of_sleep DATE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_ms BIGINT NOT NULL,
  efficiency INTEGER CHECK (efficiency >= 0 AND efficiency <= 100),
  minutes_asleep INTEGER CHECK (minutes_asleep >= 0),
  minutes_awake INTEGER CHECK (minutes_awake >= 0),
  deep_count INTEGER CHECK (deep_count >= 0),
  deep_minutes INTEGER CHECK (deep_minutes >= 0),
  light_count INTEGER CHECK (light_count >= 0),
  light_minutes INTEGER CHECK (light_minutes >= 0),
  rem_count INTEGER CHECK (rem_count >= 0),
  rem_minutes INTEGER CHECK (rem_minutes >= 0),
  wake_count INTEGER CHECK (wake_count >= 0),
  wake_minutes INTEGER CHECK (wake_minutes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, start_time)
);

CREATE TRIGGER update_fitbit_sleep_sessions_updated_at
  BEFORE UPDATE ON fitbit_sleep_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_fitbit_sleep_user_date 
ON fitbit_sleep_sessions(user_id, date_of_sleep DESC);

-- Sleep stages (30-second transitions)
CREATE TABLE IF NOT EXISTS fitbit_sleep_stages (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id BIGINT NOT NULL REFERENCES fitbit_sleep_sessions(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('deep', 'light', 'rem', 'wake')),
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(session_id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_fitbit_sleep_stages_session 
ON fitbit_sleep_stages(session_id, timestamp);

-- ============================================================================
-- ACTIVITY
-- ============================================================================

-- Daily activity summary
CREATE TABLE IF NOT EXISTS fitbit_activity_daily (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  steps INTEGER CHECK (steps >= 0),
  calories_out INTEGER CHECK (calories_out >= 0),
  sedentary_minutes INTEGER CHECK (sedentary_minutes >= 0),
  lightly_active_minutes INTEGER CHECK (lightly_active_minutes >= 0),
  fairly_active_minutes INTEGER CHECK (fairly_active_minutes >= 0),
  very_active_minutes INTEGER CHECK (very_active_minutes >= 0),
  distance DECIMAL(6, 2) CHECK (distance >= 0),
  floors INTEGER CHECK (floors >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, date)
);

CREATE TRIGGER update_fitbit_activity_daily_updated_at
  BEFORE UPDATE ON fitbit_activity_daily
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Steps intraday (1-minute granularity)
CREATE TABLE IF NOT EXISTS fitbit_steps_intraday (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  steps INTEGER NOT NULL CHECK (steps >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_fitbit_steps_intraday_user_time 
ON fitbit_steps_intraday(user_id, timestamp DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE fitbit_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitbit_heart_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitbit_resting_heart_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitbit_hrv_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitbit_hrv_intraday ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitbit_sleep_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitbit_sleep_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitbit_activity_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitbit_steps_intraday ENABLE ROW LEVEL SECURITY;

-- Service role policies
CREATE POLICY "Service role full access on fitbit_tokens"
ON fitbit_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on fitbit_heart_rate"
ON fitbit_heart_rate FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on fitbit_resting_heart_rate"
ON fitbit_resting_heart_rate FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on fitbit_hrv_daily"
ON fitbit_hrv_daily FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on fitbit_hrv_intraday"
ON fitbit_hrv_intraday FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on fitbit_sleep_sessions"
ON fitbit_sleep_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on fitbit_sleep_stages"
ON fitbit_sleep_stages FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on fitbit_activity_daily"
ON fitbit_activity_daily FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on fitbit_steps_intraday"
ON fitbit_steps_intraday FOR ALL TO service_role USING (true) WITH CHECK (true);
