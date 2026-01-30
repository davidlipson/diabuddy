-- Drop activity daily table - redundant with steps intraday + HR data
-- Timing of activity matters more than daily totals for BG modeling

DROP TABLE IF EXISTS fitbit_activity_daily CASCADE;
