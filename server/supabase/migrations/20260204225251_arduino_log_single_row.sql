-- Change arduino_request_log to single-row upsert pattern
-- Drop existing table and recreate with integer id

DROP TABLE IF EXISTS arduino_request_log;

CREATE TABLE arduino_request_log (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  glucose_value DECIMAL(5,1),
  glucose_age_minutes INTEGER,
  success BOOLEAN,
  error_message TEXT
);

-- Insert initial row
INSERT INTO arduino_request_log (id) VALUES (1);
