-- ============================================================
-- GUIDON - MIGRACJA 047
-- Wyszukiwanie uzytkownika po e-mailu przy dodawaniu do organizacji
-- ============================================================
--
-- Uruchomic PO 046.
--
-- KONTEKST
-- --------
-- Dodanie osoby do organizacji (organizations/[id]/members/actions.ts)
-- szukalo jej profilu przez `SELECT id FROM profiles WHERE email = $1`
-- z uprawnieniami wywolujacego. RLS na profiles (003,
-- profiles_select_own + profiles_select_team) pokazuje jednak tylko wlasny
-- profil i profile osob, z ktorymi dzieli sie juz organizacje lub projekt -
-- czyli nigdy osoby, ktora dopiero ma zostac dodana. Wynik: "User with
-- this email not found." dla kazdego istniejacego konta spoza organizacji,
-- a przez to rowniez brak kandydatow do dodania w czlonkach projektu.
--
-- Ta funkcja zwraca WYLACZNIE id profilu (nie e-mail, nie imie) i tylko
-- ownerowi/adminowi wskazanej organizacji - tym samym osobom, ktore i tak
-- moga dodawac czlonkow (organization_members_insert_*). Profile dalej
-- pozostaja niewidoczne poza wspolnym workspace'em; RLS na
-- organization_members nadal pilnuje samego INSERT-a.
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.find_user_id_by_email(uuid, text);

CREATE FUNCTION public.find_user_id_by_email(
    p_organization_id uuid,
    p_email text
)
    RETURNS uuid
    LANGUAGE sql
    STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT p.id
FROM public.profiles p
WHERE p.email = lower(btrim(p_email))
  AND private.org_role(p_organization_id) IN ('owner', 'admin')
LIMIT 1;
$$;

REVOKE ALL
    ON FUNCTION public.find_user_id_by_email(uuid, text)
    FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.find_user_id_by_email(uuid, text)
TO authenticated;

COMMIT;
