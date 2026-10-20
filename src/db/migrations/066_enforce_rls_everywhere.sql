-- ============================================================
-- GUIDON - MIGRACJA 066
-- RLS wlaczone na kazdej tabeli w schemacie public
-- ============================================================
--
-- Uruchomic PO 065. Bezpieczna do ponownego uruchomienia i niezalezna od
-- reszty - na produkcji mozna ja puscic od razu.
--
-- KONTEKST
-- --------
-- Zgloszenie: po 064 dalej widac projekty innych osob ("puste").
-- Polityki RLS (001 i dalej) dzialaja tylko na tabeli, ktora ma WLACZONE
-- row level security. Tabela z wylaczonym RLS (np. stworzona albo
-- przywrocona recznie w panelu Supabase, wylaczona przyciskiem "Disable
-- RLS", albo baza, na ktorej 001 nie przeszlo w calosci) jest czytelna dla
-- KAZDEGO, kto ma GRANT SELECT - a authenticated ma go na wszystkich
-- tabelach aplikacji. Projekty widoczne, a ich zadania puste, to dokladnie
-- obraz "projects bez RLS, tasks z RLS".
--
-- Ta migracja wlacza RLS na wszystkich zwyklych tabelach w public.
-- Wlascicielowi tabel (migracje) i service_role (serwer) to nic nie
-- zmienia - omijaja RLS z definicji. Tabela bez zadnej polityki staje sie
-- po prostu niedostepna przez API dla anon/authenticated, czyli tak, jak
-- ma byc (np. promo_codes, stripe_webhook_events, guidon_migrations).
-- ============================================================

BEGIN;


DO $$
DECLARE
    v_table record;
BEGIN
    FOR v_table IN
        SELECT c.relname
        FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace
          AND c.relkind IN ('r', 'p')
          AND NOT c.relrowsecurity
    LOOP
        RAISE NOTICE 'Enabling row level security on public.%', v_table.relname;
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table.relname);
    END LOOP;
END;
$$;


COMMIT;
