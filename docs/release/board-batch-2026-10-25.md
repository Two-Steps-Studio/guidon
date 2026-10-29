# Guidon board batch - 2026-10-25

Base: `362231a` (PR #71 merged). One working branch: `codex/board-completion`.

## Scope and board policy

The user requested every unfinished task in one PR and board cleanup. The initial
snapshot contains 231 cards: 50 Done, 139 Review, 17 Todo and 25 Backlog.
Review cards are not accepted merely because a previous attempt says SUCCEEDED.
No card is deleted or bulk-completed. The original inventory is preserved in
[board-inventory-2026-10-25.md](board-inventory-2026-10-25.md).

Todo is ordered with release/security/billing/onboarding/board gates first,
then other QA, delivery reliability, operations, funnel analytics and campaign.
All 10 initial critical and 31 initial high Review cards now precede other priorities.
Backlog is ordered by dependencies: registry and marketplace QA, GitHub/context
foundation and memory/retrieval/Why QA, agent operations, analytics/automation,
executable sandbox review, planning templates and finally paid marketplace.
The Context Engine foundation remains in Todo before its dependent backlog work.
Started cards remain active until verified; final PR evidence is posted per card.

## Implemented in this branch

- Per-module navigation and dedicated project pages for legacy content and
  installed declarative packages, using caller-scoped data reads. Sidebar data
  excludes records, uses separate kind namespaces to avoid ID collisions, and
  excludes disabled/uninstalled/non-reading packages. Mutations invalidate the
  project layout so navigation follows install/rename/enable/uninstall changes.
- Dedicated checklist saves keep the complete sibling snapshot and revision CAS.
  Stable component identity preserves save confirmation during revalidation.
- Deterministic synthetic preview records for table/board/chart/calendar and
  disabled forms. Required form fields remain visible for old manifests while
  selected optional fields match the runtime form layout. No project reads,
  provider calls, installed writes or execution in preview.
- Validation report for schema/field references, runtime compatibility and scopes;
  unsupported dependencies/scripts remain rejected. Public publishing is still
  unavailable pending the registry/moderation implementation.
- Visual inspector for fields, select options, required flags, field ordering,
  view types/field selection and view ordering. Applying validates a complete
  plan before saving; invalid changes leave the saved plan intact. Applying
  resets manifest/consent. Prompt edits preserve the plan and AI refinements
  receive it as bounded untrusted context, after existing role/AI gates.
- Actual seven-provider transport QA: 56 mocked-fetch cases; no billable network.
  The older task-learning test command also needed explicit Node type stripping.
  REST/MCP AI mutation/failure coverage remains part of the open AI QA card.

## Remaining work matrix

This is an honest implementation inventory, not a claim that all cards are done.

| Card | Work | State in this branch |
|---|---|---|
| 94dbb45e-f214-4469-b8d2-72af8ffa004e | Moduły | Implemented; Review, awaiting human acceptance |
| 239c8792-592c-43f1-b516-9ee9882ee205 | [Context Engine P1] Observability, backfill i koszty AI | Open - not implemented by this batch |
| 9ddf32fc-8c1f-4c59-9442-408b7c3cd8bb | [Context Engine P0] QA: E2E, uprawnienia, regresja i quality gates | Open - not implemented by this batch |
| 40cabe84-befa-4bcf-9cd1-cf1fba571e5c | [Context Engine P1] Agent runs: raporty zmian i przypisanie wyników | Open - not implemented by this batch |
| 3632876e-46e5-48ee-bd1f-a1f2b2f4e7eb | [Context Engine P1] Panel kontroli źródeł i prywatności | Open - not implemented by this batch |
| 6c2b6ba6-9c07-494d-8465-7dab25449940 | [Context Engine P1] Why Panel z historią i źródłami | Open - not implemented by this batch |
| e8151b63-0b4f-4ff0-9861-07a661d6d6ce | [Context Engine P0] Context API / MCP dla agentów | Open - not implemented by this batch |
| a63ffcf0-b6ee-4c59-a414-0d35c6907842 | [Context Engine P0] Living Project Memory: aktualizacje z dowodami | Open - not implemented by this batch |
| 409bda91-9483-420c-97e9-1411e6bc84fa | [Context Engine P0] Smart Linking: zadanie ↔ commit ↔ PR ↔ decyzja | Open - not implemented by this batch |
| 1081abc6-1a01-43d4-a7d2-93025d983a62 | [Context Engine P0] Event capture i dziennik aktywności | Open - not implemented by this batch |
| b8127b26-3187-4f0a-92ed-4f4ac5042d4f | [Marketplace QA] E2E instalacji, wersji i ochrony tenantów | Open - not implemented by this batch |
| 73e5b3b9-0a22-4526-9e97-1aa97143c6a4 | [Marketplace V4] Model płatnych modułów i rozliczeń autorów | External environment/approval required; code work may also remain |
| 5b56a965-aa3f-400a-84f1-be2b267adc09 | [Modules V3] Automatyzacje, API zdarzeń i połączenia MCP | Open - not implemented by this batch |
| d1c7c5fe-9f96-4a6f-8099-c1555c642921 | [Modules V3] Developer SDK + Monaco + sandbox runtime | Open - not implemented by this batch |
| 24207c27-8df4-4b00-b7ed-89c2e9028217 | [Marketplace V2] Developer Dashboard i historia wydań | Open - not implemented by this batch |
| 423650d6-fb31-4325-a6e8-8b01d8954e20 | [Marketplace V2] Registry, review i publikacja modułów | Open - not implemented by this batch |
| 7354e24f-df38-4e1d-b9cc-ab9b7af89a55 | [Modules V1] Visual Editor pól, widoków i formularzy | Implemented; Review, awaiting human acceptance |
| 02c6dccb-028b-492f-9127-4fa53b6d24f6 | [AI Builder V1] Live Preview, walidator i testy modułu | Implemented; Review, awaiting human acceptance |
| 40e24352-0ff3-4f23-abf0-80db6439c4df | [QA][P1] Performance i regresja dużych projektów | Open - not implemented by this batch |
| 3be4feeb-795e-491d-8909-3156cb99be52 | [QA][P1] AI: dostawcy, timeouty, budżety i bezpieczne odpowiedzi | Follow-up after PR72: chat handler/provider failure matrix, cancellation, request/tool budgets and native HTTP role/AI gates verified; Review. External MCP models and shared financial quotas remain separate gates; see ai-chat-2026-10-25.md |
| ec708b24-27a0-4dd2-bd2e-5f397736ad65 | [QA][P1] Moduły: roadmap, decyzje, wiedza, pliki i custom modules | Open - not implemented by this batch |
| 868d6605-ffe3-4507-a565-2f816a330508 | [QA][P1] Accessibility: axe, klawiatura i kontrast | Automated gate implemented; Cloud checkout and manual checks remain |
| c011cbbb-bc9a-47db-b810-6e4f116ea078 | [QA][P1] Mobile i responsywność: iPhone Safari/Android | Follow-up: automated matrix and mobile fixes verified; Review with physical-device checks still pending. See mobile-qa-2026-10-25.md |
| 9129015e-486d-4e2c-9e6a-1ec3d2734446 | [QA][P0] Stripe sandbox: subskrypcje, idempotencja i uprawnienia | External environment/approval required; code work may also remain |
| d7b880f7-d561-4746-9998-1417995202fe | [QA][P0] E2E: Kanban, taski i współbieżne edycje | Implemented and verified in three browsers; Review, awaiting human acceptance |
| 0a88a2dd-5827-40fe-8f61-516039ad5a67 | [QA][P0] E2E: onboarding, organizacja i pierwszy projekt | Partial: first workspace/task and existing-account memberships; email invite/acceptance and Cloud Free cap remain |
| 08175b12-c32c-4d97-8611-690365e866d3 | [Feature] Feedback Portal / public roadmap | Open - not implemented by this batch |
| 946f9a27-384d-4bcd-b713-aaca481c76d5 | [Feature] Custom Modules 2.0 | Open - not implemented by this batch |
| 39827fd1-de87-4b84-9730-dca0e71287e7 | [Feature] QA & Release Management | Open - not implemented by this batch |
| 250512fd-6e92-4b6b-90bc-a44d780a9329 | [Feature] Sprint Planning i zaawansowane raporty | Open - not implemented by this batch |
| 01bfc373-f34b-42c1-9240-54057bdb3398 | [Feature] AI Project Health & Daily Briefings | Open - not implemented by this batch |
| bebaa190-9874-4cfa-b1e9-0d601c21a6a5 | [Feature] Visual Automation Builder MVP | Open - not implemented by this batch |
| 1eb76523-da33-452b-9c51-1d29f050c749 | [Feature] AI Agent Control Center MVP | Open - not implemented by this batch |
| f135cc67-9109-4401-af53-cdefdbd8131e | [Feature] GitHub Development Hub | Open - not implemented by this batch |
| 79aacf7f-7130-4690-9827-f4f1cc781e9e | [Feature] Project Analytics MVP | Open - not implemented by this batch |
| c83d728d-3baa-4ae0-a87b-3ccd06552e49 | [Reliability] Kolejka webhooków, retry i historia dostarczeń | Open - not implemented by this batch |
| 0d072e51-6957-4b16-937a-1608c77a35b9 | [Launch] Materiały promocyjne i test 3 reklam Guidona | Open - not implemented by this batch |
| de9151ad-aa1c-40ba-9467-018e5f7b2a48 | [Launch] Analityka lejka rejestracja → aktywacja → subskrypcja | Open - not implemented by this batch |
| 2cc56dff-6011-4e2f-b0eb-15c17c2baf24 | [Launch] Monitoring produkcji, backup/restore i procedura rollbacku | External environment/approval required; code work may also remain |
| 97feeeb4-f5e0-4e20-aa49-a3e547f525a1 | [Launch] Kontrola bezpieczeństwa i izolacji tenantów przed publikacją | Open - not implemented by this batch |
| bb72c893-999d-403b-a49b-d11512cef82b | [Launch] Produkcyjne Stripe, webhooki i obsługa błędów billingowych | External environment/approval required; code work may also remain |
| 57226c85-3237-4ebd-bf05-045cfca1315d | [Launch] Audyt gotowości do premiery i scenariusze end-to-end | Open - not implemented by this batch |

## Deployment boundaries

No production configuration, migration, payment, payout or deployment changed.
Module pages require the existing module migrations (079-083) to be verified in
the target environment. This branch adds migration 086 for task edit revisions;
apply it before the new full edit UI. It has only run against disposable test
databases. Cloud Supabase/Stripe
staging is not available; follow [staging-handoff.md](staging-handoff.md).
Registry/npm/PyPI ownership steps remain separate from code delivery.
Physical-device, screen-reader and actual Cloud authorization checks are not
replaced by browser emulation or direct-PostgreSQL tests.

## Validation

`test:modules`, `test:module-editor` and `test:ai` passed locally; TypeScript and
focused ESLint passed. The editor test uses actual UI/hooks with only boundary
adapters: visual edits/validation/reorder, synthetic preview, reload, fresh
consent, autosave during edits and two-tab conflicts.

Earlier clean-production-build run `8baed7a74447` completed successfully in
Chromium, Firefox and WebKit, including 110 REST/MCP checks, dedicated module
CRUD/read-only/foreign-tenant/disabled flows, existing release regressions and
27 accessibility scans. Every scan has zero reported violations. Each browser
retains four incomplete rule checks (contrast on login/board/dialog and
aria-hidden-focus on the dialog); these remain manual review items, not passes.
Artifacts are local under `output/e2e/8baed7a74447/` and are not committed.

The accessibility changes restore task-dialog focus, replace nested task-card
buttons with a native title control, preserve keyboard reorder and pointer
dragging, include visible values in select names, connect file labels, enlarge
workflow reorder targets, and underline the signup link. See
[accessibility-2026-10-25.md](accessibility-2026-10-25.md) for the pending manual
and Cloud/Stripe checkout matrix. Three module implementation cards are in
Review with attempt evidence and this single PR link. AI QA remains Todo with
its missing public-API matrix documented. The full backlog is not complete;
the PR remains Draft and no production deployment was performed.

The subsequent task-editing/onboarding batch adds server-owned task revisions,
stale-form conflict recovery and persisted CRUD/membership browser scenarios.
See [task-editing-onboarding-2026-10-25.md](task-editing-onboarding-2026-10-25.md)
for migration ordering, compatibility and remaining acceptance criteria.

Final subsequent run `77ed603f084c` passed a clean production build and all
scenarios in Chromium, Firefox and WebKit: onboarding/first task, existing-account
organization/project roles, two-session task CAS and recovery, persisted task
CRUD/comments/subtasks/attachments/filters/assignment/status, existing module
and Apple Design checks, 110 REST/MCP checks and 27 axe scans (zero violations;
four incomplete checks per browser still require manual review). TypeScript,
focused ESLint, the actual task-action regression and isolation guards passed;
the full database suite reports 608 passes. Local artifacts are under
`output/e2e/77ed603f084c/`. No production migration or deployment was performed.
