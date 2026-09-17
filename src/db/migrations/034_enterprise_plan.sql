-- ============================================================
-- GUIDON - MIGRACJA 034
-- Piaty plan: Enterprise
-- ============================================================
--
-- Uruchomic PO 033.
--
-- KONTEKST
-- --------
--
-- Business (015) juz ma project_limit = NULL i task_limit_per_project = NULL
-- (nielimitowane) oraz wszystkie 6 flag funkcji ustawionych na true - wiec
-- jedyna dzwignia, ktora realnie rozroznia Enterprise od Business w
-- istniejacym schemacie, to storage_limit_bytes: Business zostaje przy
-- swoim dotychczasowym limicie 200GB, Enterprise usuwa go calkowicie
-- (NULL, ta sama konwencja "NULL = bez limitu" co reszta tabeli).
--
-- Enterprise nie ma sztywnej ceny ("Skontaktuj sie z nami" zamiast kwoty na
-- stronie) - stad price_cents NOT NULL musi zniknac. CHECK (price_cents >= 0)
-- z 015 przechodzi automatycznie dla NULL (standardowa semantyka CHECK w
-- Postgresie), wiec nie trzeba go zmieniac. price_pln_cents byl juz
-- nullable od 019 (plan bez wpisu w tej migracji po prostu nie mial ceny
-- PLN) - teraz to samo pole ponownie oznacza "brak ustalonej ceny", tym
-- razem celowo, nie przez pominiecie.
-- ============================================================

BEGIN;

ALTER TABLE public.plans ALTER COLUMN price_cents DROP NOT NULL;

INSERT INTO public.plans (
    id, name, price_cents, price_pln_cents, project_limit, task_limit_per_project,
    storage_limit_bytes, ai_request_limit, has_ai_features, has_github_integration,
    has_advanced_analytics, has_team_roles, has_audit_logs, has_priority_support, sort_order
)
VALUES (
    'enterprise', 'Enterprise', NULL, NULL, NULL, NULL,
    NULL, NULL, true, true,
    true, true, true, true, 4
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
