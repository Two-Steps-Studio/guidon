-- Expand only: old rows/clients retain NULL; new UI asks for an explicit 1-5.
-- Apply before deploying the new writer/admin reader. No RLS/grant changes.
BEGIN;
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS rating smallint;
ALTER TABLE public.feedback DROP CONSTRAINT IF EXISTS feedback_rating_range;
ALTER TABLE public.feedback ADD CONSTRAINT feedback_rating_range
    CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);
COMMIT;
