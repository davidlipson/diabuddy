-- Add fiber, protein, and fat columns to meal_details
-- These are optional since users may not always have this information

ALTER TABLE meal_details
ADD COLUMN fiber_grams INTEGER CHECK (fiber_grams IS NULL OR fiber_grams >= 0),
ADD COLUMN protein_grams INTEGER CHECK (protein_grams IS NULL OR protein_grams >= 0),
ADD COLUMN fat_grams INTEGER CHECK (fat_grams IS NULL OR fat_grams >= 0);

-- Add comment explaining the fields
COMMENT ON COLUMN meal_details.fiber_grams IS 'Fiber in grams (optional). Net carbs = carbs - fiber';
COMMENT ON COLUMN meal_details.protein_grams IS 'Protein in grams (optional). Slows glucose absorption';
COMMENT ON COLUMN meal_details.fat_grams IS 'Fat in grams (optional). Delays glucose response';
