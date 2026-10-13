-- ============================================================
-- GUIDON - MIGRACJA 054
-- Klucze API przypiete do jednego projektu + dozwolone domeny
-- ============================================================
--
-- Uruchomić PO 053.
--
-- PROBLEM
-- -------
-- Klucz reports:write (zgloszenia z gier, widget www) siedzi w publicznym
-- kodzie gry/strony. Dzialal jednak w KAZDYM projekcie, w ktorym jego
-- tworca moze tworzyc zadania - kto wyciagnal klucz z jednej strony, mogl
-- zasypac zgloszeniami tez inne projekty tej osoby.
--
-- ZMIANA
-- ------
-- project_id: klucz dziala tylko w tym projekcie. Egzekwuje to
--   guardApiRequest (src/lib/api/route-guard.ts): trasa musi jawnie podac
--   swoj projekt, inaczej klucz z project_id jest odrzucany (403) - nowe
--   trasy sa wiec domyslnie zamkniete dla takich kluczy.
-- allowed_origins: opcjonalna lista originow (https://sklep.pl), z ktorych
--   przegladarka moze uzyc klucza (naglowek Origin). Chroni przed
--   osadzeniem widgetu z cudzym kluczem na innej stronie; skrypt spoza
--   przegladarki moze podrobic Origin, wiec to nie zastepuje project_id.
-- Istniejace klucze maja NULL w obu kolumnach i dzialaja jak dotad.
-- ============================================================

BEGIN;


ALTER TABLE public.api_keys
    ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS allowed_origins text[];

-- FK lookups on project delete, and the per-project key list in settings.
CREATE INDEX IF NOT EXISTS idx_api_keys_project ON public.api_keys (project_id) WHERE project_id IS NOT NULL;


-- A key may only be bound to a project its owner can create tasks in -
-- otherwise the binding would be meaningless (every request would fail
-- RLS anyway), and it keeps someone from attaching keys to projects they
-- merely know the id of.
DROP POLICY IF EXISTS api_keys_insert ON public.api_keys;
CREATE POLICY api_keys_insert
ON public.api_keys
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (project_id IS NULL OR private.project_role(project_id) IN ('owner', 'admin', 'developer'))
);

-- Column-level INSERT grant (039) gains the two new columns; UPDATE stays
-- revoked_at only (016) - binding and origins are fixed at creation, a
-- different setup is a new key.
GRANT INSERT (project_id, allowed_origins) ON public.api_keys TO authenticated;


COMMIT;
