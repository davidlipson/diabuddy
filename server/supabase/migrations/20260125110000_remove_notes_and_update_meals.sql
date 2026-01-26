-- Remove notes column from activities table
ALTER TABLE activities DROP COLUMN IF EXISTS notes;

-- Make carbs_grams nullable again (now estimated by LLM, not user input)
ALTER TABLE meal_details
ALTER COLUMN carbs_grams DROP NOT NULL;

-- Update the check constraint to allow 0 or NULL for carbs
ALTER TABLE meal_details DROP CONSTRAINT IF EXISTS meal_details_carbs_grams_check;
ALTER TABLE meal_details ADD CONSTRAINT meal_details_carbs_grams_check 
  CHECK (carbs_grams IS NULL OR carbs_grams >= 0);

-- Add confidence column for LLM estimation confidence
ALTER TABLE meal_details
ADD COLUMN IF NOT EXISTS estimate_confidence TEXT 
  CHECK (estimate_confidence IS NULL OR estimate_confidence IN ('low', 'medium', 'high'));
