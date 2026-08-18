-- ============================================================
-- GUIDON — WARSTWA ZGODNOŚCI Z SUPABASE
-- (TODO.md §4 "PostgreSQL compatibility as a strategic goal";
--  docs/self-hosting-audit.md, bloker 2)
-- ============================================================
--
-- CO TO JEST
-- ----------
-- Schemat Guidona opiera się na prymitywach, które na Supabase
-- istnieją z góry, a na czystym PostgreSQL nie istnieją wcale:
--
--   auth.uid()                47 wystąpień w migracjach
--   auth.users                 9 wystąpień (klucz obcy profiles.id)
--   TO authenticated          97 polityk RLS
--   TO anon / FROM anon       15 uprawnień
--   request.jwt.claims         private.is_service_role() z 006
--
-- Ten plik odtwarza je jako zwykłe obiekty PostgreSQL, dzięki czemu
-- 70 polityk RLS działa BEZ ŻADNEJ ZMIANY na obu bazach. Alternatywą
-- byłoby przepisanie tych polityk — czyli dwie rozjeżdżające się
-- wersje zabezpieczeń. Jedna definicja jest bezpieczniejsza.
--
--
-- DLACZEGO TO NIE JEST MIGRACJA
-- -----------------------------
-- Migracja 000 zakłada już istnienie auth.users (klucz obcy), a 001
-- ról anon/authenticated. Warstwa zgodności musi więc powstać PRZED
-- pierwszą migracją, a nie po ostatniej — numer 009 byłby zbyt późny.
-- To provisioning infrastruktury, nie historia schematu.
--
-- Runner (scripts/migrate.mjs) stosuje ten plik wyłącznie wtedy, gdy
-- auth.uid() NIE istnieje. Na Supabase istnieje, więc plik nie jest
-- nawet czytany — produkcyjna baza nie jest dotykana w żaden sposób.
--
--
-- MODEL BEZPIECZEŃSTWA
-- --------------------
-- Na Supabase tożsamość pochodzi z JWT weryfikowanego przez PostgREST.
-- Tutaj GUC `request.jwt.claims` ustawia kod serwerowy w transakcji
-- (src/lib/db/session.ts) — a ustawić go może WYŁĄCZNIE kod serwerowy,
-- bo przeglądarka nie ma połączenia z bazą. To jest warunek konieczny
-- i on właśnie czyni tę warstwę bezpieczną, a nie samo SQL.
--
-- IDEMPOTENTNY: można uruchomić wielokrotnie.
-- ============================================================

BEGIN;


-- ============================================================
-- 1. ROLE
-- ============================================================
--
-- Odpowiedniki ról Supabase. NOINHERIT jest istotne: rola aplikacji
-- dostaje je przez GRANT, ale uprawnienia zyskuje dopiero po jawnym
-- SET ROLE. Bez NOINHERIT połączenie miałoby sumę uprawnień wszystkich
-- trzech ról od razu — w tym service_role z BYPASSRLS.
--
-- service_role z BYPASSRLS odtwarza semantykę Supabase, gdzie klucz
-- serwisowy omija RLS. Uwaga: private.is_service_role() z 006 czyta
-- claim z JWT, a nie rolę bazy — oba mechanizmy muszą istnieć, bo
-- migracje 005-007 zakładają pierwszy, a uprawnienia tabel drugi.
-- ============================================================

DO $$
BEGIN

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    END IF;

END
$$;


-- Rola łącząca się z bazą musi móc wejść w każdą z nich przez SET ROLE.
-- Bez tego session.ts nie zdoła zejść z uprawnień właściciela bazy,
-- a RLS byłoby omijane przy każdym zapytaniu.
GRANT anon, authenticated, service_role TO CURRENT_USER;


-- ============================================================
-- 2. SCHEMAT AUTH
-- ============================================================

CREATE SCHEMA IF NOT EXISTS auth;

GRANT USAGE ON SCHEMA auth   TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;


-- ============================================================
-- 3. AUTH.USERS
-- ============================================================
--
-- Minimalny odpowiednik tabeli Supabase. Kolumny ograniczone do tych,
-- których schemat faktycznie używa:
--
--   id                  -> profiles.id (FK, ON DELETE CASCADE)
--   email               -> private.handle_new_user()
--   raw_user_meta_data  -> full_name, avatar_url w tym samym triggerze
--
-- Reszta (hasło, potwierdzenie e-maila, znaczniki czasu) to miejsce na
-- system uwierzytelniania z §8. Nie jest tu implementowany — kolumny
-- istnieją, żeby późniejsze dodanie go nie wymagało zmiany klucza
-- obcego, na którym wisi cały schemat.
--
-- gen_random_uuid() jest wbudowane od PostgreSQL 13, więc ta tabela
-- nie potrzebuje pgcrypto (000 i tak je włącza dla reszty schematu).
-- ============================================================

