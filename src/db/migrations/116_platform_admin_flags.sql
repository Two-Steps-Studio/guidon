CREATE TABLE public.platform_feature_flags (
  flag_key text PRIMARY KEY CHECK (flag_key ~ '^[a-z][a-z0-9-]{1,63}$'),
  config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object')
);
ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_feature_flags FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.platform_feature_flags TO service_role;
