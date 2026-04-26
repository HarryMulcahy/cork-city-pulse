CREATE UNIQUE INDEX IF NOT EXISTS developments_general_per_city_uidx
ON public.developments (source_ref)
WHERE source = 'general';