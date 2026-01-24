-- Create activities base table
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('insulin', 'meal', 'exercise')),
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'predicted')),
  confidence DECIMAL(3, 2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate activities at same timestamp
  UNIQUE(user_id, timestamp, activity_type)
);

-- Insulin details table
CREATE TABLE IF NOT EXISTS insulin_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  insulin_type TEXT NOT NULL CHECK (insulin_type IN ('basal', 'bolus')),
  units DECIMAL(5, 2) NOT NULL CHECK (units > 0),
  
  -- One detail record per activity
  UNIQUE(activity_id)
);

-- Meal details table
CREATE TABLE IF NOT EXISTS meal_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  carbs_grams INTEGER CHECK (carbs_grams IS NULL OR carbs_grams >= 0),
  description TEXT,
  
  -- One detail record per activity
  UNIQUE(activity_id)
);

-- Exercise details table
CREATE TABLE IF NOT EXISTS exercise_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  exercise_type TEXT,
  duration_mins INTEGER CHECK (duration_mins IS NULL OR duration_mins > 0),
  intensity TEXT CHECK (intensity IS NULL OR intensity IN ('low', 'medium', 'high')),
  
  -- One detail record per activity
  UNIQUE(activity_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_activities_user_time 
ON activities(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_activities_type 
ON activities(activity_type);

CREATE INDEX IF NOT EXISTS idx_activities_user_type_time 
ON activities(user_id, activity_type, timestamp DESC);

-- Trigger for updated_at on activities
CREATE TRIGGER update_activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE insulin_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_details ENABLE ROW LEVEL SECURITY;

-- Policies for service role access
CREATE POLICY "Service role full access on activities"
ON activities FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on insulin_details"
ON insulin_details FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on meal_details"
ON meal_details FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on exercise_details"
ON exercise_details FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
