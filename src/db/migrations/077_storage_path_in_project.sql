-- ============================================================
-- GUIDON - MIGRACJA 077
-- Ścieżka pliku musi należeć do projektu wiersza
-- ============================================================
--
-- Uruchomić PO 076.
--
-- task_attachments, project_files i project_references trzymają
-- storage_path, a aplikacja podpisuje dla niego URL i kasuje obiekt kluczem
-- service role (src/lib/storage). Polityki INSERT sprawdzają tylko, czy
-- wolno pisać w danym projekcie, nie samą ścieżkę - przez PostgREST ktoś z
-- prawem dodawania załączników mógł wstawić wiersz wskazujący plik innego
-- projektu i potem go pobrać albo usunąć przez aplikację.
--
-- Aplikacja zawsze zapisuje ścieżki "projects/<project_id>/..."
-- (uploadProjectFile/uploadProjectReference/uploadTaskAttachment), więc
-- trigger wymaga dokładnie tego prefiksu i odrzuca "..". Stare wiersze
-- zostają, jak są - sprawdzane są tylko nowe zapisy.
-- ============================================================

BEGIN;


CREATE OR REPLACE FUNCTION private.check_storage_path_in_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    owner_project uuid;
BEGIN
    IF NEW.storage_path IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'task_attachments' THEN
        SELECT t.project_id INTO owner_project FROM public.tasks t WHERE t.id = NEW.task_id;
    ELSE
        owner_project := NEW.project_id;
    END IF;

    IF owner_project IS NULL
       OR left(NEW.storage_path, length('projects/' || owner_project::text || '/')) <> 'projects/' || owner_project::text || '/'
       OR position('..' IN NEW.storage_path) > 0 THEN
        RAISE EXCEPTION 'storage_path must be inside projects/<project_id>/ of the row''s own project'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_storage_path ON public.task_attachments;
CREATE TRIGGER check_storage_path
    BEFORE INSERT OR UPDATE OF storage_path, task_id ON public.task_attachments
    FOR EACH ROW EXECUTE FUNCTION private.check_storage_path_in_project();

DROP TRIGGER IF EXISTS check_storage_path ON public.project_files;
CREATE TRIGGER check_storage_path
    BEFORE INSERT OR UPDATE OF storage_path, project_id ON public.project_files
    FOR EACH ROW EXECUTE FUNCTION private.check_storage_path_in_project();

DROP TRIGGER IF EXISTS check_storage_path ON public.project_references;
CREATE TRIGGER check_storage_path
    BEFORE INSERT OR UPDATE OF storage_path, project_id ON public.project_references
    FOR EACH ROW EXECUTE FUNCTION private.check_storage_path_in_project();


COMMIT;
