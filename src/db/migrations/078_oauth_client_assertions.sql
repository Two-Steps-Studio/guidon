-- Signed CIMD clients (private_key_jwt): single-use assertions across replicas.
BEGIN;
CREATE TABLE IF NOT EXISTS public.oauth_client_assertions (
    assertion_hash text PRIMARY KEY CHECK (assertion_hash ~ '^[a-f0-9]{64}$'),
    expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_client_assertions_expiry ON public.oauth_client_assertions (expires_at);
ALTER TABLE public.oauth_client_assertions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oauth_client_assertions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.oauth_client_assertions TO service_role;
COMMIT;
