-- ============================================================
-- GUIDON - MIGRACJA 072
-- Idempotency-Key dla zapisow przez /api/v1 (i MCP)
-- ============================================================
--
-- Uruchomic PO 071.
--
-- KONTEKST
-- --------
-- Agent ponawia zapytanie po bledzie sieci. Bez klucza idempotencji
-- ponowione POST /projects/{id}/tasks tworzy drugie zadanie. Klient moze
-- teraz wyslac naglowek Idempotency-Key; pierwsza odpowiedz jest
-- zapisywana i ponowienie z tym samym kluczem dostaje ja jeszcze raz
-- (Idempotent-Replayed: true) zamiast wykonac zapis drugi raz
-- (src/lib/api/api-route.ts). Klucz zyje 24 godziny.
--
-- scope = sha256 calego naglowka Authorization - klucz jednego klienta
-- nigdy nie trafi na odpowiedz innego. request_hash = sha256(metoda +
-- sciezka + body): ten sam klucz z innym zapytaniem to blad 422.
-- status_code NULL = pierwsze zapytanie jeszcze trwa (ponowienie w tym
-- czasie dostaje 409).
--
-- Tylko service_role - aplikacja zapisuje to sama, nie jako uzytkownik.
--
-- Do tego public.list_project_tasks_page - stronicowanie GET
-- /projects/{id}/tasks (najnowsze pierwsze) po (created_at, id) w SQL, z
-- pelna precyzja znacznika czasu. W JS Date ma tylko milisekundy, wiec
-- zadania utworzone w tej samej milisekundzie (import) gubily sie miedzy
-- stronami. Kursor = id ostatniego zadania strony (+ jego czas, gdyby to
-- zadanie zostalo w miedzyczasie usuniete). SECURITY INVOKER: RLS dziala
-- jak przy zwyklym SELECT.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.api_idempotency_keys (
    scope           text        NOT NULL,
    idempotency_key text        NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 255),
    request_hash    text        NOT NULL,
    status_code     integer,
    response_body   text,
    response_type   text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_api_idempotency_keys_created_at ON public.api_idempotency_keys (created_at);

ALTER TABLE public.api_idempotency_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.api_idempotency_keys FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_idempotency_keys TO service_role;


CREATE OR REPLACE FUNCTION public.list_project_tasks_page(
    p_project_id uuid,
    p_limit      integer,
    p_after_id   uuid DEFAULT NULL,
    p_after_at   timestamptz DEFAULT NULL
)
    RETURNS SETOF public.tasks
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path = ''
AS $$
    SELECT t.*
    FROM public.tasks t
    WHERE t.project_id = p_project_id
      AND (
          p_after_id IS NULL
          OR (
              EXISTS (SELECT 1 FROM public.tasks a WHERE a.id = p_after_id AND a.project_id = p_project_id)
              AND (t.created_at, t.id) < (
                  (SELECT a.created_at FROM public.tasks a WHERE a.id = p_after_id AND a.project_id = p_project_id),
                  p_after_id
              )
          )
          OR (
              -- The cursor's task is gone: its time from the cursor has
              -- millisecond precision, so compare at that precision.
              NOT EXISTS (SELECT 1 FROM public.tasks a WHERE a.id = p_after_id AND a.project_id = p_project_id)
              AND (date_trunc('milliseconds', t.created_at), t.id) < (date_trunc('milliseconds', p_after_at), p_after_id)
          )
      )
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 1001);
$$;

REVOKE ALL ON FUNCTION public.list_project_tasks_page(uuid, integer, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_project_tasks_page(uuid, integer, uuid, timestamptz) TO authenticated, service_role;


COMMIT;
