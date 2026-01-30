-- Simplify activity tracking: remove exercise (Fitbit covers it), 
-- flatten insulin and meals into standalone tables

-- =============================================================================
-- CREATE NEW SIMPLIFIED TABLES
-- =============================================================================

-- Insulin table (standalone)
CREATE TABLE IF NOT EXISTS insulin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  insulin_type TEXT NOT NULL CHECK (insulin_type IN ('basal', 'bolus')),
  units DECIMAL(5, 2) NOT NULL CHECK (units > 0),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'predicted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, timestamp, insulin_type)
);

-- Food table (standalone)
CREATE TABLE IF NOT EXISTS food (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  description TEXT NOT NULL,
  summary VARCHAR(24),
  carbs_grams INTEGER CHECK (carbs_grams IS NULL OR carbs_grams >= 0),
  fiber_grams INTEGER CHECK (fiber_grams IS NULL OR fiber_grams >= 0),
  protein_grams INTEGER CHECK (protein_grams IS NULL OR protein_grams >= 0),
  fat_grams INTEGER CHECK (fat_grams IS NULL OR fat_grams >= 0),
  estimate_confidence TEXT CHECK (estimate_confidence IS NULL OR estimate_confidence IN ('low', 'medium', 'high')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'predicted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, timestamp)
);

-- =============================================================================
-- MIGRATE DATA
-- =============================================================================

-- Migrate insulin data
INSERT INTO insulin (id, user_id, timestamp, insulin_type, units, source, created_at, updated_at)
SELECT 
  d.id,
  a.user_id,
  a.timestamp,
  d.insulin_type,
  d.units,
  a.source,
  a.created_at,
  a.updated_at
FROM insulin_details d
JOIN activities a ON d.activity_id = a.id;

-- Migrate food data
INSERT INTO food (id, user_id, timestamp, description, summary, carbs_grams, fiber_grams, protein_grams, fat_grams, estimate_confidence, source, created_at, updated_at)
SELECT 
  d.id,
  a.user_id,
  a.timestamp,
  d.description,
  d.summary,
  d.carbs_grams,
  d.fiber_grams,
  d.protein_grams,
  d.fat_grams,
  d.estimate_confidence,
  a.source,
  a.created_at,
  a.updated_at
FROM meal_details d
JOIN activities a ON d.activity_id = a.id;

-- =============================================================================
-- DROP OLD TABLES
-- =============================================================================

DROP TABLE IF EXISTS exercise_details CASCADE;
DROP TABLE IF EXISTS insulin_details CASCADE;
DROP TABLE IF EXISTS meal_details CASCADE;
DROP TABLE IF EXISTS activities CASCADE;

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_insulin_user_time ON insulin(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_food_user_time ON food(user_id, timestamp DESC);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER update_insulin_updated_at
  BEFORE UPDATE ON insulin
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_food_updated_at
  BEFORE UPDATE ON food
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE insulin ENABLE ROW LEVEL SECURITY;
ALTER TABLE food ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on insulin"
ON insulin FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on food"
ON food FOR ALL TO service_role USING (true) WITH CHECK (true);
