BEGIN;

-- ============================================================
-- GUIDON — MIGRACJA 000
-- Baseline: tworzy tabele
-- ============================================================
--
-- Uruchamiana jako PIERWSZA, przed 001.
--
-- DLACZEGO ISTNIEJE
-- -----------------
-- 001 zakłada, że tabele już są — wyłącznie je ALTERuje, dodaje
-- polityki RLS, funkcje i triggery. Do tej pory schemat powstawał
-- ręcznie w edytorze Supabase, więc repozytorium NIE POTRAFIŁO
-- odtworzyć bazy od zera. To blokowało wszystko, co wymaga
-- świeżej instalacji: Docker (TODO.md §3), migracje (§13),
-- aktualizacje (§15) i walidację czystego wdrożenia (§29 Faza 8).
--
-- STAN, KTÓRY ODTWARZA
-- --------------------
-- Celowo odwzorowuje schemat SPRZED migracji 002, żeby cały łańcuch
-- 001→008 zastosował się normalnie:
--
--   * projects NIE ma jeszcze kolumny slug (dodaje ją 002)
--   * tasks.status ma stary słownik (002 go przebudowuje)
--   * technologies.category nie ma game_engine (dodaje 008)
--
-- Dzięki temu świeża instalacja przechodzi tę samą drogę co baza
-- produkcyjna, zamiast wchodzić bocznym wejściem w stan końcowy.
--
-- ZAŁOŻENIA
-- ---------
-- Wymaga schematu `auth` z tabelą auth.users — dostarcza go Supabase.
-- Przy self-hostingu na czystym PostgreSQL potrzebna będzie warstwa
-- zgodności; patrz docs/self-hosting-audit.md, bloker 2.
--
-- IDEMPOTENTNA: każdy krok używa IF NOT EXISTS, więc uruchomienie
-- na istniejącej bazie niczego nie psuje ani nie kasuje.
-- ============================================================


CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- PROFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id         uuid NOT NULL PRIMARY KEY,
    email      text NOT NULL UNIQUE,
    full_name  text,
    avatar_url text,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- ORGANIZATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.organizations (
    id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name        text NOT NULL CHECK (length(trim(name)) > 0),
    slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
    description text,
    created_by  uuid DEFAULT auth.uid(),
    created_at  timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at  timestamptz DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS public.organization_members (
    id              uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL,
    user_id         uuid NOT NULL,
    role            text NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner', 'admin', 'member')),
    joined_at       timestamptz DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- PROJECTS
-- ============================================================
--
-- Bez kolumny slug — dodaje ją 002 wraz z wypełnieniem danych.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.projects (
    id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id      uuid NOT NULL,
    name                 text NOT NULL CHECK (length(trim(name)) > 0),
    description          text,
    description_markdown text,
    status               text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'archived', 'deleted')),
    visibility           text NOT NULL DEFAULT 'private'
                         CHECK (visibility IN ('private', 'organization', 'public')),
    color                text CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
    planned_end_date     timestamptz,
    created_by           uuid,
    created_at           timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at           timestamptz DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS public.project_members (
    id         uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id uuid NOT NULL,
    user_id    uuid NOT NULL,
    role       text NOT NULL DEFAULT 'viewer'
               CHECK (role IN ('owner', 'admin', 'developer', 'tester', 'viewer')),
    joined_at  timestamptz DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- WORK
-- ============================================================
--
-- tasks.status ma tu jeszcze STARY słownik. 002 wykrywa i podmienia
-- to ograniczenie oraz przemapowuje dane.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tasks (
    id               uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id       uuid NOT NULL,
    title            text NOT NULL CHECK (length(trim(title)) > 0),
    description      text,
    status           text NOT NULL DEFAULT 'todo'
                     CHECK (status IN ('todo', 'in_progress', 'testing', 'completed')),
    priority         text NOT NULL DEFAULT 'medium'
                     CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    tags             text[] DEFAULT '{}'::text[],
    due_date         timestamptz,
    progress_percent integer DEFAULT 0
                     CHECK (progress_percent >= 0 AND progress_percent <= 100),
    assignee_id      uuid,
    estimated_hours  numeric,
    actual_hours     numeric,
    sort_order       integer,
    decision_id      uuid,
    created_by       uuid,
    created_at       timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at       timestamptz DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS public.task_comments (
    id         uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id    uuid NOT NULL,
    author_id  uuid NOT NULL,
    content    text NOT NULL CHECK (length(trim(content)) > 0),
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS public.roadmap_phases (
    id                    uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id            uuid NOT NULL,
    name                  text NOT NULL CHECK (length(trim(name)) > 0),
    description           text,
    start_date            timestamptz,
    planned_end_date      timestamptz,
    actual_end_date       timestamptz,
    status                text NOT NULL DEFAULT 'planned'
                          CHECK (status IN ('planned', 'in_progress', 'completed', 'blocked')),
    completion_percentage integer DEFAULT 0
                          CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    sort_order            integer,
    created_by            uuid,
    created_at            timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at            timestamptz DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- KNOWLEDGE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.project_files (
    id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id   uuid NOT NULL,
    name         text NOT NULL CHECK (length(trim(name)) > 0),
    storage_path text,
    file_url     text,
    category     text NOT NULL DEFAULT 'other'
                 CHECK (category IN ('documentation', 'graphics', 'audio', 'source_code', 'other')),
    size_bytes   bigint,
    mime_type    text,
    uploaded_by  uuid,
    created_at   timestamptz DEFAULT CURRENT_TIMESTAMP
);


-- technologies.category bez game_engine — dodaje je 008.
CREATE TABLE IF NOT EXISTS public.technologies (
    id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id  uuid NOT NULL,
    name        text NOT NULL CHECK (length(trim(name)) > 0),
    icon_slug   text,
    version     text,
    category    text NOT NULL DEFAULT 'other'
                CHECK (category IN ('frontend', 'backend', 'database', 'devops', 'ai', 'other')),
    description text,
    sort_order  integer,
    created_at  timestamptz DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- CONTEXT LAYER
-- ============================================================

CREATE TABLE IF NOT EXISTS public.context_decisions (
    id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id    uuid NOT NULL,
    title         text NOT NULL CHECK (length(trim(title)) > 0),
    description   text,
    decision_type text NOT NULL DEFAULT 'other'
                  CHECK (decision_type IN ('architectural', 'technical', 'product',
                                           'process', 'business', 'other')),
    status        text NOT NULL DEFAULT 'proposed'
                  CHECK (status IN ('proposed', 'approved', 'rejected', 'deprecated')),
    made_by       uuid,
    made_at       timestamptz,
    alternatives  text[] DEFAULT '{}'::text[],
    impact        text,
    source_type   text,
    source_id     uuid,
    created_at    timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at    timestamptz DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS public.context_sources (
    id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id  uuid NOT NULL,
    source_type text NOT NULL
                CHECK (source_type IN ('document', 'comment', 'commit', 'pull_request',
                                       'issue', 'external_url', 'meeting', 'file', 'other')),
    source_id   uuid,
    title       text,
    content     text,
    url         text,
    author      uuid,
    created_at  timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at  timestamptz DEFAULT CURRENT_TIMESTAMP
);


-- Bez project_id — relacja jest zakotwiczona przez encję źródłową,
-- co egzekwują polityki RLS z 001. Patrz lib/context/project-relations.ts.
CREATE TABLE IF NOT EXISTS public.context_relations (
    id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    source_type   text NOT NULL,
    source_id     uuid NOT NULL,
    target_type   text NOT NULL,
    target_id     uuid NOT NULL,
    relation_type text NOT NULL
                  CHECK (relation_type IN ('depends_on', 'blocks', 'implements',
                                           'references', 'decided_by', 'based_on',
                                           'related_to', 'contradicts', 'supersedes',
                                           'part_of', 'contains')),
    metadata      jsonb DEFAULT '{}'::jsonb,
    created_at    timestamptz DEFAULT CURRENT_TIMESTAMP,
    created_by    uuid
);


CREATE TABLE IF NOT EXISTS public.project_memory (
    id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id  uuid NOT NULL,
    content     text NOT NULL CHECK (length(trim(content)) > 0),
    memory_type text NOT NULL
                CHECK (memory_type IN ('fact', 'project_rule', 'constraint', 'preference',
                                       'decision_summary', 'observation', 'ai_insight')),
    source_id   uuid,
    verified    boolean DEFAULT false,
    verified_by uuid,
    verified_at timestamptz,
    created_by  uuid NOT NULL,
    created_at  timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at  timestamptz DEFAULT CURRENT_TIMESTAMP,
    confidence  numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);


-- ============================================================
-- COLLABORATION
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invitations (
    id              uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid,
    project_id      uuid,
    email           text NOT NULL,
    role            text NOT NULL,
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
    token           text NOT NULL UNIQUE,
    invited_by      uuid,
    expires_at      timestamptz NOT NULL,
    accepted_at     timestamptz,
    created_at      timestamptz DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS public.activity_logs (
    id              uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id      uuid,
    organization_id uuid,
    user_id         uuid,
    action          text NOT NULL,
    entity_type     text,
    entity_id       uuid,
    details         jsonb DEFAULT '{}'::jsonb,
    ip_address      text,
    user_agent      text,
    created_at      timestamptz DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- KLUCZE OBCE
-- ============================================================
--
-- Dodawane osobno, bo 001 i tak je przebudowuje (DROP + ADD), a
-- kolejność tworzenia tabel nie może zależeć od kolejności FK.
-- ============================================================

DO $$
BEGIN

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_id_fkey') THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_id_fkey
            FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;

END
$$;


-- Pozostałe klucze obce ustawia migracja 001 (sekcja 9) — nie są tu
-- duplikowane, żeby istniała jedna definicja, a nie dwie rozjeżdżające się.


COMMIT;
