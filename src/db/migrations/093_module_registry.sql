-- ============================================================
-- GUIDON - MIGRACJA 093
-- Rejestr modułów: publikacja, przegląd, wycofanie, zgłoszenia
-- ============================================================
--
-- Uruchomić PO 092.
--
-- 081 dało katalog tylko do odczytu (publikował wyłącznie service role).
-- Teraz moduł publikuje jego autor:
--
-- - module_listings: kto "ma" identyfikator modułu (pierwsza publikacja go
--   zajmuje). Kolejne wersje publikuje właściciel albo owner/admin
--   organizacji, do której listing należy.
-- - module_catalog_entries (081) dostaje: visibility (private - tylko
--   autor, organization - członkowie organizacji, public - wszyscy po
--   przeglądzie), status (pending_review, published, rejected,
--   withdrawn), autora zgłoszenia, recenzenta, notatkę, licencję, digest
--   (SHA-256 manifestu, ustawiany triggerem przy wstawieniu) i podpis
--   serwera (Ed25519, MODULE_SIGNING_KEY - ustawia aplikacja).
-- - Wersja jest niezmienna od zgłoszenia: trigger odrzuca każdą zmianę
--   treści (manifest, opis, dane demo...) i każde DELETE opublikowanej
--   wersji, także przez service role. Zmienia się tylko status, przegląd
--   i podpis. Poprawka = nowa wersja.
-- - Prywatna i organizacyjna wersja jest opublikowana od razu; publiczna
--   czeka na przegląd admina instancji (ADMIN_EMAILS, przez service role:
--   public.review_module_version). Nikt nie zatwierdza własnego zgłoszenia
--   - pilnuje tego funkcja i CHECK w tabeli.
-- - Wycofanie (withdraw) chowa wersję z katalogu i instalacji; istniejące
--   instalacje działają dalej, projekt może zmienić wersję na inną.
-- - module_reports: zgłoszenie nadużycia (jedno otwarte na osobę i wersję),
--   widzi je zgłaszający i admin; autor tylko liczbę.
-- - module_registry_events: dziennik (tylko dopisywanie) - zgłoszenia,
--   decyzje, wycofania, raporty. Autor widzi wpisy swoich modułów.
-- - project_module_packages.catalog_version: z której wersji rejestru
--   pochodzi instalacja (trigger sprawdza, że taka opublikowana wersja
--   istnieje i pasuje do manifestu) - źródło liczników instalacji w panelu
--   autora (public.module_install_counts, tylko agregaty, tylko własne
--   moduły).
-- - notifications.type dostaje module_review (decyzja przeglądu).
-- ============================================================

BEGIN;


