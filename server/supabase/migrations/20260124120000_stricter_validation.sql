-- Stricter validation for activity fields
-- carbs_grams must be > 0 if provided

-- Drop existing constraint and add new one
ALTER TABLE meal_details 
DROP CONSTRAINT IF EXISTS meal_details_carbs_grams_check;

ALTER TABLE meal_details
ADD CONSTRAINT meal_details_carbs_grams_check 
CHECK (carbs_grams IS NULL OR carbs_grams > 0);

-- Ensure units is > 0 (should already be the case, but re-add for clarity)
ALTER TABLE insulin_details 
DROP CONSTRAINT IF EXISTS insulin_details_units_check;

ALTER TABLE insulin_details
ADD CONSTRAINT insulin_details_units_check 
CHECK (units > 0);

-- Ensure duration_mins is > 0 if provided
ALTER TABLE exercise_details 
DROP CONSTRAINT IF EXISTS exercise_details_duration_mins_check;

ALTER TABLE exercise_details
ADD CONSTRAINT exercise_details_duration_mins_check 
CHECK (duration_mins IS NULL OR duration_mins > 0);
