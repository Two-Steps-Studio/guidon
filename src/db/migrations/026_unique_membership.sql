-- ============================================================
-- GUIDON - MIGRACJA 026
-- Unikalność członkostwa: jeden wiersz na (organizacja, user) / (projekt, user)
-- ============================================================
--
-- Uruchomić PO 025.
--
-- KONTEKST
-- --------
-- Ani organization_members, ani project_members nigdy nie miały
-- UNIQUE(organization_id/project_id, user_id) - addMember() (obie warstwy,
-- organizations/[id]/members/actions.ts i projects/[id]/members/actions.ts)
-- nigdy nie sprawdzał, czy dany user już ma wiersz, przed INSERT-em.
--
-- Dwa realne skutki:
--
-- 1) private.org_role()/private.project_role() (001) wybierają rolę przez
--    `... LIMIT 1` bez ORDER BY - przy dwóch wierszach dla tego samego
--    (organizacja, user) to, która rola faktycznie rządzi dostępem, jest
--    niezdeterminowane (zależy od kolejności fizycznej w tabeli, może się
--    zmienić między zapytaniami).
--
-- 2) removeMember() kasuje po organization_members.id / project_members.id
--    (PK konkretnego WIERSZA, nie po (organizacja/projekt, user)) - przy
--    duplikacie "usunięcie członka" kasuje jeden wiersz, a drugi zostaje,
--    więc usunięta osoba cichcem zachowuje dostęp mimo że admin widzi ją
--    jako usuniętą.
--
-- NAPRAWA
-- -------
-- Przed dodaniem UNIQUE trzeba odchwaścić istniejące duplikaty (jeśli jakieś
-- są) - inaczej ALTER TABLE ... ADD CONSTRAINT po prostu się wywali na
-- prawdziwej bazie. Zachowywana jest "najsilniejsza" rola (owner > admin >
-- member dla organizacji; owner > admin > developer > tester > viewer dla
-- projektu), a przy remisie - najwcześniejsze joined_at (pierwsze realne
-- członkostwo tej osoby).
-- ============================================================

BEGIN;


-- ------------------------------------------------------------
-- organization_members
-- ------------------------------------------------------------

DELETE FROM public.organization_members om
WHERE om.id NOT IN (
    SELECT DISTINCT ON (organization_id, user_id) id
    FROM public.organization_members
    ORDER BY
        organization_id,
        user_id,
        CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
        joined_at ASC NULLS LAST,
        id
);

ALTER TABLE public.organization_members
DROP CONSTRAINT IF EXISTS organization_members_org_user_unique;

ALTER TABLE public.organization_members
    ADD CONSTRAINT organization_members_org_user_unique
        UNIQUE (organization_id, user_id);


-- ------------------------------------------------------------
-- project_members
-- ------------------------------------------------------------

DELETE FROM public.project_members pm
WHERE pm.id NOT IN (
    SELECT DISTINCT ON (project_id, user_id) id
    FROM public.project_members
    ORDER BY
        project_id,
        user_id,
        CASE role
            WHEN 'owner' THEN 0
            WHEN 'admin' THEN 1
            WHEN 'developer' THEN 2
            WHEN 'tester' THEN 3
            ELSE 4
        END,
        joined_at ASC NULLS LAST,
        id
);

ALTER TABLE public.project_members
DROP CONSTRAINT IF EXISTS project_members_project_user_unique;

ALTER TABLE public.project_members
    ADD CONSTRAINT project_members_project_user_unique
        UNIQUE (project_id, user_id);


COMMIT;
