-- ============================================================
-- GUIDON - MIGRACJA 044
-- Feedback od uzytkownikow instancji
-- ============================================================
--
-- Uruchomic PO 043.
--
-- Prosty formularz "Send feedback" dostepny z menu profilu (kazda strona
-- aplikacji) - wiadomosc trafia do tabeli instance-wide, widocznej w panelu
-- admina (/admin/feedback), tym samym wzorcem co /admin/logs: dual-mode
-- odczyt przez hasDirectDatabase()/withServiceRole albo createServiceClient(),
-- bo "kazde zgloszenie z kazdej organizacji" jest z definicji odczytem
-- miedzy-tenantowym, ktory RLS ma blokowac dla kogokolwiek innego.
--
-- RLS jak activity_logs_insert (001): kazdy zalogowany moze wstawic
-- wlasny wiersz (user_id = auth.uid()), i moze odczytac tylko wlasne
-- zgloszenia - panel admina i tak czyta przez service-role, wiec SELECT
-- dla `authenticated` nie musi (i nie powinien) obejmowac cudzych wierszy.
--
-- page_url jest opcjonalny (klient moze go nie wyslac) - kontekst "skad"
-- zglaszajacy pisal, nie wymagany do zapisania feedbacku.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.feedback (
    id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid,
    message     text        NOT NULL CHECK (length(message) BETWEEN 1 AND 4000),
    page_url    text        CHECK (page_url IS NULL OR length(page_url) <= 2000),
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback
DROP CONSTRAINT IF EXISTS feedback_user_id_fkey;

ALTER TABLE public.feedback
    ADD CONSTRAINT feedback_user_id_fkey
        FOREIGN KEY (user_id)
            REFERENCES public.profiles(id)
            ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback (created_at DESC);


ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS feedback_select ON public.feedback;
CREATE POLICY feedback_select
ON public.feedback
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS feedback_insert ON public.feedback;
CREATE POLICY feedback_insert
ON public.feedback
FOR INSERT
TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));


GRANT SELECT, INSERT ON public.feedback TO authenticated;


COMMIT;
