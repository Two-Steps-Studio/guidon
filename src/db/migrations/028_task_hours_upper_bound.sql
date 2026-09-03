-- ============================================================
-- GUIDON - MIGRACJA 028
-- Gorna granica tasks.estimated_hours / tasks.actual_hours
-- ============================================================
--
-- KONTEKST
-- --------
-- tasks_estimated_hours_nonnegative / tasks_actual_hours_nonnegative (001)
-- pilnuja tylko >= 0 - nic (ani warstwa aplikacji, saveTechnology-style
-- walidacji brak, ani DB) nie ogranicza gornej granicy. progress_percent
-- (0-100), completion_percentage (0-100) i confidence (0-1) maja swoje
-- gorne granice wyegzekwowane w DB; te dwie kolumny byly jedyna para bez
-- takiej granicy. 100000 godzin (~11 lat pracy ciaglej) to czysto
-- kosmetyczna siatka bezpieczenstwa przeciw literowce/wklejeniu
-- przypadkowej wartosci w polu liczbowym w formularzu, nie realne
-- ograniczenie produktowe.
-- ============================================================

BEGIN;

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_estimated_hours_upper_bound
        CHECK (
            estimated_hours IS NULL
                OR estimated_hours <= 100000
            )
    NOT VALID;

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_actual_hours_upper_bound
        CHECK (
            actual_hours IS NULL
                OR actual_hours <= 100000
            )
    NOT VALID;

COMMIT;
