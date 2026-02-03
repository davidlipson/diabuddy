-- Add explanation column to food table for AI nutrition estimate justifications
ALTER TABLE food ADD COLUMN IF NOT EXISTS explanation TEXT;
