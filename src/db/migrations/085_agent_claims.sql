-- Agent service_auth claim flow. All secrets are hashes. Only the server may
-- invoke these routines after checking the browser session or claim/JWT proof.
BEGIN;
CREATE TABLE public.agent_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  client_name text NOT NULL CHECK (length(client_name) BETWEEN 1 AND 100),
  email_hash text NOT NULL CHECK (email_hash ~ '^[a-f0-9]{64}$'),
  claim_hash text NOT NULL UNIQUE CHECK (claim_hash ~ '^[a-f0-9]{64}$'),
  attempt_hash text NOT NULL UNIQUE CHECK (attempt_hash ~ '^[a-f0-9]{64}$'),
  code_hash text NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  scopes text[] NOT NULL CHECK (cardinality(scopes) > 0 AND scopes <@ ARRAY['tasks:read','tasks:write','tasks:status','comments:write','attempts:write','project:read','project:write']::text[]),
  resource text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','denied')),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  grant_id uuid REFERENCES public.oauth_grants(id) ON DELETE CASCADE,
  claim_spent_at timestamptz,
  last_polled_at timestamptz,
  poll_interval integer NOT NULL DEFAULT 5 CHECK (poll_interval BETWEEN 5 AND 60),
  claim_expires_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_registrations_expiry ON public.agent_registrations(expires_at);
CREATE INDEX agent_registrations_grant ON public.agent_registrations(grant_id) WHERE grant_id IS NOT NULL;
ALTER TABLE public.agent_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_registrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agent_registrations TO service_role;

CREATE TABLE public.agent_claim_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.agent_registrations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('started','approved','denied','code_failed','access_issued','revoked')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_claim_events_registration ON public.agent_claim_events(registration_id,occurred_at);
ALTER TABLE public.agent_claim_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_claim_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.agent_claim_events TO service_role;
CREATE FUNCTION public.audit_agent_claim_start() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.agent_claim_events(registration_id,kind) VALUES(NEW.id,'started');
  RETURN NEW;
END $$;
CREATE TRIGGER agent_claim_started AFTER INSERT ON public.agent_registrations
  FOR EACH ROW EXECUTE FUNCTION public.audit_agent_claim_start();
CREATE FUNCTION public.audit_agent_claim_revocation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    INSERT INTO public.agent_claim_events(registration_id,kind)
      SELECT id,'revoked' FROM public.agent_registrations WHERE grant_id = NEW.id FOR KEY SHARE;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_claim_revoked AFTER UPDATE OF revoked_at ON public.oauth_grants
  FOR EACH ROW EXECUTE FUNCTION public.audit_agent_claim_revocation();
REVOKE ALL ON FUNCTION public.audit_agent_claim_start(),public.audit_agent_claim_revocation() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.audit_agent_claim_start(),public.audit_agent_claim_revocation() TO service_role;

