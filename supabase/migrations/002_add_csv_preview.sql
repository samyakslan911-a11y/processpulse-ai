-- create_analysis() inserts csv_preview (backend/db/analyses.py), but the column
-- was never defined in 001_init.sql -- every POST /analyze failed with PGRST204.
ALTER TABLE public.process_analyses
    ADD COLUMN IF NOT EXISTS csv_preview TEXT;
