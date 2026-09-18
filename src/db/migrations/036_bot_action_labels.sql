-- ============================================================
-- GUIDON - MIGRACJA 036
-- Discord bot: etykieta pochodzenia akcji (bot vs czlowiek)
-- ============================================================
--
-- Uruchomic PO 035.
--
-- Cel: dzialania/komentarze wykonane przez discord-bot/ przez /api/v1
-- (kluczem z linkDiscordGuildViaOAuth, src/lib/data/discord-integration.ts)
-- dzis wygladaja jak dzialania osoby, ktora polaczyla serwer z projektem -
-- jej user_id/author_id trafia do activity_logs/task_comments i UI pokazuje
-- jej imie. api_keys.user_id / task_comments.author_id / activity_logs.user_id
-- ZOSTAJA bez zmian - to jest realna podstawa RLS (WITH CHECK sprawdza
-- faktyczna role tej osoby w projekcie) i realny log audytowy "czyj klucz
-- tego uzyl". Te trzy nowe kolumny to WYLACZNIE etykieta do WYSWIETLENIA,
-- ustawiana tylko gdy zapytanie przyszlo przez klucz API oznaczony jako
-- nalezacy do bota (api_keys.bot_label) - NULL wszedzie indziej, czyli
-- dokladnie dzisiejsze zachowanie.
--
-- Brak nowych polityk RLS: trzy zwykle nullable kolumny na istniejacych
-- tabelach, objete istniejacymi GRANTami (api_keys' kolumnowy
-- GRANT UPDATE (revoked_at) nie ogranicza INSERT, ktory jest table-level).
-- ============================================================

BEGIN;


ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS bot_label text;
ALTER TABLE public.task_comments ADD COLUMN IF NOT EXISTS actor_label text;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS actor_label text;


COMMIT;
