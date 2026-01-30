-- Drop HRV intraday - redundant with HRV daily
-- Sleep HRV data is batch-processed anyway, so granularity doesn't add value

DROP TABLE IF EXISTS fitbit_hrv_intraday CASCADE;
