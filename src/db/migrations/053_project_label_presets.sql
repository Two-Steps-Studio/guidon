-- ============================================================
-- GUIDON - MIGRACJA 053
-- Presety etykiet (labeli) per projekt
-- ============================================================
--
-- Uruchomić PO 052.
--
-- tasks.tags (text[]) zostaje jedynym miejscem, gdzie zadanie trzyma swoje
-- etykiety - AI Task API, wtyczki i filtr tablicy dalej widzą zwykłe
-- stringi. Ta tabela to tylko SŁOWNIK projektu: nazwy etykiet, które
-- właściciel/admin zdefiniował w ustawieniach (z kolorem), podpowiadane
-- przy edycji zadania i kolorowane na kartach. Etykieta spoza presetów
-- dalej jest dozwolona (wolny tekst jak dotąd), a usunięcie presetu nie
-- rusza zadań, które już ją mają.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.project_label_presets (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name        text        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40 AND name = btrim(name)),
    color       text        NOT NULL DEFAULT '#64748b' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
    sort_order  integer     NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- One preset per name per project, case-insensitively ("Bug" and "bug"
-- would filter as two different tags on the board). Also serves the
-- project_id lookups (leading column), so no separate FK index is needed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_label_presets_project_name
    ON public.project_label_presets (project_id, lower(name));


ALTER TABLE public.project_label_presets ENABLE ROW LEVEL SECURITY;


-- Everyone with access to the project can read the presets - they're needed
-- wherever tasks are edited or shown.
DROP POLICY IF EXISTS project_label_presets_select ON public.project_label_presets;
CREATE POLICY project_label_presets_select
ON public.project_label_presets
FOR SELECT
TO authenticated
USING (private.project_access(project_id));

-- Owner/admin only, same as project_board_columns (020): presets are
-- project configuration, not day-to-day task work.
DROP POLICY IF EXISTS project_label_presets_insert ON public.project_label_presets;
CREATE POLICY project_label_presets_insert
ON public.project_label_presets
FOR INSERT
TO authenticated
WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS project_label_presets_update ON public.project_label_presets;
CREATE POLICY project_label_presets_update
ON public.project_label_presets
FOR UPDATE
TO authenticated
USING (private.project_role(project_id) IN ('owner', 'admin'))
WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS project_label_presets_delete ON public.project_label_presets;
CREATE POLICY project_label_presets_delete
ON public.project_label_presets
FOR DELETE
TO authenticated
USING (private.project_role(project_id) IN ('owner', 'admin'));


-- project_id is not in the UPDATE grant: a preset can't be moved into
-- another project (the WITH CHECK would also need the admin role there,
-- but there's no reason to allow it at all).
GRANT SELECT, INSERT, DELETE ON public.project_label_presets TO authenticated;
GRANT UPDATE (name, color, sort_order) ON public.project_label_presets TO authenticated;


COMMIT;
