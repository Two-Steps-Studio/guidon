-- ============================================================
-- GUIDON — MIGRACJA 018
-- Obrazki (avatar_url) dla organizacji i projektów
-- ============================================================
--
-- Uruchomić PO 017.
--
-- Ta sama kolumna i ten sam wzorzec co profiles.avatar_url (000/001) —
-- publiczny URL w bucketcie "avatars" (współdzielonym z avatarami
-- profili, osobny prefiks ścieżki: organizations/<id>/... i
-- projects/<id>/...), NIE binarne dane w wierszu.
--
-- WAŻNE: 014 i 017 już zawęziły GRANT UPDATE na obu tych tabelach do
-- konkretnej listy kolumn (patrz komentarze w tamtych migracjach — luka
-- self-elevation, ten sam wzorzec). Nowa kolumna musi trafić do tej
-- listy w tej samej migracji, inaczej legalny upload obrazka dostanie
-- "permission denied" mimo przejścia polityki RLS.
-- ============================================================

BEGIN;


ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS avatar_url text;


REVOKE UPDATE ON public.organizations FROM authenticated;
GRANT UPDATE (name, slug, description, avatar_url)
    ON public.organizations
    TO authenticated;

REVOKE UPDATE ON public.projects FROM authenticated;
GRANT UPDATE (name, description, status, color, allow_ai_auto_complete, avatar_url)
    ON public.projects
    TO authenticated;


COMMIT;
