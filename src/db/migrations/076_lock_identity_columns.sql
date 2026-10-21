-- ============================================================
-- GUIDON - MIGRACJA 076
-- Kolumny tożsamości tylko do odczytu dla użytkownika
-- ============================================================
--
-- Uruchomic PO 075.
--
-- 001 nadał rolom authenticated UPDATE na całych tabelach profiles i
-- task_comments, a polityki RLS sprawdzają tylko "to mój wiersz". W trybie
-- hostowanym PostgREST przyjmuje UPDATE wprost z przeglądarki (klucz anon +
-- sesja), więc każdy mógł:
-- - wpisać sobie dowolny profiles.email - a panel administratora
--   (src/lib/data/admin-access.ts) porównywał właśnie ten adres z
--   ADMIN_EMAILS;
-- - przenieść własny komentarz (task_comments.task_id) do zadania, którego
--   nie może komentować, albo nadać mu actor_label agenta.
--
-- Teraz UPDATE tylko na kolumnach, które aplikacja naprawdę zmienia:
-- profiles: full_name, avatar_url, locale, pinned_project_ids (065),
-- pinned_task_ids (074); task_comments: content. Adres e-mail zmienia
-- wyłącznie Supabase Auth / logowanie lokalne (service role / trigger).
-- Triggery updated_at działają dalej - nie potrzebują uprawnień do kolumn.
-- ============================================================

BEGIN;


REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, avatar_url, locale, pinned_project_ids, pinned_task_ids)
    ON public.profiles TO authenticated;

REVOKE UPDATE ON public.task_comments FROM authenticated;
GRANT UPDATE (content) ON public.task_comments TO authenticated;


COMMIT;
