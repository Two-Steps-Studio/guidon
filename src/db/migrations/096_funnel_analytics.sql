-- ============================================================
-- GUIDON - MIGRACJA 096
-- Lejek: rejestracja -> aktywacja -> subskrypcja, bez cookies i bez PII
-- ============================================================
--
-- Uruchomic PO 071 (subscriptions.trial_used_at itd.).
--
-- KONTEKST
-- --------
-- Google Analytics zostalo usuniete (polityka cookies: zadnej opcjonalnej
-- analityki bez zgody). Lejek liczy sie wiec z danych, ktore aplikacja juz
-- ma, i tylko jako agregaty:
--
-- * funnel_cta_counts - dzienny licznik klikniec CTA na stronie glownej
--   (dzien, nazwa CTA, liczba). Bez identyfikatora, IP, cookies ani
--   czegokolwiek w przegladarce - nie wymaga zgody. Zapis tylko przez
--   public.record_funnel_cta (service_role, wola go /api/funnel/cta).
-- * subscriptions.checkout_started_at - kiedy organizacja pierwszy raz
--   otworzyla checkout (dane organizacji, nie osoby).
-- * public.admin_funnel_cohorts(p_weeks) - tygodniowe kohorty rejestracji
--   i ile z nich doszlo do kazdego kroku. Zwraca same liczby; konta z
--   domeny .example.test (testy) sa pominiete. Tylko service_role (panel
--   admina /admin/funnel).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.funnel_cta_counts (
    day   date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
    cta   text NOT NULL CHECK (cta ~ '^[a-z][a-z0-9-]{0,39}$'),
    count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
    PRIMARY KEY (day, cta)
);
ALTER TABLE public.funnel_cta_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.funnel_cta_counts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funnel_cta_counts TO service_role;

CREATE OR REPLACE FUNCTION public.record_funnel_cta(p_cta text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    INSERT INTO public.funnel_cta_counts (day, cta, count)
    VALUES ((now() AT TIME ZONE 'utc')::date, p_cta, 1)
    ON CONFLICT (day, cta) DO UPDATE SET count = public.funnel_cta_counts.count + 1;
$$;
REVOKE ALL ON FUNCTION public.record_funnel_cta(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_funnel_cta(text) TO service_role;

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS checkout_started_at timestamptz;

CREATE OR REPLACE FUNCTION public.admin_funnel_cohorts(p_weeks integer DEFAULT 8)
RETURNS TABLE (
    week date,
    signed_up integer,
    created_project integer,
    created_task integer,
    connected_integration integer,
    started_checkout integer,
    paid integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH cohort AS (
        SELECT u.id, date_trunc('week', u.created_at AT TIME ZONE 'utc')::date AS week
        FROM auth.users u
        WHERE u.created_at >= date_trunc('week', now() AT TIME ZONE 'utc') - make_interval(weeks => LEAST(GREATEST(COALESCE(p_weeks, 8), 1), 52) - 1)
          AND COALESCE(u.email, '') NOT LIKE '%.example.test'
    ),
    owned AS (
        -- Organizations the person owns: where checkout and payment happen.
        SELECT c.id AS user_id, s.checkout_started_at, s.status, s.stripe_subscription_id
        FROM cohort c
        JOIN public.organization_members m ON m.user_id = c.id AND m.role = 'owner'
        JOIN public.subscriptions s ON s.organization_id = m.organization_id
    ),
    steps AS (
        SELECT c.week,
            EXISTS (SELECT 1 FROM public.projects p WHERE p.created_by = c.id) AS project,
            EXISTS (SELECT 1 FROM public.tasks t WHERE t.created_by = c.id) AS task,
            (EXISTS (SELECT 1 FROM public.api_keys k WHERE k.user_id = c.id)
             OR EXISTS (SELECT 1 FROM public.oauth_grants g WHERE g.user_id = c.id)
             OR EXISTS (SELECT 1 FROM public.github_connections h WHERE h.connected_by = c.id)
             OR EXISTS (SELECT 1 FROM public.discord_integrations d WHERE d.linked_by = c.id)
             OR EXISTS (SELECT 1 FROM public.organization_webhooks w WHERE w.created_by = c.id)) AS integration,
            EXISTS (SELECT 1 FROM owned o WHERE o.user_id = c.id AND (o.checkout_started_at IS NOT NULL OR o.stripe_subscription_id IS NOT NULL)) AS checkout,
            EXISTS (SELECT 1 FROM owned o WHERE o.user_id = c.id AND o.stripe_subscription_id IS NOT NULL AND o.status = 'active') AS paid
        FROM cohort c
    )
    SELECT week,
        count(*)::integer,
        count(*) FILTER (WHERE project)::integer,
        count(*) FILTER (WHERE task)::integer,
        count(*) FILTER (WHERE integration)::integer,
        count(*) FILTER (WHERE checkout)::integer,
        count(*) FILTER (WHERE paid)::integer
    FROM steps
    GROUP BY week
    ORDER BY week DESC;
$$;
REVOKE ALL ON FUNCTION public.admin_funnel_cohorts(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_funnel_cohorts(integer) TO service_role;

COMMIT;