-- ---------- listings ----------
CREATE TABLE IF NOT EXISTS public.module_listings (
  module_id text PRIMARY KEY CHECK (module_id ~ '^[a-z][a-z0-9-]{0,63}$'),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS module_listings_owner_idx ON public.module_listings(owner_id);
CREATE INDEX IF NOT EXISTS module_listings_org_idx ON public.module_listings(organization_id);
ALTER TABLE public.module_listings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.module_listings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.module_listings TO authenticated;
GRANT ALL ON public.module_listings TO service_role;

-- Existing registry rows (the first-party release-planning) belong to nobody.
INSERT INTO public.module_listings (module_id)
SELECT DISTINCT module_id FROM public.module_catalog_entries
ON CONFLICT (module_id) DO NOTHING;


-- ---------- versions ----------
ALTER TABLE public.module_catalog_entries
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS license text NOT NULL DEFAULT 'Proprietary',
  ADD COLUMN IF NOT EXISTS digest text,
  ADD COLUMN IF NOT EXISTS signature text,
  ADD COLUMN IF NOT EXISTS signing_key_id text;

UPDATE public.module_catalog_entries SET status = CASE WHEN published THEN 'published' ELSE 'withdrawn' END,
  digest = encode(sha256(convert_to(manifest::text, 'UTF8')), 'hex');

ALTER TABLE public.module_catalog_entries
  ADD CONSTRAINT module_catalog_visibility_check CHECK (visibility IN ('private', 'organization', 'public')),
  ADD CONSTRAINT module_catalog_status_check CHECK (status IN ('pending_review', 'published', 'rejected', 'withdrawn')),
  ADD CONSTRAINT module_catalog_published_matches_status CHECK (published = (status = 'published')),
  ADD CONSTRAINT module_catalog_org_visibility CHECK (visibility <> 'organization' OR organization_id IS NOT NULL),
  ADD CONSTRAINT module_catalog_private_owner CHECK (visibility <> 'private' OR submitted_by IS NOT NULL),
  -- No one approves or rejects their own public submission. First-party rows
  -- (submitted_by NULL, inserted by a migration) have no submitter to compare.
  ADD CONSTRAINT module_catalog_no_self_review CHECK (
    visibility <> 'public' OR status NOT IN ('published', 'rejected') OR submitted_by IS NULL
    OR (reviewed_by IS NOT NULL AND reviewed_by <> submitted_by)
  ),
  ADD CONSTRAINT module_catalog_review_note_length CHECK (review_note IS NULL OR length(review_note) <= 2000),
  ADD CONSTRAINT module_catalog_license_check CHECK (license IN (
    'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MPL-2.0', 'GPL-3.0-only',
    'LGPL-3.0-only', 'AGPL-3.0-only', 'CC-BY-4.0', 'CC0-1.0', 'Unlicense', 'Proprietary'
  )),
  ADD CONSTRAINT module_catalog_signature_length CHECK (signature IS NULL OR length(signature) <= 200),
  ADD CONSTRAINT module_catalog_listing_fk FOREIGN KEY (module_id) REFERENCES public.module_listings(module_id);

CREATE INDEX IF NOT EXISTS module_catalog_status_idx ON public.module_catalog_entries(status) WHERE status = 'pending_review';
CREATE INDEX IF NOT EXISTS module_catalog_submitted_by_idx ON public.module_catalog_entries(submitted_by);

-- SHA-256 of the stored manifest (jsonb's canonical text), set on insert.
CREATE OR REPLACE FUNCTION private.module_version_digest()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.digest := encode(sha256(convert_to(NEW.manifest::text, 'UTF8')), 'hex');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.module_version_digest() FROM PUBLIC;
DROP TRIGGER IF EXISTS module_version_digest ON public.module_catalog_entries;
CREATE TRIGGER module_version_digest BEFORE INSERT ON public.module_catalog_entries
  FOR EACH ROW EXECUTE FUNCTION private.module_version_digest();
ALTER TABLE public.module_catalog_entries ALTER COLUMN digest SET NOT NULL;

-- Content is fixed from the moment a version is submitted.
CREATE OR REPLACE FUNCTION private.module_version_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published', 'withdrawn') THEN
      RAISE EXCEPTION 'A published module version cannot be deleted - withdraw it' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.module_id, NEW.version, NEW.manifest, NEW.demo_records, NEW.description, NEW.changelog, NEW.category,
      NEW.screenshots, NEW.organization_id, NEW.visibility, NEW.license, NEW.submitted_by, NEW.submitted_at, NEW.digest)
     IS DISTINCT FROM
     (OLD.module_id, OLD.version, OLD.manifest, OLD.demo_records, OLD.description, OLD.changelog, OLD.category,
      OLD.screenshots, OLD.organization_id, OLD.visibility, OLD.license, OLD.submitted_by, OLD.submitted_at, OLD.digest) THEN
    RAISE EXCEPTION 'Module versions are immutable - publish a new version' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'withdrawn' AND NEW.status <> 'withdrawn' THEN
    RAISE EXCEPTION 'A withdrawn module version stays withdrawn' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.module_version_immutable() FROM PUBLIC;
DROP TRIGGER IF EXISTS module_version_immutable ON public.module_catalog_entries;
CREATE TRIGGER module_version_immutable BEFORE UPDATE OR DELETE ON public.module_catalog_entries
  FOR EACH ROW EXECUTE FUNCTION private.module_version_immutable();

-- Who may see a version: its author always; others once published, by visibility.
CREATE OR REPLACE FUNCTION private.can_see_module_version(p_status text, p_visibility text, p_organization_id uuid, p_submitted_by uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (p_submitted_by IS NOT NULL AND p_submitted_by = (SELECT auth.uid()))
    OR (p_status = 'published' AND (
      p_visibility = 'public'
      OR (p_visibility = 'organization' AND private.is_org_member(p_organization_id))
    ));
$$;
REVOKE ALL ON FUNCTION private.can_see_module_version(text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_see_module_version(text, text, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS module_catalog_read ON public.module_catalog_entries;
CREATE POLICY module_catalog_read ON public.module_catalog_entries FOR SELECT TO authenticated
  USING (private.can_see_module_version(status, visibility, organization_id, submitted_by));

DROP POLICY IF EXISTS module_listings_read ON public.module_listings;
CREATE POLICY module_listings_read ON public.module_listings FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid())
    OR (organization_id IS NOT NULL AND private.is_org_member(organization_id))
    OR EXISTS (SELECT 1 FROM public.module_catalog_entries e WHERE e.module_id = module_listings.module_id));


-- ---------- audit log ----------
CREATE TABLE IF NOT EXISTS public.module_registry_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module_id text NOT NULL REFERENCES public.module_listings(module_id),
  version text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('submitted', 'published', 'approved', 'rejected', 'withdrawn', 'reported', 'report_resolved', 'signed')),
  note text CHECK (note IS NULL OR length(note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS module_registry_events_module_idx ON public.module_registry_events(module_id, created_at DESC);
ALTER TABLE public.module_registry_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.module_registry_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.module_registry_events TO authenticated;
GRANT SELECT, INSERT ON public.module_registry_events TO service_role;
DROP POLICY IF EXISTS module_registry_events_owner ON public.module_registry_events;
CREATE POLICY module_registry_events_owner ON public.module_registry_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.module_listings l WHERE l.module_id = module_registry_events.module_id
    AND (l.owner_id = (SELECT auth.uid()) OR (l.organization_id IS NOT NULL AND private.org_role(l.organization_id) IN ('owner', 'admin')))));

CREATE OR REPLACE FUNCTION private.module_registry_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'The module registry log is append-only' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION private.module_registry_append_only() FROM PUBLIC;
DROP TRIGGER IF EXISTS module_registry_append_only ON public.module_registry_events;
CREATE TRIGGER module_registry_append_only BEFORE UPDATE OR DELETE ON public.module_registry_events
  FOR EACH ROW EXECUTE FUNCTION private.module_registry_append_only();


-- ---------- reports ----------
CREATE TABLE IF NOT EXISTS public.module_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id text NOT NULL,
  version text NOT NULL,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('malicious', 'misleading', 'privacy', 'copyright', 'spam', 'other')),
  details text NOT NULL DEFAULT '' CHECK (length(details) <= 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  FOREIGN KEY (module_id, version) REFERENCES public.module_catalog_entries(module_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS module_reports_one_open ON public.module_reports(module_id, version, reporter_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS module_reports_open_idx ON public.module_reports(created_at) WHERE status = 'open';
ALTER TABLE public.module_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.module_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.module_reports TO authenticated;
GRANT ALL ON public.module_reports TO service_role;
DROP POLICY IF EXISTS module_reports_own ON public.module_reports;
CREATE POLICY module_reports_own ON public.module_reports FOR SELECT TO authenticated
  USING (reporter_id = (SELECT auth.uid()));


-- ---------- installations ----------
ALTER TABLE public.project_module_packages ADD COLUMN IF NOT EXISTS catalog_version text;
GRANT UPDATE (catalog_version) ON public.project_module_packages TO authenticated;

-- Backfill: an installation whose manifest is a registry version came from it.
UPDATE public.project_module_packages p SET catalog_version = p.manifest->>'version'
WHERE p.catalog_version IS NULL AND EXISTS (
  SELECT 1 FROM public.module_catalog_entries e WHERE e.module_id = p.module_id AND e.version = p.manifest->>'version');

CREATE OR REPLACE FUNCTION private.check_module_catalog_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.catalog_version IS NOT NULL AND (
    NEW.catalog_version IS DISTINCT FROM NEW.manifest->>'version'
    OR NOT EXISTS (SELECT 1 FROM public.module_catalog_entries e
      WHERE e.module_id = NEW.module_id AND e.version = NEW.catalog_version AND e.status IN ('published', 'withdrawn'))
  ) THEN
    RAISE EXCEPTION 'catalog_version must name the registry version of this manifest' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.check_module_catalog_version() FROM PUBLIC;
DROP TRIGGER IF EXISTS module_catalog_version_check ON public.project_module_packages;
CREATE TRIGGER module_catalog_version_check BEFORE INSERT OR UPDATE OF catalog_version, manifest ON public.project_module_packages
  FOR EACH ROW EXECUTE FUNCTION private.check_module_catalog_version();


-- ---------- notifications ----------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('task_assigned', 'module_review'));


-- ---------- functions ----------
-- Submit a version. Private/organization versions are published at once,
-- public ones wait for review. Returns the resulting status.
CREATE OR REPLACE FUNCTION public.submit_module_version(
  p_module_id text, p_version text, p_visibility text, p_organization_id uuid,
  p_category text, p_description text, p_changelog text, p_license text,
  p_manifest jsonb, p_demo_records jsonb DEFAULT '[]'::jsonb
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  listing public.module_listings;
  next_status text;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Sign in to publish modules' USING ERRCODE = '42501'; END IF;
  IF p_visibility NOT IN ('private', 'organization', 'public') THEN RAISE EXCEPTION 'Unknown visibility' USING ERRCODE = '22023'; END IF;
  IF p_visibility = 'organization' AND (p_organization_id IS NULL OR NOT private.is_org_member(p_organization_id)) THEN
    RAISE EXCEPTION 'Publish to an organization you belong to' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO listing FROM public.module_listings WHERE module_id = p_module_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.module_listings (module_id, owner_id, organization_id)
    VALUES (p_module_id, caller, CASE WHEN p_visibility = 'organization' THEN p_organization_id END)
    RETURNING * INTO listing;
  ELSIF NOT (listing.owner_id = caller OR (listing.organization_id IS NOT NULL AND private.org_role(listing.organization_id) IN ('owner', 'admin'))) THEN
    RAISE EXCEPTION 'This module id belongs to another publisher' USING ERRCODE = '42501';
  END IF;

  next_status := CASE WHEN p_visibility = 'public' THEN 'pending_review' ELSE 'published' END;
  INSERT INTO public.module_catalog_entries (module_id, version, organization_id, category, description, changelog, screenshots,
    manifest, demo_records, published, visibility, status, submitted_by, license)
  VALUES (p_module_id, p_version, CASE WHEN p_visibility = 'organization' THEN p_organization_id END, p_category, p_description,
    p_changelog, '{}', p_manifest, p_demo_records, next_status = 'published', p_visibility, next_status, caller, p_license);

  INSERT INTO public.module_registry_events (module_id, version, actor_id, action)
  VALUES (p_module_id, p_version, caller, CASE WHEN next_status = 'published' THEN 'published' ELSE 'submitted' END);
  RETURN next_status;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_module_version(text, text, text, uuid, text, text, text, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_module_version(text, text, text, uuid, text, text, text, text, jsonb, jsonb) TO authenticated;

-- The author (or an owner/admin of the listing's organization) withdraws a version.
CREATE OR REPLACE FUNCTION public.withdraw_module_version(p_module_id text, p_version text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  allowed boolean;
BEGIN
  SELECT (l.owner_id = caller OR e.submitted_by = caller OR (l.organization_id IS NOT NULL AND private.org_role(l.organization_id) IN ('owner', 'admin')))
  INTO allowed
  FROM public.module_catalog_entries e JOIN public.module_listings l ON l.module_id = e.module_id
  WHERE e.module_id = p_module_id AND e.version = p_version AND e.status <> 'withdrawn';
  IF caller IS NULL OR allowed IS NOT TRUE THEN RETURN false; END IF;
  UPDATE public.module_catalog_entries SET status = 'withdrawn', published = false WHERE module_id = p_module_id AND version = p_version;
  INSERT INTO public.module_registry_events (module_id, version, actor_id, action) VALUES (p_module_id, p_version, caller, 'withdrawn');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.withdraw_module_version(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_module_version(text, text) TO authenticated;

-- Report a version the caller can see. One open report per person and version.
CREATE OR REPLACE FUNCTION public.report_module_version(p_module_id text, p_version text, p_reason text, p_details text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := (SELECT auth.uid());
BEGIN
  IF caller IS NULL THEN RETURN 'not_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.module_catalog_entries e WHERE e.module_id = p_module_id AND e.version = p_version
      AND private.can_see_module_version(e.status, e.visibility, e.organization_id, e.submitted_by)) THEN
    RETURN 'not_found';
  END IF;
  INSERT INTO public.module_reports (module_id, version, reporter_id, reason, details)
  VALUES (p_module_id, p_version, caller, p_reason, coalesce(p_details, ''))
  ON CONFLICT (module_id, version, reporter_id) WHERE status = 'open' DO NOTHING;
  IF NOT FOUND THEN RETURN 'already_reported'; END IF;
  INSERT INTO public.module_registry_events (module_id, version, actor_id, action, note) VALUES (p_module_id, p_version, caller, 'reported', p_reason);
  RETURN 'reported';
END;
$$;
REVOKE ALL ON FUNCTION public.report_module_version(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_module_version(text, text, text, text) TO authenticated;

-- Instance admins (checked by the app, ADMIN_EMAILS) review through the service role.
CREATE OR REPLACE FUNCTION public.review_module_version(p_module_id text, p_version text, p_reviewer uuid, p_decision text, p_note text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE entry public.module_catalog_entries;
BEGIN
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'Unknown decision' USING ERRCODE = '22023'; END IF;
  SELECT * INTO entry FROM public.module_catalog_entries WHERE module_id = p_module_id AND version = p_version FOR UPDATE;
  IF NOT FOUND OR entry.status <> 'pending_review' THEN RETURN 'not_pending'; END IF;
  IF p_reviewer IS NULL OR entry.submitted_by = p_reviewer THEN RETURN 'self_review'; END IF;
  UPDATE public.module_catalog_entries
  SET status = CASE WHEN p_decision = 'approve' THEN 'published' ELSE 'rejected' END,
      published = p_decision = 'approve', reviewed_by = p_reviewer, reviewed_at = now(), review_note = nullif(btrim(coalesce(p_note, '')), '')
  WHERE module_id = p_module_id AND version = p_version;
  INSERT INTO public.module_registry_events (module_id, version, actor_id, action, note)
  VALUES (p_module_id, p_version, p_reviewer, CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END, nullif(btrim(coalesce(p_note, '')), ''));
  RETURN CASE WHEN p_decision = 'approve' THEN 'published' ELSE 'rejected' END;
END;
$$;
REVOKE ALL ON FUNCTION public.review_module_version(text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_module_version(text, text, uuid, text, text) TO service_role;

-- Author dashboard: installations per version of the caller's modules -
-- counts only, never which projects or organizations.
CREATE OR REPLACE FUNCTION public.module_install_counts()
RETURNS TABLE (module_id text, version text, installs bigint, open_reports bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.module_id, e.version,
    (SELECT count(*) FROM public.project_module_packages p WHERE p.module_id = e.module_id AND p.catalog_version = e.version AND p.installed),
    (SELECT count(*) FROM public.module_reports r WHERE r.module_id = e.module_id AND r.version = e.version AND r.status = 'open')
  FROM public.module_catalog_entries e
  JOIN public.module_listings l ON l.module_id = e.module_id
  WHERE l.owner_id = (SELECT auth.uid())
     OR (l.organization_id IS NOT NULL AND private.org_role(l.organization_id) IN ('owner', 'admin'));
$$;
REVOKE ALL ON FUNCTION public.module_install_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.module_install_counts() TO authenticated;


COMMIT;
