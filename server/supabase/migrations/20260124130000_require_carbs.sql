-- Make carbs_grams required for meals
-- Must be a positive integer (> 0)

-- First, update any existing NULL values to a default (shouldn't exist but just in case)
UPDATE meal_details SET carbs_grams = 1 WHERE carbs_grams IS NULL;

-- Now make the column NOT NULL
ALTER TABLE meal_details
ALTER COLUMN carbs_grams SET NOT NULL;
