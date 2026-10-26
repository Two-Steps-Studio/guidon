-- ============================================================
-- GUIDON - MIGRACJA 092
-- Moduły treści (079) przeniesione do pakietów modułów (080)
-- ============================================================
--
-- Uruchomić PO 091.
--
-- Projekt miał dwa rodzaje modułów: treści (projects.custom_modules, 079 -
-- bloki tekst/checklista/linki w jednym JSON-ie projektu) i danych
-- (project_module_packages, 080 - manifest, rekordy, widoki). Teraz jest
-- jeden: pakiet. Moduł treści staje się pakietem z widokiem "page" (silnik
-- 1.1), a to, co projekt w nim zapisał, rekordami:
--
-- - blok text      -> encja notes-<n> (pole text), jeden rekord z tekstem
-- - blok checklist -> encja checklist-<n> (label, done), rekord na punkt
-- - blok links     -> encja links-<n> (label, url), rekord na link
-- - kategoria      -> settings.category (088)
--
-- To ta sama konwersja co convertContentModule (src/lib/work/
-- module-legacy.ts); test:db sprawdza, że wynik przechodzi walidację
-- aplikacji. Id modułu zostaje; jeśli projekt ma już pakiet o tym id,
-- dostaje końcówkę "-page". Moduł, którego nie da się przenieść (zły
-- kształt - aplikacja nigdy takiego nie zapisała, ale kolumna przyjmuje
-- dowolną tablicę), zostaje tylko w projects.custom_modules (NOTICE).
--
-- Limit 20 zainstalowanych pakietów (087) jest na czas migracji wyłączony:
-- projekt z 20 modułami treści i pakietami nie traci żadnego - po prostu
-- nie zainstaluje kolejnego, dopóki któregoś nie odinstaluje.
--
-- projects.custom_modules zostaje bez zmian (kopia na wypadek wycofania);
-- aplikacja już go nie czyta. Ponowne uruchomienie (np. dwa razy wklejone
-- w SQL Editor) pomija moduły już przeniesione.
-- ============================================================

BEGIN;


ALTER TABLE public.project_module_packages DISABLE TRIGGER module_package_limit;

DO $$
DECLARE
  project record;
  module jsonb;
  block jsonb;
  item jsonb;
  block_index integer;
  target_id text;
  entity_id text;
  entities jsonb;
  blocks jsonb;
  records jsonb;
  settings jsonb;
  valid boolean;
  label_ok text := '^\S(.{0,98}\S)?$';
