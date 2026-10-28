-- ============================================================
-- GUIDON - MIGRACJA 098
-- Living Project Memory: wycofanie niezweryfikowanych wnioskow,
-- gdy zadanie-zrodlo przestaje byc dowodem
-- ============================================================
--
-- Uruchomic PO 012 (sprzatanie context_relations). Niezalezna od 090-097.
--
-- KONTEKST
-- --------
-- src/lib/ai/task-learning.ts: po zakonczeniu zadania AI proponuje 1-2
-- wnioski do pamieci projektu jako niezweryfikowane ai_insight, z relacja
-- memory -based_on-> task (metadata.origin = 'task_learning'). Dowodem
-- jest zakonczone zadanie. Kiedy dowod znika, wniosek nie powinien zostac:
--
-- * zadanie zostalo ponownie otwarte (is_done true -> false): praca nie byla
--   skonczona, wiec wniosek byl przedwczesny. Po ponownym zakonczeniu
--   task-learning wyciagnie go od nowa (relacja zniknela razem z wpisem);
-- * zadanie zostalo usuniete: wniosek nie ma juz zrodla.
--
-- Wycofywane sa TYLKO niezweryfikowane ai_insight z tej relacji. Wpis, ktory
-- czlowiek zaakceptowal (verified), jest juz wiedza projektu i zostaje.
--
-- Jeden trigger zamiast wywolan w kazdej sciezce (tablica, akcje grupowe,
-- REST, MCP, Discord): kazda zmiana is_done i kazde usuniecie przechodza
-- przez tabele. BEFORE DELETE, bo AFTER DELETE 012 usuwa relacje, po ktorych
-- szukamy wpisow. Przy usuwaniu calego projektu (kaskada) nic nie robi -
-- pamiec projektu znika i tak.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION private.retract_learned_memory() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NOT (OLD.is_done IS TRUE AND NEW.is_done IS NOT TRUE) THEN
        RETURN NEW;
    END IF;
    -- Project deletion cascades here; its memory goes with it.
    IF NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = OLD.project_id) THEN
        RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    DELETE FROM public.project_memory m
    USING public.context_relations r
    WHERE r.source_type = 'memory'
      AND r.source_id = m.id
      AND r.target_type = 'task'
      AND r.target_id = OLD.id
      AND r.relation_type = 'based_on'
      AND r.metadata->>'origin' = 'task_learning'
      AND m.project_id = OLD.project_id
      AND m.memory_type = 'ai_insight'
      AND m.verified IS NOT TRUE;

    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION private.retract_learned_memory() FROM PUBLIC;

DROP TRIGGER IF EXISTS retract_learned_memory_on_reopen ON public.tasks;
-- No column list: is_done usually changes through the status trigger (060),
-- which "UPDATE OF is_done" would not see.
CREATE TRIGGER retract_learned_memory_on_reopen
AFTER UPDATE ON public.tasks
FOR EACH ROW
WHEN (OLD.is_done IS TRUE AND NEW.is_done IS NOT TRUE)
EXECUTE FUNCTION private.retract_learned_memory();

DROP TRIGGER IF EXISTS retract_learned_memory_on_delete ON public.tasks;
CREATE TRIGGER retract_learned_memory_on_delete
BEFORE DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION private.retract_learned_memory();

COMMIT;
