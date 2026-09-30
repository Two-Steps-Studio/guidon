-- ============================================================
-- GUIDON - MIGRACJA 049
-- Limit projektów na członka organizacji:
-- organizations.member_project_limit
-- ============================================================
--
-- Uruchomić PO 048.
--
-- POWÓD
-- -----
-- Organizacja nie miała jak ograniczyć, w ilu jej projektach może być
-- jeden członek. Ta migracja dodaje ustawienie per organizacja:
--
--   organizations.member_project_limit integer NULL
--     NULL  = bez limitu (domyślnie, dotychczasowe zachowanie)
--     N>=1  = członek z rolą 'member' może należeć do najwyżej N
--             projektów TEJ organizacji
--
-- Liczą się projekty o statusie innym niż 'deleted' (zarchiwizowany
-- projekt dalej daje dostęp, więc dalej zajmuje miejsce).
--
-- Właściciel i admin organizacji są zwolnieni z limitu - zarządzają
-- całą organizacją, a limit blokujący im tworzenie projektów
-- odcinałby ich od własnego workspace'u.
--
-- DLACZEGO TRIGGER, A NIE SPRAWDZENIE W AKCJI
-- ------------------------------------------
-- Członkostwo w projekcie powstaje w co najmniej dwóch miejscach:
-- addMember (src/app/projects/[id]/members/actions.ts) oraz trigger
-- private.handle_new_project() (001), który zapisuje twórcę projektu
-- jako ownera. Sprawdzenie w jednej akcji byłoby obejściem dla
-- drugiej ścieżki (i dla każdej przyszłej), więc limit żyje przy
-- tabeli. Aplikacja tylko tłumaczy błąd na czytelny komunikat.
--
-- Funkcja jest SECURITY DEFINER, bo musi policzyć WSZYSTKIE
-- członkostwa danej osoby w organizacji - również w projektach,
-- których wywołujący (np. admin jednego projektu) nie widzi przez RLS.
-- Niczego nie zwraca poza błędem, więc nie ujawnia tych danych.
--
-- Współbieżność: pg_advisory_xact_lock na parę (organizacja, osoba)
-- serializuje równoległe dodania tej samej osoby, więc dwa
-- jednoczesne INSERT-y nie przeskoczą limitu o jeden.
--
-- Obniżenie limitu poniżej obecnej liczby członkostw niczego nie
-- usuwa - blokuje tylko nowe, dopóki ktoś nie zejdzie pod limit.
--
-- Błąd ma własny SQLSTATE 'GU001' (src/lib/db/errors.ts:
-- isMemberProjectLimitReached), przechodzi bez zmian przez node-postgres
-- i przez PostgREST (pole `code`).
--
-- GRANT: 014 zawęziło UPDATE na organizations do (name, slug,
-- description). Ten limit to polityka samej organizacji, nie
-- uprawnienie z planu (jak project_limit), więc właściciel/admin
-- organizacji może go zmieniać - organizations_update (001) i tak
-- wymaga org_role IN ('owner','admin').
-- ============================================================

BEGIN;


ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS member_project_limit integer NULL
        CHECK (member_project_limit IS NULL OR member_project_limit >= 1);

GRANT UPDATE (member_project_limit)
    ON public.organizations
    TO authenticated;


CREATE OR REPLACE FUNCTION private.enforce_member_project_limit()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
AS $$
DECLARE
    v_org_id uuid;
    v_limit integer;
    v_org_role text;
    v_count integer;
BEGIN
    SELECT p.organization_id, o.member_project_limit
    INTO v_org_id, v_limit
    FROM public.projects p
    JOIN public.organizations o ON o.id = p.organization_id
    WHERE p.id = NEW.project_id;

    IF v_limit IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT om.role
    INTO v_org_role
    FROM public.organization_members om
    WHERE om.organization_id = v_org_id
      AND om.user_id = NEW.user_id;

    IF v_org_role IN ('owner', 'admin') THEN
        RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_org_id::text || ':' || NEW.user_id::text, 49)
    );

    SELECT count(*)
    INTO v_count
    FROM public.project_members pm
    JOIN public.projects p ON p.id = pm.project_id
    WHERE pm.user_id = NEW.user_id
      AND p.organization_id = v_org_id
      AND p.status <> 'deleted'
      AND pm.project_id <> NEW.project_id;

    IF v_count >= v_limit THEN
        RAISE EXCEPTION 'member_project_limit_reached: this person is already in % of this organization''s projects (limit %)', v_count, v_limit
            USING ERRCODE = 'GU001',
                  DETAIL = v_limit::text;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_member_project_limit() FROM PUBLIC;


DROP TRIGGER IF EXISTS trg_project_members_limit ON public.project_members;
CREATE TRIGGER trg_project_members_limit
    BEFORE INSERT OR UPDATE OF project_id, user_id
    ON public.project_members
    FOR EACH ROW
    EXECUTE FUNCTION private.enforce_member_project_limit();


COMMIT;
