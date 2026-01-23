-- Remove trend_arrow, is_high, is_low columns from glucose_readings
-- These values are only needed for the current reading (from live LibreLink data)
-- and don't need to be stored for historical data

ALTER TABLE glucose_readings DROP COLUMN IF EXISTS trend_arrow;
ALTER TABLE glucose_readings DROP COLUMN IF EXISTS is_high;
ALTER TABLE glucose_readings DROP COLUMN IF EXISTS is_low;
