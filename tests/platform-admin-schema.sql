-- Run against a disposable database after migration 108.
BEGIN;

DO $$
DECLARE
  app_role text;
  table_name text;
BEGIN
  FOREACH app_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH table_name IN ARRAY ARRAY['platform_admin_grants', 'platform_admin_sessions', 'platform_admin_audit_events'] LOOP
      IF has_table_privilege(app_role, 'public.' || table_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
        RAISE EXCEPTION '% has unexpected access to %', app_role, table_name;
      END IF;
    END LOOP;
  END LOOP;

  IF has_table_privilege('service_role', 'public.platform_admin_grants', 'INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'Service role can change platform admin grants';
  END IF;
  IF has_table_privilege('service_role', 'public.platform_admin_audit_events', 'UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'Audit events are not append-only for the service role';
  END IF;
  IF has_column_privilege('service_role', 'public.platform_admin_sessions', 'verified_at', 'UPDATE') THEN
    RAISE EXCEPTION 'Service role can rewrite original session verification time';
  END IF;
END $$;

INSERT INTO auth.users (id, email) VALUES ('33333333-3333-4333-8333-333333333333', 'admin-schema@guidon.example.test');
INSERT INTO public.platform_admin_grants (user_id, role)
VALUES ('33333333-3333-4333-8333-333333333333', 'read_only');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.platform_admin_grants (user_id, role)
    VALUES ('33333333-3333-4333-8333-333333333333', 'super_admin');
    RAISE EXCEPTION 'Two active grants were accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

SET LOCAL ROLE service_role;
INSERT INTO public.platform_admin_audit_events (actor_id, action, target_type, outcome, request_id)
VALUES ('33333333-3333-4333-8333-333333333333', 'users.read', 'user', 'succeeded', gen_random_uuid());
SELECT id FROM public.platform_admin_audit_events WHERE action = 'users.read';
RESET ROLE;

ROLLBACK;
