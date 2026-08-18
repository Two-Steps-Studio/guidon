-- ============================================================
-- GUIDON — MIGRACJA 010
-- Subtaski: tasks.parent_task_id
-- ============================================================
--
-- Uruchomić PO 009.
--
-- POWÓD
-- -----
-- Plan architektury (Etap 2, §9 model encji) wymaga Subtaska jako
-- dziecka Taska. `roadmap_phases` zostaje bez zmian — w UI występuje
-- jako Milestone i to inna warstwa hierarchii (grupuje taski po
-- fazie projektu, nie po zadaniu nadrzędnym). Tu chodzi o dekompozycję
-- pojedynczego taska na mniejsze kroki (checklist z licznikiem "3/5"
-- w TaskDetailDialog i na karcie), więc self-referencing FK na
-- `tasks` jest właściwym modelem, nie osobna tabela.
--
-- KSZTAŁT
-- -------
-- Jeden poziom zagnieżdżenia jest wystarczający dla V0.1 (subtask
-- subtaska nie jest w zakresie planu) — dlatego brak CHECK
-- ograniczającego głębokość: UI po prostu nie oferuje tworzenia
-- subtaska z poziomu subtaska. Baza nie wymusza tego twardo, żeby
-- nie trzeba było pisać rekurencyjnego CHECK-a dla przypadku, którego
-- na razie nikt nie może wywołać z aplikacji.
--
-- ON DELETE CASCADE: usunięcie taska nadrzędnego usuwa jego subtaski.
-- Zgodne z zachowaniem reszty schematu (np. tasks_project_id_fkey) —
-- dziecko nie przeżywa rodzica. `sort_order` już istnieje na `tasks`
-- (kolumna z 000), więc subtaski dziedziczą porządkowanie za darmo,
-- bez nowej kolumny.
--
-- RLS
-- ---
-- Bez zmian w politykach tasks_select/insert/update/delete (001).
-- Subtask to zwykły wiersz w `tasks` ze swoim `project_id` — te same
-- cztery polityki, które już sprawdzają project_access()/project_role(),
-- obejmują go automatycznie. Nie trzeba nowej polityki dla samego
-- faktu posiadania `parent_task_id`.
--
-- BEZPIECZEŃSTWO
-- --------------
-- Zmiana wyłącznie rozszerzająca (nowa nullable kolumna + FK + indeks).
-- Żaden istniejący wiersz nie narusza nowego ograniczenia. Sprawdzone
-- npm run test:db po dopisaniu asercji dla tego pliku.
-- ============================================================

BEGIN;


ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS parent_task_id uuid;


ALTER TABLE public.tasks
DROP CONSTRAINT IF EXISTS tasks_parent_task_id_fkey;

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_parent_task_id_fkey
        FOREIGN KEY (parent_task_id)
            REFERENCES public.tasks(id)
            ON DELETE CASCADE;


-- Blokuje task jako własnego rodzica. Nie łapie cykli dłuższych niż 1
-- (A -> B -> A), ale UI nigdy nie oferuje wyboru rodzica spoza listy
-- tasków bez własnego parent_task_id, więc dłuższy cykl nie jest
-- osiągalny z aplikacji.
ALTER TABLE public.tasks
DROP CONSTRAINT IF EXISTS tasks_parent_task_id_not_self;

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_parent_task_id_not_self
        CHECK (parent_task_id IS DISTINCT FROM id);


CREATE INDEX IF NOT EXISTS idx_tasks_parent_task
    ON public.tasks(parent_task_id);


COMMIT;
