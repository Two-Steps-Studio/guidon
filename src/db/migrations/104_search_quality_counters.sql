-- Aggregate search quality only. No query, task/project/user ID, IP or session.
-- Uses the repository's numbered, backend-neutral migration runner.
BEGIN;
CREATE TABLE IF NOT EXISTS public.search_quality_counts (
    day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
    event text NOT NULL CHECK (event IN ('results','zero','click','failed')),
    count bigint NOT NULL DEFAULT 0 CHECK (count >= 0),
    PRIMARY KEY (day, event)
);
ALTER TABLE public.search_quality_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.search_quality_counts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_quality_counts TO service_role;

CREATE OR REPLACE FUNCTION public.record_search_event(p_event text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
    IF p_event IS NULL OR p_event NOT IN ('results','zero','click','failed') THEN
        RAISE EXCEPTION 'Invalid search event' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.search_quality_counts(day,event,count)
    VALUES ((now() AT TIME ZONE 'utc')::date,p_event,1)
    ON CONFLICT (day,event) DO UPDATE SET count = public.search_quality_counts.count + 1;
    DELETE FROM public.search_quality_counts WHERE day < (now() AT TIME ZONE 'utc')::date - 56;
END;
$$;
REVOKE ALL ON FUNCTION public.record_search_event(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_search_event(text) TO service_role;
COMMIT;