CREATE TABLE IF NOT EXISTS auth.users (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email              text        UNIQUE,
    encrypted_password text,
    email_confirmed_at timestamptz,
    raw_user_meta_data jsonb       NOT NULL DEFAULT '{}'::jsonb,
    raw_app_meta_data  jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);


-- Tabela tożsamości nie jest odpytywana przez aplikację — profile
-- publiczne żyją w public.profiles. RLS włączone BEZ POLITYK oznacza
-- "odmów wszystkim poza właścicielem i BYPASSRLS", co jest tu
-- pożądanym stanem domyślnym.
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON auth.users FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 4. AUTH.JWT()
-- ============================================================
--
-- Zwraca komplet oświadczeń ustawionych na transakcję. Ładunek nie
-- jest gwarantowany jako poprawny JSON (GUC to zwykły tekst), a błąd
-- parsowania wewnątrz polityki RLS przerwałby zapytanie zamiast je
-- odrzucić. Dlatego wyjątek jest połykany i zwracany jest NULL —
-- "brak tożsamości", czyli bezpieczna odmowa.
-- ============================================================

CREATE OR REPLACE FUNCTION auth.jwt()
    RETURNS jsonb
    LANGUAGE plpgsql
    STABLE
SET search_path = ''
AS $$
DECLARE
    v_claims text;
BEGIN

    v_claims := current_setting('request.jwt.claims', true);

    IF v_claims IS NULL OR v_claims = '' THEN
        RETURN NULL;
    END IF;

    BEGIN
        RETURN v_claims::jsonb;
    EXCEPTION WHEN others THEN
        RETURN NULL;
    END;

END;
$$;


-- ============================================================
-- 5. AUTH.UID()
-- ============================================================
--
-- Serce warstwy: 47 odwołań w migracjach i 70 polityk RLS zależy od
-- tej jednej funkcji. Semantyka zgodna z Supabase — `sub` z JWT jako
-- uuid, NULL gdy brak sesji.
--
-- Niepoprawny uuid w `sub` również daje NULL, a nie błąd: polityka ma
-- odmówić dostępu, nie wywrócić zapytanie.
-- ============================================================

CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE plpgsql
    STABLE
SET search_path = ''
AS $$
DECLARE
    v_sub text;
BEGIN

    v_sub := auth.jwt() ->> 'sub';

    IF v_sub IS NULL OR v_sub = '' THEN
        RETURN NULL;
    END IF;

    BEGIN
        RETURN v_sub::uuid;
    EXCEPTION WHEN others THEN
        RETURN NULL;
    END;

END;
$$;


-- ============================================================
-- 6. AUTH.ROLE()
-- ============================================================
--
-- Nieużywane dziś przez żadną politykę, ale to część kontraktu
-- Supabase i kod przenoszony z tamtej strony może po nie sięgnąć.
-- ============================================================

CREATE OR REPLACE FUNCTION auth.role()
    RETURNS text
    LANGUAGE plpgsql
    STABLE
SET search_path = ''
AS $$
BEGIN
    RETURN auth.jwt() ->> 'role';
END;
$$;


-- ============================================================
-- 7. UPRAWNIENIA DO FUNKCJI
-- ============================================================
--
-- Polityki RLS wołają auth.uid() w kontekście roli wywołującego, więc
-- każda rola aplikacyjna musi mieć EXECUTE. anon też — polityki są
-- ewaluowane, zanim okaże się, że nic nie zwrócą.
-- ============================================================

GRANT EXECUTE ON FUNCTION auth.jwt()  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid()  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;


-- ============================================================
-- 8. UPRAWNIENIA TABELOWE DLA SERVICE_ROLE
-- ============================================================
--
-- BYPASSRLS pomija polityki, ale NIE nadaje uprawnień. Bez tej sekcji
-- withServiceRole() dostaje "permission denied for table ..." przy
-- każdej tabeli — migracja 001 nadaje uprawnienia wyłącznie roli
-- `authenticated`, bo na Supabase service_role dostaje je z domyślnych
-- uprawnień skonfigurowanych przez platformę.
--
-- Wykryte dopiero przy uruchomieniu; sam SQL wyglądał poprawnie.
--
-- ALTER DEFAULT PRIVILEGES działa na obiekty tworzone PÓŹNIEJ przez tę
-- samą rolę — czyli na wszystkie 16 tabel, bo warstwa zgodności
-- powstaje przed migracją 000. Jawny GRANT poniżej obejmuje przypadek
-- ponownego uruchomienia na gotowej bazie, gdzie tabele już istnieją.
-- ============================================================

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;


COMMIT;
