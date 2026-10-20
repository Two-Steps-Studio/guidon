-- ============================================================
-- GUIDON - MIGRACJA 063
-- Zadania cykliczne
-- ============================================================
--
-- Uruchomic PO 062.
--
-- KONTEKST
-- --------
-- Zadanie glownego poziomu moze sie powtarzac: co N tygodni, co N miesiecy
-- albo co N dni (recurrence_rule + recurrence_interval, NULL = nie
-- powtarza sie). Bez crona: gdy zadanie zostaje ukonczone, aplikacja
-- (src/lib/work/recurrence.ts) tworzy nastepne wystapienie - z tym samym
-- opisem, etykietami, osoba i subtaskami, z nowym terminem.
--
-- recurred_from: z ktorego wystapienia powstalo to zadanie. UNIKALNE - to
-- ono sprawia, ze ukonczenie -> odznaczenie -> ponowne ukonczenie (albo dwie
-- sciezki naraz: akcja na tablicy i zdarzenie w tle) tworzy nastepne
-- wystapienie dokladnie raz: drugi INSERT konczy sie bledem unikalnosci.
-- ON DELETE SET NULL: usuniecie starego wystapienia (np. przez 061) nie
-- rusza nowego.
-- ============================================================

BEGIN;


ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurrence_rule text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurrence_interval integer;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurred_from uuid;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_recurrence_check;
ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_recurrence_check
    CHECK (
        (recurrence_rule IS NULL AND recurrence_interval IS NULL)
        OR (
            recurrence_rule IN ('weekly', 'monthly', 'every_n_days')
            -- IS NOT NULL wprost: NULL BETWEEN ... to NULL, a CHECK przepuszcza NULL.
            AND recurrence_interval IS NOT NULL
            AND recurrence_interval BETWEEN 1 AND 365
            AND parent_task_id IS NULL
        )
    );

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_recurred_from_fkey;
ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_recurred_from_fkey
        FOREIGN KEY (recurred_from)
            REFERENCES public.tasks(id)
            ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_recurred_from_key
    ON public.tasks (recurred_from)
    WHERE recurred_from IS NOT NULL;


COMMIT;
