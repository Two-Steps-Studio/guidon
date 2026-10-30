# Guidon task queue - 2026-10-30

Snapshot: 263 tasks, 8 Todo, 46 Backlog, 205 Review, 4 Done. Review is not proof of completion; reconcile against changes and verification before closing cards. This batch starts from main d8b8f95. Production remains on that approved commit until another deployment is requested.

## Current batch

- Background: viewport coverage and scroll movement, preserving reduced-motion/off preferences.
- Notifications: preserve sticky header and page position when opening the nonmodal notification list.
- Task pins: personally pinned cards precede ordinary cards in their column, for manual and deadline sorting.
- Sidebar: pinned project avatars and centered collapsed profile avatar.
- AI label suggestions: owner/admin action, bounded project context, preview before an explicit additive save, no deletion/renaming of existing labels. Respects project and personal AI switches; localized in EN/PL/DE/ES.
- SEO: shorter brand-led metadata, canonical hostname as alternate site name, accurate sitemap and noindex authentication pages. Actual ranking/index coverage needs Search Console verification; see `search-visibility-2026-10-30.md`.
- Legal draft banner removed as requested. The operator contact section, legal publication/noindex gate and actual unresolved identification/review gap are retained; this is not legal approval.
- MCP attachments: new task `1a27a400-e1fb-4b69-903c-28f9aa6ab33f`, created from the owner's follow-up. Native images, embedded file resources and private temporary downloads; no new migrations/scopes. See `mcp-task-attachments.md`.
- Footer is waiting for its reference image to be read through the new MCP capability after the approved rollout. Do not substitute a guessed design for the attachment.

## Verification of this batch

- Final isolated production build and targeted UI suite: `node tests/e2e/run.mjs --task-queue`, **passed** in Chromium, Firefox and WebKit. Artifact run: `output/e2e/8d2be390645b`.
- The same run passed 166 existing REST/MCP isolation checks plus real attachment API/MCP checks: native image bytes, text/JSON resources, temporary private downloads, pagination, scope/project/task/member isolation, expired/revoked keys and agent permissions.
- AI provider/parser/transport/chat suites and new label tests passed; label tests cover role/AI/rate gates, scoped bounded context, deduplication and safe failures without real billed requests. Labels/translations passed; agent-web 174/174, context-pack 13/13, pin-order and MIME/size-boundary tests passed. TypeScript, focused ESLint and diff whitespace checks passed.
- Broad local E2E previously completed Chromium/Firefox but exposed test-harness assumptions in WebKit download observation and Windows reduced-transparency handling. These tests now observe actual downloads and honor the real OS preference. The final broad CI suite remains a separate check; the targeted run is not represented as a full-suite pass.
- No live Supabase writes or new production deployment in this batch. Supabase-hosted attachment reading and installed-plugin discovery need the approved rollout and a real-file verification.

## Initial board snapshot

The following is the initial queue snapshot, not a claim that these cards are now complete:

