-- ============================================================
-- GUIDON - MIGRACJA 099
-- Osobiste ukrycie funkcji AI (profiles.hide_ai)
-- ============================================================
--
-- Uruchomić PO 098.
--
-- KONTEKST
-- --------
-- Guidon jest przede wszystkim dla ludzi, AI jest dodatkiem. Kto nie chce
-- AI, wyłącza je u siebie w profilu: znikają przyciski i widżety AI
-- (czat, „Connect your agent”, zadania startowe dla agenta, kopiowanie
-- kontekstu dla agenta) we wszystkich projektach - tylko dla tej osoby.
-- To ustawienie osoby, jak locale (031) i przypięcia (065), więc siedzi w
-- profilu. Nie zmienia uprawnień: agenci podłączeni kluczem albo OAuth
-- działają dalej. Projektowy wyłącznik projects.ai_enabled (046) wyłącza
-- AI dla wszystkich w projekcie; ten - tylko widok jednej osoby.
-- ============================================================

BEGIN;


ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS hide_ai boolean NOT NULL DEFAULT false;

-- Kolumny, które właściciel profilu może zmieniać (076): dochodzi hide_ai.
GRANT UPDATE (hide_ai) ON public.profiles TO authenticated;


COMMIT;
