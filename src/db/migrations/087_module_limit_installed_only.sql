-- ============================================================
-- GUIDON - MIGRACJA 087
-- Limit modułów liczy tylko zainstalowane pakiety
-- ============================================================
--
-- Uruchomić PO 086.
--
-- 080 liczyło do limitu 20 wszystkie wiersze project_module_packages, także
-- odinstalowane (082 archiwizuje zamiast kasować, a DELETE nie ma). Projekt,
-- który kiedykolwiek miał 20 różnych modułów, nie mógł już zainstalować
-- żadnego - nawet po odinstalowaniu wszystkich. Ponowna instalacja
-- zarchiwizowanego modułu to UPDATE installed = true, którego trigger na
-- INSERT w ogóle nie sprawdzał.
--
-- Teraz limit dotyczy zainstalowanych pakietów i jest sprawdzany zarówno przy
-- nowej instalacji (INSERT), jak i przy ponownej (UPDATE installed false ->
-- true). Przy okazji indeks na agent_registrations.client_id (FK z 085).
-- ============================================================

BEGIN;


CREATE OR REPLACE FUNCTION private.enforce_module_package_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  -- Only a row that becomes installed takes a slot.
  IF NOT NEW.installed OR (TG_OP = 'UPDATE' AND OLD.installed) THEN
    RETURN NEW;
  END IF;
  -- Serialize installations in a project; concurrent writes cannot race the cap.
  PERFORM id FROM public.projects WHERE id = NEW.project_id FOR UPDATE;
  IF (
    SELECT count(*) FROM public.project_module_packages
    WHERE project_id = NEW.project_id AND installed AND module_id <> NEW.module_id
  ) >= 20 THEN
    RAISE EXCEPTION 'Project module package limit reached' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_module_package_limit() FROM PUBLIC;

DROP TRIGGER IF EXISTS module_package_limit ON public.project_module_packages;
CREATE TRIGGER module_package_limit
  BEFORE INSERT OR UPDATE OF installed ON public.project_module_packages
  FOR EACH ROW EXECUTE FUNCTION private.enforce_module_package_limit();

CREATE INDEX IF NOT EXISTS agent_registrations_client ON public.agent_registrations(client_id);


COMMIT;