- [ ] Tags (medium, todo) - task `e048773d-feb8-4b52-8f4a-eca64dfb9abe`
- [ ] Footer (medium, backlog) - task `40361fb8-419b-4844-a62a-68b6f769c4c7`
- [ ] Wyniki wysukiwania (medium, todo) - task `586ebc98-2561-4715-a29b-adbd7913591d`
- [ ] Top bar (medium, todo) - task `7789e4de-f47e-43c9-b552-a343d2b9bf28`
- [ ] Usuneicei tego ze stron (medium, todo) - task `0ec37298-c0e1-44f2-8294-4d2d19f2e1a7`
- [ ] Przypinanie zadań (medium, todo) - task `fe6c9430-47d2-4192-9946-e1f504c88a4e`
- [ ] Sidebar (medium, todo) - task `b57c0c41-8c1c-4874-866d-01cb937c97f3`
- [ ] Tło (high, todo) - task `08cfb461-b7c4-4855-9672-5f29c411e1ac`
- [ ] Do zeobienia (medium, backlog) - task `f8c28e6b-e0c3-4df6-af45-666b15e482a7`
- [ ] [Perplexity P2] Verified decision-to-code lineage i ręczne korekty linków (medium, backlog) - task `fed64dcc-51a8-4d43-a5ae-3c1075c0f181`
- [ ] [Perplexity P2] Bezpieczne odwracanie agentowych zmian w Guidon (medium, backlog) - task `50a369f0-f706-4a4f-8831-13024b5f33bf`
- [ ] [Perplexity P2] Context-aware task templates z acceptance criteria (medium, backlog) - task `7babe394-8988-4f0d-baad-927eeba89403`
- [ ] [Perplexity P2] Release/Deploy status przy taskach i milestone'ach (medium, backlog) - task `ce9761c7-a2c9-42ce-a536-41b2aa44fe94`
- [ ] [Perplexity P2] GitLab provider adapter: issues i merge requests (medium, backlog) - task `e4d6bfc3-a304-4c95-baf9-a1f6c9e0a51b`
- [ ] [Perplexity P2] Agent role templates: planner, implementer, reviewer, QA, docs (medium, backlog) - task `3eaa58d6-7e7b-40c5-afa8-189265d89636`
- [ ] [Perplexity P2] Agent quality analytics: acceptance, rework, cycle-time (medium, backlog) - task `7c7622be-1476-4a0c-99f5-848cb62ab434`
- [ ] [Perplexity P1] Stakeholder read-only view: roadmap i status bez szumu (medium, backlog) - task `95a25c82-c3e6-4702-a262-208ca0aeec51`
- [ ] [Perplexity P1] Cost observability: AI run budget, provider actuals i preflight (high, backlog) - task `85f73eed-dee2-46fe-a7a8-65ae52259493`
- [ ] [Perplexity P1] Auto status z PR: reguły i bezpieczne manual override (high, backlog) - task `38a89dea-a2f0-4a0f-8a6c-a405e6506a44`
- [ ] [Perplexity P1] GitHub-first onboarding: import repo, preview i project scaffold (high, backlog) - task `68b557e4-18ec-4e4a-9fc6-de3e5ab9398f`
- [ ] [Research P1] Win/loss: dlaczego użytkownicy odchodzą od konkurencji (medium, backlog) - task `464f7d92-3408-41c8-90f1-776454119d86`
- [ ] [Competitive P2] Rozbudowany error recovery i status synchronizacji (medium, backlog) - task `58151d6b-0835-4986-bf94-02c1d6c10320`
- [ ] [Research P1] Testy problemów cenowych i billing UX konkurentów (medium, backlog) - task `3bc7bc03-bb49-49c4-a4f8-a8552df7f1ba`
- [ ] [Competitive P2] Eksport i usuwanie konta bez vendor lock-in (medium, backlog) - task `e35907ef-1f01-4b65-9ccf-85976a712034`
- [ ] [Competitive P2] Ujednolicone powiadomienia z kontrolą szumu (medium, backlog) - task `1d032df9-7005-4318-9982-58332a94b8ee`
- [ ] [Competitive P2] Bulk editing bez ukrytych operacji (medium, backlog) - task `301d067b-ec4a-48ba-b9c5-fe6b2638dd55`
- [ ] [Competitive P1] Diagnostyka problemów search: zero results i exact match (medium, backlog) - task `c8d8fcc0-660e-467d-9c55-6e8e2a023e8f`
- [ ] [Research P1] Benchmark UX 8 narzędzi: 10 scenariuszy i scoring (medium, backlog) - task `46dea5a2-7709-42b1-8978-ad96cdd4f658`
- [ ] [Competitive P2] Uczciwy cennik i kalkulator kosztów zespołu + AI (low, backlog) - task `b75d4b35-f77c-4e58-9ce2-a72b718ec849`
- [ ] [Competitive P1] Support i publiczne aktualizacje zgłoszeń bez ciszy (medium, backlog) - task `7fbd82b0-363d-4a07-b827-759703c1088a`
- [ ] [Po starcie] Klucze MCP ograniczone do jednego projektu (medium, backlog) - task `5808b2b2-e1f5-486d-8b65-9c652638b936`
- [ ] [Future] Budżety i uprawnienia autonomicznych agentów (low, backlog) - task `b287cbfa-4242-402e-a788-f1a2bdc388fb`
- [ ] [Future] Studio projektu — GDD, referencje, skills i wyspecjalizowani agenci (low, backlog) - task `9c15ed61-f6d3-4837-b77b-69d7b158df8e`
- [ ] [Future] Autonomiczna pętla QA — build, test, screenshot, feedback, iteracja (low, backlog) - task `2622a0e6-dc9e-4fd4-aac2-d00f1fec25a4`
- [ ] [Future] Integracje narzędzi kreatywnych — Unity, Blender i pipeline zasobów (low, backlog) - task `fe280ed8-5083-4da6-8a61-59010d54c512`
- [ ] [Future] Agent Runs — trwałe sesje, checkpointy i wznowienie po awarii (low, backlog) - task `7363a896-d93c-4b97-b303-f57e2d658aa2`
- [ ] [Future] Autonomous Project Studio — wieloagentowe wykonywanie projektów (low, backlog) - task `eec1f299-97f9-40e6-bf0e-a3b74ddc461b`
- [ ] [Future / Post-launch] Kanały Stable / Beta / Nightly na subdomenach (low, backlog) - task `c4c53ab6-ba60-42f4-a0c6-db5ef43891a0`
- [ ] [Docs P2] Lekki edytor dokumentacji projektu (rich text + Markdown) (low, backlog) - task `ea2331ee-5e88-4497-af5c-3d1ffc58838e`
- [ ] [Po starcie] Globalne zaawansowane wyszukiwanie zadań (nie tylko Kanban) (medium, backlog) - task `53fba2aa-205a-4671-98f1-cccc9a5b5fe8`
- [ ] Dokumenty (low, backlog) - task `72d14d4d-f308-41fe-9953-5d1247d14860`
- [ ] [Po starcie] incident.io: publiczna status page i obsługa incydentów (low, backlog) - task `2c9153b7-1591-4edf-891d-d38e96338711`
- [ ] [Context Engine P1] Observability, backfill i koszty AI (low, backlog) - task `239c8792-592c-43f1-b516-9ee9882ee205`
- [ ] [Context Engine P1] Agent runs: raporty zmian i przypisanie wyników (low, backlog) - task `40cabe84-befa-4bcf-9cd1-cf1fba571e5c`
- [ ] [Feature] Feedback Portal / public roadmap (low, backlog) - task `08175b12-c32c-4d97-8611-690365e866d3`
- [ ] [Feature] Custom Modules 2.0 (low, backlog) - task `946f9a27-384d-4bcd-b713-aaca481c76d5`
- [ ] [Feature] QA & Release Management (low, backlog) - task `39827fd1-de87-4b84-9730-dca0e71287e7`
- [ ] [Feature] Sprint Planning i zaawansowane raporty (low, backlog) - task `250512fd-6e92-4b6b-90bc-a44d780a9329`
- [ ] [Feature] AI Project Health & Daily Briefings (low, backlog) - task `01bfc373-f34b-42c1-9240-54057bdb3398`
- [ ] [Feature] Visual Automation Builder MVP (low, backlog) - task `bebaa190-9874-4cfa-b1e9-0d601c21a6a5`
- [ ] [Feature] AI Agent Control Center MVP (low, backlog) - task `1eb76523-da33-452b-9c51-1d29f050c749`
- [ ] [Feature] Project Analytics MVP (low, backlog) - task `79aacf7f-7130-4690-9827-f4f1cc781e9e`
- [ ] [Launch] Materiały promocyjne i test 3 reklam Guidona (medium, todo) - task `0d072e51-6957-4b16-937a-1608c77a35b9`
- [ ] [Zablokowane] Produkcyjne Stripe, webhooki i obsługa błędów billingowych (high, backlog) - task `bb72c893-999d-403b-a49b-d11512cef82b`

External access, paid spending, accepting terms and production data changes require applicable authorization. Research involving customers or advertisements cannot be claimed complete from code alone.
