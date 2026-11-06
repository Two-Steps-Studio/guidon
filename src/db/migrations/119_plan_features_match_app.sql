-- ============================================================
-- GUIDON - MIGRACJA 119
-- Funkcje planów zgodne z tym, co aplikacja naprawdę robi
-- ============================================================
--
-- Uruchomić PO 118.
--
-- POWÓD
-- -----
-- Cennik (landing, /pricing.md, billing) wypisywał przy planach płatnych
-- funkcje z plans.has_*, ale aplikacja żadnej z tych flag nie sprawdza:
--   - AI (API, MCP) i integracja z GitHubem działają na każdym planie,
--   - role w zespole (owner/admin/member) ma każda organizacja,
--   - "zaawansowanej analityki" ani dziennika audytu dla organizacji nie ma.
-- Klient płaciłby za coś, co ma za darmo, albo za coś, czego nie ma.
--
-- Decyzja właściciela (2026-11-06): AI i GitHub są dla wszystkich, plany
-- płatne różnią się limitami (projekty, zadania, osoby, miejsce na pliki)
-- i wsparciem. Flagi niezbudowanych funkcji są wyłączone, aż powstaną.
--
-- Tylko dane w public.plans; schemat i polityki bez zmian. Idempotentna.
-- ============================================================

UPDATE public.plans
SET has_ai_features        = true,
    has_github_integration = true,
    has_team_roles         = true,
    has_advanced_analytics = false,
    has_audit_logs         = false;
