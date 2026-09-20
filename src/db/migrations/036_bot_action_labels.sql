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
-- nalezacy do bota (api_keys.bot_label) - NULL wszedzie indzie19:10:30.232 Running build in Washington, D.C., USA (East) – iad1
-- 19:10:30.233 Build machine configuration: 2 cores, 8 GB
-- 19:10:30.418 Cloning github.com/Two-Steps-Studio/guidon (Branch: main, Commit: 69c7475)
-- 19:10:31.783 Cloning completed: 1.365s
-- 19:10:32.356 Restored build cache from previous deployment (BJTbE1UkiohGfBujdMRu8yr5JJ2a)
-- 19:10:34.692 Running "vercel build"
-- 19:10:34.716 Vercel CLI 59.23.2
-- 19:10:35.076 Installing dependencies...
-- 19:10:38.373 
-- 19:10:38.374 > guidon@0.1.0 postinstall
-- 19:10:38.374 > node scripts/copy-monaco-assets.mjs
-- 19:10:38.374 
-- 19:10:38.593 Copied monaco-editor assets to public/monaco-editor/vs
-- 19:10:38.659 
-- 19:10:38.659 added 63 packages in 3s
-- 19:10:38.659 
-- 19:10:38.660 283 packages are looking for funding
-- 19:10:38.660   run `npm fund` for details
-- 19:10:38.661 npm warn allow-scripts 3 packages have install scripts not yet covered by allowScripts:
-- 19:10:38.662 npm warn allow-scripts   @parcel/watcher@2.6.0 (install: node-gyp rebuild)
-- 19:10:38.662 npm warn allow-scripts   @swc/core@1.16.2 (postinstall: node postinstall.js)
-- 19:10:38.662 npm warn allow-scripts   unrs-resolver@1.12.2 (postinstall: node postinstall.js)
-- 19:10:38.662 npm warn allow-scripts
-- 19:10:38.662 npm warn allow-scripts Run `npm approve-scripts --allow-scripts-pending` to review, or `npm approve-scripts <pkg>` to allow.
-- 19:10:38.717 Detected Next.js version: 16.3.5
-- 19:10:38.730 Running "npm run build"
-- 19:10:38.920 
-- 19:10:38.920 > guidon@0.1.0 build
-- 19:10:38.921 > next build
-- 19:10:38.921 
-- 19:10:39.602 ▲ Next.js 16.3.5 (Turbopack)
-- 19:10:40.135   Applying modifyConfig from Vercel
-- 19:10:40.137 ✓ Running next.config.ts took 535ms
-- 19:10:40.162 - Experiments (use with caution):
-- 19:10:40.164   · serverActions
-- 19:10:40.164 
-- 19:10:40.223   Creating an optimized production build ...
-- 19:10:52.772 ✓ Compiled successfully in 11.6s
-- 19:10:52.774   Running TypeScript ...
-- 19:11:10.606 src/app/api/ai/chat/route.ts(28,9): error TS2353: Object literal may only specify known properties, and 'projectId' does not exist in type 'AICompletionInput'.
-- 19:11:10.607 src/app/projects/[id]/memory/actions.ts(554,26): error TS2304: Cannot find name 'resolveAIProvider'.
-- 19:11:10.607 src/lib/ai/providers/openai-compatible.ts(181,29): error TS2339: Property 'finish_reason' does not exist on type '{ content?: string | undefined; tool_calls?: { id: string; function: { name: string; arguments: string; }; }[] | undefined; }'.
-- 19:11:10.607 src/lib/mcp/server.ts(170,54): error TS2345: Argument of type '{}' is not assignable to parameter of type 'MemoryFormState'.
-- 19:11:10.607   Property 'error' is missing in type '{}' but required in type 'MemoryFormState'.
-- 19:11:10.715 Failed to type check.
-- 19:11:10.715 
-- 19:11:10.785 Error: Command "npm run build" exited with 1j, czyli
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
