-- Remove temperature table - illness detection is better served by HR/HRV/sleep data
DROP TABLE IF EXISTS fitbit_temperature CASCADE;
