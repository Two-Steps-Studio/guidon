-- ============================================================
-- GUIDON - MIGRACJA 100
-- Claim z lease dla agentów: jeden agent na zadanie naraz
-- ============================================================
--
-- Uruchomić PO 099.
--
-- KONTEKST
-- --------
-- start_task tylko zmieniał status na ai_working. Dwóch agentów (dwa
-- klucze API / dwie aplikacje MCP) mogło wziąć to samo zadanie naraz i
-- nadpisywać sobie pracę, a zadanie porzucone przez agenta wisiało w
-- AI Working bez końca.
--
-- task_claims: najwyżej jeden aktywny claim na zadanie, przypisany do
-- klucza API (nie do osoby - jedna osoba może mieć kilku agentów), z
-- wygaśnięciem (lease). public.claim_task robi to atomowo: INSERT ...
-- ON CONFLICT DO UPDATE ... WHERE (ten sam klucz albo lease wygasł), więc
-- z dwóch równoczesnych claimów wygrywa dokładnie jeden. Wygasły claim
-- przejmuje następny agent. Ten sam klucz odnawia swój lease.
--
-- Zmiana statusu zadania na cokolwiek innego niż ai_working (oddanie do
-- review, done, przesunięcie przez człowieka) zwalnia claim - trigger,
-- więc niezależnie od tego, kto i którędy zmienił status.
--
-- Zapis tylko przez funkcje (SECURITY DEFINER ze sprawdzeniem roli
-- wywołującego i własności klucza); czytają członkowie projektu.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.task_claims (
    task_id        uuid        PRIMARY KEY REFERENCES public.tasks(id) ON DELETE CASCADE,
    project_id     uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    holder_key_id  uuid        NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
    holder_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    holder_label   text        CHECK (char_length(holder_label) <= 120),
    claimed_at     timestamptz NOT NULL DEFAULT now(),
    expires_at     timestamptz NOT NULL,
    CHECK (expires_at > claimed_at)
);
CREATE INDEX IF NOT EXISTS task_claims_project ON public.task_claims (project_id);
CREATE INDEX IF NOT EXISTS task_claims_holder_key ON public.task_claims (holder_key_id);

ALTER TABLE public.task_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.task_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_claims TO service_role;

DROP POLICY IF EXISTS task_claims_select ON public.task_claims;
CREATE POLICY task_claims_select ON public.task_claims FOR SELECT TO authenticated
    USING (private.project_access(project_id));

-- Claim or renew. Returns the claim as it stands afterwards and whether the
-- caller's key holds it (false: another key's lease is still running).
CREATE OR REPLACE FUNCTION public.claim_task(
    p_task_id       uuid,
    p_key_id        uuid,
    p_label         text,
    p_lease_seconds integer
)
RETURNS TABLE (claimed boolean, holder_key_id uuid, holder_label text, claimed_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_project uuid;
    v_lease   integer := LEAST(GREATEST(COALESCE(p_lease_seconds, 7200), 60), 86400);
BEGIN
    SELECT t.project_id INTO v_project FROM public.tasks t WHERE t.id = p_task_id;
    IF v_project IS NULL OR COALESCE(private.project_role(v_project), '') NOT IN ('owner', 'admin', 'developer') THEN
        RAISE EXCEPTION 'You cannot claim this task' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.api_keys k
        WHERE k.id = p_key_id AND k.user_id = (SELECT auth.uid()) AND k.revoked_at IS NULL
    ) THEN
        RAISE EXCEPTION 'The key is not yours' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    INSERT INTO public.task_claims AS c (task_id, project_id, holder_key_id, holder_user_id, holder_label, claimed_at, expires_at)
    VALUES (p_task_id, v_project, p_key_id, (SELECT auth.uid()), left(p_label, 120), now(), now() + make_interval(secs => v_lease))
    ON CONFLICT (task_id) DO UPDATE
        SET holder_key_id  = EXCLUDED.holder_key_id,
            holder_user_id = EXCLUDED.holder_user_id,
            holder_label   = EXCLUDED.holder_label,
            claimed_at     = CASE WHEN c.holder_key_id = EXCLUDED.holder_key_id AND c.expires_at > now() THEN c.claimed_at ELSE now() END,
            expires_at     = EXCLUDED.expires_at
        WHERE c.holder_key_id = EXCLUDED.holder_key_id OR c.expires_at <= now()
    RETURNING true, c.holder_key_id, c.holder_label, c.claimed_at, c.expires_at;

    IF NOT FOUND THEN
        RETURN QUERY
        SELECT false, c.holder_key_id, c.holder_label, c.claimed_at, c.expires_at
        FROM public.task_claims c WHERE c.task_id = p_task_id;
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_task(uuid, uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_task(uuid, uuid, text, integer) TO authenticated, service_role;

-- Leaving AI Working (review, done, or a person moving the card) ends the claim.
CREATE OR REPLACE FUNCTION private.release_task_claim_on_status() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'ai_working' THEN
        DELETE FROM public.task_claims WHERE task_id = NEW.id;
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.release_task_claim_on_status() FROM PUBLIC;
DROP TRIGGER IF EXISTS release_task_claim_on_status ON public.tasks;
CREATE TRIGGER release_task_claim_on_status
AFTER UPDATE OF status ON public.tasks
FOR EACH ROW EXECUTE FUNCTION private.release_task_claim_on_status();

COMMIT;
