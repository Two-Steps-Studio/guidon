-- ============================================================
-- GUIDON - MIGRACJA 070
-- Jezyk projektu
-- ============================================================
--
-- Uruchomic PO 069.
--
-- KONTEKST
-- --------
-- projects.language: w jakim jezyku jest projekt - kod jezyka (ISO 639-1,
-- opcjonalnie z regionem, np. 'pl', 'en', 'pt-BR'). NULL = automatycznie
-- (AI odpowiada w jezyku pytania / zadania, jak dotad). Ustawiony jezyk
-- wymusza jezyk tresci, ktore Guidon generuje w projekcie: odpowiedzi
-- asystenta AI, wnioski do pamieci, nauka z ukonczonych zadan. Zmienia
-- owner/admin projektu (kolumna dopisana do GRANT UPDATE, jak w 067).
-- ============================================================

BEGIN;


ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS language text;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_language_check;
ALTER TABLE public.projects
    ADD CONSTRAINT projects_language_check
    CHECK (language IS NULL OR language ~ '^[a-z]{2}(-[A-Z]{2})?$');

REVOKE UPDATE ON public.projects FROM authenticated;
GRANT UPDATE (name, description, status, color, allow_ai_auto_complete, avatar_url, project_type, methodology, ai_enabled, disabled_modules, done_cleanup_days, visibility, language)
    ON public.projects
    TO authenticated;


COMMIT;
