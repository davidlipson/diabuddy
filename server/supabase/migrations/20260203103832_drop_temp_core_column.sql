-- Drop temp_core column (Fitbit doesn't provide core temperature data)
ALTER TABLE fitbit_temperature DROP COLUMN IF EXISTS temp_core;
