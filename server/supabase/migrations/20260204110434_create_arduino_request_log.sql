-- Log table for Arduino glucose requests
CREATE TABLE IF NOT EXISTS arduino_request_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  glucose_value DECIMAL(5,1),
  glucose_age_minutes INTEGER,
  success BOOLEAN,
  error_message TEXT
);

-- Index for querying recent logs
CREATE INDEX IF NOT EXISTS idx_arduino_request_log_timestamp ON arduino_request_log(timestamp DESC);

-- Auto-delete logs older than 7 days (optional cleanup)
-- You can run this periodically: DELETE FROM arduino_request_log WHERE timestamp < NOW() - INTERVAL '7 days';
