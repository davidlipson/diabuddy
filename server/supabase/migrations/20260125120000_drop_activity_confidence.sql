-- Remove confidence column from activities table (was kept initially, now removing)
ALTER TABLE activities DROP COLUMN IF EXISTS confidence;

-- Add estimate_confidence to meal_details for LLM estimation confidence
ALTER TABLE meal_details
ADD COLUMN IF NOT EXISTS estimate_confidence TEXT 
  CHECK (estimate_confidence IS NULL OR estimate_confidence IN ('low', 'medium', 'high'));
