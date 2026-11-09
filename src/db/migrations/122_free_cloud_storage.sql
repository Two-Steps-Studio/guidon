-- ============================================================
-- GUIDON - MIGRACJA 122
-- Guidon Cloud tylko w planie Free, z małym limitem plików
-- ============================================================
--
-- Uruchomić PO 121.
--
-- Decyzja właściciela (2026-11-09): Guidon idzie w self-hosted. Chmura
-- zostaje darmowa, a jej koszty mają być bliskie zera - baza Supabase jest
-- w porządku, ale pliki (Storage) to koszt, który rośnie z każdym
-- użytkownikiem. Plan Free dostaje 50 MB na organizację zamiast 500 MB.
-- Płatne plany zostają w tabeli dla organizacji ustawianych ręcznie w
-- panelu admina; strona ich nie pokazuje.
--
-- Organizacja, która ma już więcej plików, niczego nie traci - limit
-- blokuje tylko kolejne uploady (isStorageLimitReached w src/lib/limits.ts).
-- Tylko dane w public.plans. Idempotentna.
-- ============================================================

UPDATE public.plans SET storage_limit_bytes = 50::bigint * 1024 * 1024 WHERE id = 'free';
