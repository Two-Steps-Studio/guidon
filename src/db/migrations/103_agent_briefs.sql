-- ============================================================
-- GUIDON - MIGRACJA 103
-- Brief dla agentów: zatwierdzone, numerowane wersje
-- ============================================================
--
-- Uruchomić PO 102 (luki w numeracji są dozwolone - liczy się kolejność
-- plików).
--
-- KONTEKST
-- --------
-- Agent zaczynający pracę nad projektem dostawał ranking kontekstu
-- (get_project_context), ale nie krótki, zatwierdzony przez ludzi opis:
-- cel, stack, konwencje, ograniczenia, dozwolone akcje. agent_briefs
-- trzyma kolejne wersje takiego opisu w Markdown - każda zatwierdzona przez
-- właściciela lub admina projektu, niezmienna po zapisaniu, więc brief da
-- się odtworzyć z numeru wersji.
--
-- Zapis tylko przez public.save_agent_brief (owner/admin; numer wersji
-- nadawany pod blokadą wiersza projektu, więc dwa równoczesne zapisy nie
-- dostaną tego samego numeru). Czytają członkowie projektu.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.agent_briefs (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    version     integer     NOT NULL CHECK (version > 0),
    content     text        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
    approved_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, version)
);

ALTER TABLE public.agent_briefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_briefs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_briefs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_briefs TO service_role;

DROP POLICY IF EXISTS agent_briefs_select ON public.agent_briefs;
CREATE POLICY agent_briefs_select ON public.agent_briefs FOR SELECT TO authenticated
    USING (private.project_access(project_id));

CREATE OR REPLACE FUNCTION public.save_agent_brief(p_project_id uuid, p_content text)
RETURNS SETOF public.agent_briefs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_version integer;
BEGIN
    IF COALESCE(private.project_role(p_project_id), '') NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Only project owners and admins can approve the agent brief' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM public.projects p WHERE p.id = p_project_id FOR UPDATE;
    SELECT COALESCE(max(b.version), 0) + 1 INTO v_version FROM public.agent_briefs b WHERE b.project_id = p_project_id;
    RETURN QUERY
    INSERT INTO public.agent_briefs (project_id, version, content, approved_by)
    VALUES (p_project_id, v_version, p_content, (SELECT auth.uid()))
    RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.save_agent_brief(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_agent_brief(uuid, text) TO authenticated;

COMMIT;