BEGIN
  FOR project IN
    SELECT id, custom_modules FROM public.projects
    WHERE jsonb_typeof(custom_modules) = 'array' AND jsonb_array_length(custom_modules) > 0
  LOOP
    FOR module IN SELECT value FROM jsonb_array_elements(project.custom_modules) LOOP
      -- The shape customModuleSchema (src/lib/work/custom-modules.ts) accepts.
      valid := jsonb_typeof(module) = 'object'
        AND coalesce(module->>'id', '') ~ '^[a-z][a-z0-9-]{0,63}$'
        AND jsonb_typeof(module->'title') = 'string' AND module->>'title' ~ label_ok
        AND (module->'description' IS NULL OR (jsonb_typeof(module->'description') = 'string' AND char_length(module->>'description') <= 500))
        AND (module->'category' IS NULL OR (jsonb_typeof(module->'category') = 'string' AND char_length(module->>'category') BETWEEN 1 AND 40 AND module->>'category' = btrim(module->>'category')))
        AND jsonb_typeof(module->'blocks') = 'array' AND jsonb_array_length(module->'blocks') BETWEEN 1 AND 20;
      IF valid THEN
        FOR block IN SELECT value FROM jsonb_array_elements(module->'blocks') LOOP
          valid := valid AND jsonb_typeof(block) = 'object'
            AND jsonb_typeof(block->'title') = 'string' AND block->>'title' ~ label_ok
            AND CASE block->>'type'
              WHEN 'text' THEN jsonb_typeof(block->'text') = 'string' AND char_length(btrim(block->>'text')) BETWEEN 1 AND 4000
              WHEN 'checklist' THEN jsonb_typeof(block->'items') = 'array' AND jsonb_array_length(block->'items') BETWEEN 1 AND 30
                AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(block->'items') i
                  WHERE jsonb_typeof(i.value->'label') <> 'string' OR NOT (i.value->>'label') ~ label_ok OR jsonb_typeof(i.value->'done') <> 'boolean')
              WHEN 'links' THEN jsonb_typeof(block->'items') = 'array' AND jsonb_array_length(block->'items') BETWEEN 1 AND 30
                AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(block->'items') i
                  WHERE jsonb_typeof(i.value->'label') <> 'string' OR NOT (i.value->>'label') ~ label_ok
                    OR jsonb_typeof(i.value->'url') <> 'string' OR NOT (i.value->>'url') ~ '^https?://[^\s/?#]+' OR char_length(i.value->>'url') > 2000)
              ELSE false
            END;
        END LOOP;
      END IF;
      IF NOT valid THEN
        RAISE NOTICE 'project %: content module % not converted (invalid shape)', project.id, coalesce(module->>'id', '?');
        CONTINUE;
      END IF;

      -- Already converted (the migration pasted twice): leave it.
      IF EXISTS (SELECT 1 FROM public.project_module_packages p
        WHERE p.project_id = project.id AND p.module_id IN (module->>'id', left(module->>'id', 59) || '-page')
          AND p.manifest @> '{"author":{"name":"Project"},"views":[{"id":"page","type":"page"}]}'::jsonb
          AND p.manifest->>'name' = module->>'title') THEN
        CONTINUE;
      END IF;

      target_id := module->>'id';
      IF EXISTS (SELECT 1 FROM public.project_module_packages p WHERE p.project_id = project.id AND p.module_id = target_id) THEN
        target_id := left(module->>'id', 59) || '-page';
        IF EXISTS (SELECT 1 FROM public.project_module_packages p WHERE p.project_id = project.id AND p.module_id = target_id) THEN
          RAISE NOTICE 'project %: content module % not converted (id taken)', project.id, module->>'id';
          CONTINUE;
        END IF;
      END IF;

      entities := '[]'::jsonb;
      blocks := '[]'::jsonb;
      records := '[]'::jsonb;
      block_index := 0;
      FOR block IN SELECT value FROM jsonb_array_elements(module->'blocks') LOOP
        block_index := block_index + 1;
        IF block->>'type' = 'text' THEN
          entity_id := 'notes-' || block_index;
          entities := entities || jsonb_build_array(jsonb_build_object('id', entity_id, 'name', block->>'title', 'fields', jsonb_build_array(
            jsonb_build_object('id', 'text', 'name', 'Text', 'type', 'text', 'required', true, 'maxLength', 4000))));
          blocks := blocks || jsonb_build_array(jsonb_build_object('type', 'notes', 'title', block->>'title', 'entity', entity_id, 'field', 'text'));
          records := records || jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'entity', entity_id, 'values', jsonb_build_object('text', btrim(block->>'text'))));
        ELSIF block->>'type' = 'checklist' THEN
          entity_id := 'checklist-' || block_index;
          entities := entities || jsonb_build_array(jsonb_build_object('id', entity_id, 'name', block->>'title', 'fields', jsonb_build_array(
            jsonb_build_object('id', 'label', 'name', 'Item', 'type', 'text', 'required', true, 'maxLength', 200),
            jsonb_build_object('id', 'done', 'name', 'Done', 'type', 'boolean', 'required', false))));
          blocks := blocks || jsonb_build_array(jsonb_build_object('type', 'checklist', 'title', block->>'title', 'entity', entity_id, 'labelField', 'label', 'doneField', 'done'));
          FOR item IN SELECT value FROM jsonb_array_elements(block->'items') LOOP
            records := records || jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'entity', entity_id, 'values', jsonb_build_object('label', item->>'label', 'done', item->'done')));
          END LOOP;
        ELSE
          entity_id := 'links-' || block_index;
          entities := entities || jsonb_build_array(jsonb_build_object('id', entity_id, 'name', block->>'title', 'fields', jsonb_build_array(
            jsonb_build_object('id', 'label', 'name', 'Label', 'type', 'text', 'required', true, 'maxLength', 200),
            jsonb_build_object('id', 'url', 'name', 'URL', 'type', 'url', 'required', true))));
          blocks := blocks || jsonb_build_array(jsonb_build_object('type', 'links', 'title', block->>'title', 'entity', entity_id, 'labelField', 'label', 'urlField', 'url'));
          FOR item IN SELECT value FROM jsonb_array_elements(block->'items') LOOP
            records := records || jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'entity', entity_id, 'values', jsonb_build_object('label', item->>'label', 'url', item->>'url')));
          END LOOP;
        END IF;
      END LOOP;

      settings := CASE WHEN module ? 'category' THEN jsonb_build_object('category', module->>'category') ELSE '{}'::jsonb END;
      INSERT INTO public.project_module_packages (project_id, module_id, manifest, records, settings)
      VALUES (project.id, target_id, jsonb_build_object(
          'manifestVersion', 1, 'id', target_id, 'name', module->>'title', 'version', '1.0.0',
          'author', jsonb_build_object('name', 'Project'),
          'engine', jsonb_build_object('minVersion', '1.1.0'),
          'permissions', jsonb_build_array('module-data:read', 'module-data:write'),
          'entities', entities,
          'views', jsonb_build_array(jsonb_build_object('id', 'page', 'name', module->>'title', 'type', 'page', 'blocks', blocks)),
          'dataVersion', 1, 'migrations', '[]'::jsonb,
          'lifecycle', jsonb_build_object('install', 'declarative', 'enable', 'immediate', 'disable', 'immediate', 'uninstall', 'retain_data')
        ) || CASE WHEN coalesce(module->>'description', '') <> '' THEN jsonb_build_object('description', module->>'description') ELSE '{}'::jsonb END,
        records, settings);
    END LOOP;
  END LOOP;
END
$$;

ALTER TABLE public.project_module_packages ENABLE TRIGGER module_package_limit;


COMMIT;