-- Row lock makes attempt limits, consent and single-claim token consumption
-- safe across server replicas. INVOKER + service-only EXECUTE never elevates a
-- user's database role. No user-editable metadata is consulted.
CREATE FUNCTION public.decide_agent_claim(p_attempt_hash text, p_user_id uuid,
  p_email_hash text, p_code_hash text, p_allow boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE r public.agent_registrations%ROWTYPE; g uuid;
BEGIN
  SELECT * INTO r FROM public.agent_registrations WHERE attempt_hash = p_attempt_hash FOR NO KEY UPDATE;
  IF NOT FOUND OR p_user_id IS NULL OR p_email_hash IS NULL OR p_code_hash IS NULL OR p_allow IS NULL
    OR r.state <> 'pending' OR r.claim_expires_at <= clock_timestamp()
    OR r.email_hash <> p_email_hash THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF NOT p_allow THEN
    UPDATE public.agent_registrations SET state = 'denied' WHERE id = r.id;
    INSERT INTO public.agent_claim_events(registration_id,kind) VALUES(r.id,'denied');
    RETURN jsonb_build_object('status','denied');
  END IF;
  IF r.failed_attempts >= 5 THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF r.code_hash <> p_code_hash THEN
    UPDATE public.agent_registrations SET failed_attempts = failed_attempts + 1,
      state = CASE WHEN failed_attempts >= 4 THEN 'denied' ELSE state END WHERE id = r.id;
    INSERT INTO public.agent_claim_events(registration_id,kind) VALUES(r.id,'code_failed');
    IF r.failed_attempts >= 4 THEN INSERT INTO public.agent_claim_events(registration_id,kind) VALUES(r.id,'denied'); END IF;
    RETURN jsonb_build_object('status','invalid');
  END IF;
  INSERT INTO public.oauth_grants(client_id,user_id,client_name,scopes,resource)
    VALUES (r.client_id,p_user_id,r.client_name,r.scopes,r.resource) RETURNING id INTO g;
  UPDATE public.agent_registrations SET state = 'approved', grant_id = g,
    expires_at = clock_timestamp() + interval '24 hours' WHERE id = r.id;
  INSERT INTO public.agent_claim_events(registration_id,kind) VALUES(r.id,'approved');
  RETURN jsonb_build_object('status','approved');
END $$;

CREATE FUNCTION public.issue_agent_claim_token(p_claim_hash text, p_registration_id uuid,
  p_resource text, p_key_hash text, p_key_prefix text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE r public.agent_registrations%ROWTYPE; g public.oauth_grants%ROWTYPE;
  t timestamptz := clock_timestamp(); expiry timestamptz;
BEGIN
  IF p_claim_hash IS NOT NULL THEN
    SELECT * INTO r FROM public.agent_registrations WHERE claim_hash = p_claim_hash FOR NO KEY UPDATE;
  ELSE
    SELECT * INTO r FROM public.agent_registrations WHERE id = p_registration_id FOR NO KEY UPDATE;
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid_grant'); END IF;
  IF r.expires_at <= t OR (p_claim_hash IS NOT NULL AND r.claim_expires_at <= t)
    THEN RETURN jsonb_build_object('status','expired_token'); END IF;
  IF p_resource IS NULL OR r.resource <> p_resource THEN RETURN jsonb_build_object('status','invalid_target'); END IF;
  IF r.state = 'denied' THEN RETURN jsonb_build_object('status','access_denied'); END IF;
  IF p_claim_hash IS NOT NULL THEN
    IF r.claim_spent_at IS NOT NULL THEN RETURN jsonb_build_object('status','invalid_grant'); END IF;
    IF r.last_polled_at IS NOT NULL AND t < r.last_polled_at + make_interval(secs => r.poll_interval) THEN
      UPDATE public.agent_registrations SET poll_interval = least(60,poll_interval + 5),last_polled_at = t WHERE id = r.id;
      RETURN jsonb_build_object('status','slow_down');
    END IF;
    UPDATE public.agent_registrations SET last_polled_at = t WHERE id = r.id;
  END IF;
  IF r.state <> 'approved' THEN RETURN jsonb_build_object('status','authorization_pending'); END IF;
  SELECT * INTO g FROM public.oauth_grants WHERE id = r.grant_id FOR UPDATE;
  IF NOT FOUND OR g.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('status','invalid_grant'); END IF;
  IF p_key_hash !~ '^[a-f0-9]{64}$' OR length(p_key_prefix) > 12 THEN
    RAISE EXCEPTION 'Invalid credential storage parameters';
  END IF;
  expiry := least(t + interval '1 hour',r.expires_at);
  DELETE FROM public.api_keys WHERE oauth_grant_id = g.id AND expires_at <= t;
  INSERT INTO public.api_keys(user_id,name,key_hash,key_prefix,scopes,bot_label,oauth_grant_id,expires_at,human_client)
    VALUES(g.user_id,left(r.client_name || ' (agent)',100),p_key_hash,p_key_prefix,r.scopes,left(r.client_name,60),g.id,expiry,false);
  IF p_claim_hash IS NOT NULL THEN
    UPDATE public.agent_registrations SET claim_spent_at = t WHERE id = r.id;
  END IF;
  UPDATE public.oauth_grants SET last_used_at = t WHERE id = g.id;
  INSERT INTO public.agent_claim_events(registration_id,kind) VALUES(r.id,'access_issued');
  RETURN jsonb_build_object('status','issued','registration_id',r.id,'assertion_expires',r.expires_at,
    'expires_in',greatest(1,floor(extract(epoch FROM expiry - t))),'scope',array_to_string(r.scopes,' '));
END $$;
REVOKE ALL ON FUNCTION public.decide_agent_claim(text,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.issue_agent_claim_token(text,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.decide_agent_claim(text,uuid,text,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_agent_claim_token(text,uuid,text,text,text) TO service_role;
COMMIT;
