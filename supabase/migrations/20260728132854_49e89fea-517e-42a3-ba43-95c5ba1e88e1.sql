ALTER TABLE public.developments
  ADD COLUMN IF NOT EXISTS height_m numeric,
  ADD COLUMN IF NOT EXISTS floor_count integer,
  ADD COLUMN IF NOT EXISTS architect text,
  ADD COLUMN IF NOT EXISTS developer text,
  ADD COLUMN IF NOT EXISTS completion_year integer;