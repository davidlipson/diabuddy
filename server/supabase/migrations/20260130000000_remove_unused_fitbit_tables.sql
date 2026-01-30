-- Remove Fitbit tables that are not useful for BG modeling
-- These are either redundant with other data or have no physiological relationship to glucose

-- Drop tables that have no relationship to blood glucose
DROP TABLE IF EXISTS fitbit_spo2_intraday CASCADE;
DROP TABLE IF EXISTS fitbit_spo2 CASCADE;
DROP TABLE IF EXISTS fitbit_breathing_rate_by_stage CASCADE;
DROP TABLE IF EXISTS fitbit_breathing_rate CASCADE;

-- Drop redundant tables (data can be derived from other sources)
DROP TABLE IF EXISTS fitbit_calories_intraday CASCADE;  -- Derived from HR + activity
DROP TABLE IF EXISTS fitbit_distance_intraday CASCADE;  -- Same info as steps
DROP TABLE IF EXISTS fitbit_azm_intraday CASCADE;       -- Derived from HR zones
DROP TABLE IF EXISTS fitbit_heart_rate_zones CASCADE;   -- Can compute from HR data

-- Drop sleep stages (session summary has stage totals already)
DROP TABLE IF EXISTS fitbit_sleep_stages CASCADE;
