-- ============================================================
-- GUIDON - MIGRACJA 015
-- plans + subscriptions: Free/Pro/Team/Business (TODO §10-13)
-- ============================================================
--
-- Uruchomić PO 014.
--
-- POWÓD
-- -----
-- Zero istniejącego kodu billingowego (grep po "stripe"/"subscription"/
-- "billing" w całym repo - nic). Ta migracja dodaje realny schemat planów
-- i subskrypcji, budowany wokół istniejącego organizations.project_limit
-- (migracja 014), nie zamiast niego.
--
-- Free zmienia się z dzisiejszego project_limit DEFAULT 1 na 2 - patrz
-- docs/superpowers/specs/2026-08-22-subscriptions-design.md, potwierdzone
-- z użytkownikiem wprost. Istniejące organizacje NIE są retroaktywnie
-- dotykane - to zmiana DEFAULT dla nowych wierszy, nie migracja danych.
--
-- BEZPIECZEŃSTWO: subscriptions ma zero polityk INSERT/UPDATE/DELETE dla
-- authenticated - dokładnie ta sama lekcja co project_limit w 014: gdyby
-- właściciel organizacji mógł UPDATE własną subskrypcję, mógłby się sam
-- awansować na dowolny plan za darmo. Jedyna legalna ścieżka zapisu to
-- service_role (panel admina).
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.plans (
    id                      text        NOT NULL PRIMARY KEY,
    name                    text        NOT NULL,
    price_cents             integer     NOT NULL CHECK (price_cents >= 0),
    project_limit           integer,
    task_limit_per_project  integer,
    storage_limit_bytes     bigint,
    ai_request_limit        integer,
    has_ai_features         boolean     NOT NULL DEFAULT false,
    has_github_integration  boolean     NOT NULL DEFAULT false,
    has_advanced_analytics  boolean     NOT NULL DEFAULT false,
    has_team_roles          boolean     NOT NULL DEFAULT false,
    has_audit_logs          boolean     NOT NULL DEFAULT false,
    has_priority_support    boolean     NOT NULL DEFAULT false,
    stripe_price_id         text,
    sort_order              integer     NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now()
);


-- Storage limits are written as X::bigint * 1024 * 1024 * 1024 rather than
-- bare integer literals - Postgres evaluates a bare `10 * 1024 * 1024 * 1024`
-- as int4 arithmetic and overflows before it ever reaches the bigint
-- column; casting the first factor forces bigint arithmetic throughout.
INSERT INTO public.plans (id, name, price_cents, project_limit, task_limit_per_project, storage_limit_bytes, ai_request_limit, has_ai_features, has_github_integration, has_advanced_analytics, has_team_roles, has_audit_logs, has_priority_support, sort_order)
VALUES
    ('free', 'Free', 0, 2, 50, 500::bigint * 1024 * 1024, NULL, false, false, false, false, false, false, 0),
    ('pro', 'Pro', 899, 10, 1000, 10::bigint * 1024 * 1024 * 1024, 500, true, true, true, false, false, false, 1),
    ('team', 'Team', 1999, NULL, 10000, 50::bigint * 1024 * 1024 * 1024, 2000, true, true, true, true, false, false, 2),
    ('business', 'Business', 4999, NULL, NULL, 200::bigint * 1024 * 1024 * 1024, NULL, true, true, true, true, true, true, 3)
ON CONFLICT (id) DO NOTHING;


CREATE TABLE IF NOT EXISTS public.subscriptions (
    id                      uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id         uuid        NOT NULL UNIQUE,
    plan_id                 text        NOT NULL DEFAULT 'free',
    status                  text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
    stripe_customer_id      text,
    stripe_subscription_id  text,
    current_period_start    timestamptz NOT NULL DEFAULT now(),
    current_period_end      timestamptz,
    cancel_at_period_end    boolean     NOT NULL DEFAULT false,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);


ALTER TABLE public.subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_organization_id_fkey;

ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_organization_id_fkey
        FOREIGN KEY (organization_id)
            REFERENCES public.organizations(id)
            ON DELETE CASCADE;


ALTER TABLE public.subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_plan_id_fkey;

ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey
        FOREIGN KEY (plan_id)
            REFERENCES public.plans(id);


CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();


-- New organizations get a Free subscription automatically - same pattern
-- as on_organization_created (001) creating the owner membership, added
-- as a second, independent trigger.
CREATE FUNCTION private.handle_new_organization_subscription()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.subscriptions (organization_id, plan_id)
    VALUES (NEW.id, 'free');
    RETURN NEW;
END;
$$;


CREATE TRIGGER on_organization_created_subscription
    AFTER INSERT ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION private.handle_new_organization_subscription();


-- Free plan's project_limit, for organizations created from here on.
-- Existing organizations' values are NOT touched.
ALTER TABLE public.organizations ALTER COLUMN project_limit SET DEFAULT 2;


ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS plans_select ON public.plans;
CREATE POLICY plans_select
ON public.plans
FOR SELECT
TO authenticated
USING (true);


DROP POLICY IF EXISTS subscriptions_select ON public.subscriptions;
CREATE POLICY subscriptions_select
ON public.subscriptions
FOR SELECT
TO authenticated
USING (private.is_org_member(organization_id));


GRANT SELECT ON public.plans TO authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO service_role;


COMMIT;
