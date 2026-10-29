# Guidon board inventory - 2026-10-29

Snapshot from Guidon MCP before this batch. A board status is not proof of a deployed implementation.

Total: 255; {"review":198,"todo":5,"backlog":45,"ai_working":3,"done":4}. Unfinished: 251.

## Execution order

1. Production prerequisites and safe migration reporting; diagnose the task edit version error without disabling compare-and-swap.
2. Verify the task creation backdrop and image close control against existing code; add browser regressions rather than duplicate working components.
3. Prepare the six-product evidence register and pilot material that can be done without contacting people.
4. Consolidate Google OAuth verification from PR111 into this single batch PR.

## External dependencies

- Production tasks.revision is absent (read-only Supabase REST probe returned 42703 on 2026-10-29). The migration registry ends at 055. Some later schema exists outside that history: do not apply all pending files blindly.
- A reviewed production schema repair still needs owner approval. No production SQL mutation, registry backfill or deployment is part of this batch.
- GitHub sign-in requires the owner's 2FA; Google remains Testing.
- Five real interviews and a pilot with 3-5 real testers require participants. No invented interview responses, success rates or timestamps.
- Ad recording/publication follows the pilot per the task's explicit prerequisite. No paid ads or unrequested public posts.
- The task 'Do zeobienia' has no description or acceptance criteria and is not implementable as written.
- Backlog items retain the project's focus gate (first 100 active users); review cards retain human acceptance. Neither group is silently marked Done.

## Complete board snapshot

| Task | ID | Status at intake | Priority |
| --- | --- | --- | --- |
| Nazwa uzytkownika | cc3cd686-6386-4337-98c3-0a94301afeae | review | high |
| Logowanie przez providerów | a47ddf9c-ddbe-4485-943e-67cf0fff7911 | review | medium |
| Do zeobienia | f8c28e6b-e0c3-4df6-af45-666b15e482a7 | todo | medium |
| Skeleton loadery | b313e901-49a9-483f-be63-5e887084e86c | review | medium |
| [Perplexity P2] Verified decision-to-code lineage i ręczne korekty linków | fed64dcc-51a8-4d43-a5ae-3c1075c0f181 | backlog | medium |
| [Perplexity P2] Bezpieczne odwracanie agentowych zmian w Guidon | 50a369f0-f706-4a4f-8831-13024b5f33bf | backlog | medium |
| [Perplexity P2] Context-aware task templates z acceptance criteria | 7babe394-8988-4f0d-baad-927eeba89403 | backlog | medium |
| [Perplexity P2] Release/Deploy status przy taskach i milestone'ach | ce9761c7-a2c9-42ce-a536-41b2aa44fe94 | backlog | medium |
| [Perplexity P2] GitLab provider adapter: issues i merge requests | e4d6bfc3-a304-4c95-baf9-a1f6c9e0a51b | backlog | medium |
| [Perplexity P2] Agent role templates: planner, implementer, reviewer, QA, docs | 3eaa58d6-7e7b-40c5-afa8-189265d89636 | backlog | medium |
| [Perplexity P2] Agent quality analytics: acceptance, rework, cycle-time | 7c7622be-1476-4a0c-99f5-848cb62ab434 | backlog | medium |
| [Perplexity P1] Stakeholder read-only view: roadmap i status bez szumu | 95a25c82-c3e6-4702-a262-208ca0aeec51 | backlog | medium |
| [Perplexity P1] Cost observability: AI run budget, provider actuals i preflight | 85f73eed-dee2-46fe-a7a8-65ae52259493 | backlog | high |
| [Perplexity P1] Centralny approval inbox dla akcji agentów | 6aa9c10b-b7b1-4248-9535-0f22830a81b9 | review | high |
| [Perplexity P1] Context freshness: aktualność pamięci i ostrzeżenia dla agentów | 10783988-dbfc-414f-8b8b-cdfcb3650116 | review | high |
| [Perplexity P1] Agent onboarding brief z dowodami i wersjonowaniem | 1207fa89-979a-4327-ac88-8f810eb7c59f | review | high |
| [Perplexity P1] Auto status z PR: reguły i bezpieczne manual override | 38a89dea-a2f0-4a0f-8a6c-a405e6506a44 | backlog | high |
| [Perplexity P1] GitHub-first onboarding: import repo, preview i project scaffold | 68b557e4-18ec-4e4a-9fc6-de3e5ab9398f | backlog | high |
| [Perplexity P0] MCP: token expiry, revoke, scope enforcement i rate limiting | 5121dbd1-39b0-4609-acaa-70bdee04f2d3 | review | critical |
| [Perplexity P0] Bezpieczny lifecycle agentów: claim → lease → review → complete | 5f0b93d0-9b8e-4f46-9f9d-980732fdedf5 | review | critical |
| [Research P1] Win/loss: dlaczego użytkownicy odchodzą od konkurencji | 464f7d92-3408-41c8-90f1-776454119d86 | backlog | medium |
| [Competitive P2] Rozbudowany error recovery i status synchronizacji | 58151d6b-0835-4986-bf94-02c1d6c10320 | backlog | medium |
| [Research P1] Testy problemów cenowych i billing UX konkurentów | 3bc7bc03-bb49-49c4-a4f8-a8552df7f1ba | backlog | medium |
| [Competitive P2] Eksport i usuwanie konta bez vendor lock-in | e35907ef-1f01-4b65-9ccf-85976a712034 | backlog | medium |
| [Competitive P2] Ujednolicone powiadomienia z kontrolą szumu | 1d032df9-7005-4318-9982-58332a94b8ee | backlog | medium |
| [Competitive P2] Bulk editing bez ukrytych operacji | 301d067b-ec4a-48ba-b9c5-fe6b2638dd55 | backlog | medium |
| [Competitive P1] Minimalny zestaw uprawnień i audyt dostępu | 0196bd38-f181-4df6-b376-6f3887252d9c | review | high |
| [Competitive P1] Diagnostyka problemów search: zero results i exact match | c8d8fcc0-660e-467d-9c55-6e8e2a023e8f | backlog | medium |
| [Competitive P1] Prosty onboarding bez konfiguracji enterprise | a5b26251-71b8-423b-a965-29cab1ba5977 | review | high |
| [Research P1] Benchmark UX 8 narzędzi: 10 scenariuszy i scoring | 46dea5a2-7709-42b1-8978-ad96cdd4f658 | backlog | medium |
| [Competitive Research] Benchmark 6 konkurentów + wywiady z użytkownikami | ceacdbc2-ca14-4911-895c-7bd26293dc77 | todo | medium |
| [Competitive P2] Uczciwy cennik i kalkulator kosztów zespołu + AI | b75d4b35-f77c-4e58-9ce2-a72b718ec849 | backlog | low |
| [Competitive P1] Support i publiczne aktualizacje zgłoszeń bez ciszy | 7fbd82b0-363d-4a07-b827-759703c1088a | backlog | medium |
| [Competitive P1] Transparencja AI: evidence, preview, approval i koszty | 6f159ccf-9575-414e-94aa-8d4f62b0e5d0 | review | high |
| [Competitive P1] Migracja z Notion, ClickUp, Jira i Linear – discovery + CSV MVP | 8abc1b55-2c7b-4ecf-b5aa-a1c1421ffc48 | review | medium |
| [Competitive P1] Tryb Focus i jawny przełącznik funkcji AI | 1219cc7d-23d6-40bc-badb-7d57baa97a63 | review | medium |
| [Competitive P1] Search quality: fuzzy, ranking i zero-result recovery | 4df90ddd-66a6-4cac-a651-8e56868a0635 | review | high |
| [Competitive P1] Mobile quick capture + Today bez ciężkiego Kanbana | 754945c4-fb2e-47b4-a72c-4012bfe653f6 | review | high |
| [Competitive P0] Kontrola regresji i bezpieczeństwo zapisu zadania | 2c58ba34-8a82-40c0-b790-657cd738ed6b | review | critical |
| [Competitive P0] Budżet wydajności kluczowych operacji (p95) | 2d7ce5a4-475e-4fb6-865d-52823b890672 | review | high |
| [Po starcie] Klucze MCP ograniczone do jednego projektu | 5808b2b2-e1f5-486d-8b65-9c652638b936 | backlog | medium |
| [Start P1] Plan premiery: gdzie, kiedy i z czym publikujemy | 5020258d-10b0-4926-870c-d6097e34f19b | review | high |
| [Start P1] Projekt startowy: pierwszy efekt z agentem w 2 minuty | 97117993-bf3b-46b2-ac28-b2788103d6e1 | review | high |
| [Start P0] Landing z jedną obietnicą + 30-sekundowe demo agenta | 7dae439b-2759-4d94-9bdc-4c2241d69ca8 | review | critical |
| [Start P0] Uruchomienie produkcji: stan migracji, maile, Sentry, uptime | f141afb1-c8cb-4fa1-a673-6caa66fc47bf | todo | critical |
| [Future] Budżety i uprawnienia autonomicznych agentów | b287cbfa-4242-402e-a788-f1a2bdc388fb | backlog | low |
| [Future] Studio projektu — GDD, referencje, skills i wyspecjalizowani agenci | 9c15ed61-f6d3-4837-b77b-69d7b158df8e | backlog | low |
| [Future] Autonomiczna pętla QA — build, test, screenshot, feedback, iteracja | 2622a0e6-dc9e-4fd4-aac2-d00f1fec25a4 | backlog | low |
| [Future] Integracje narzędzi kreatywnych — Unity, Blender i pipeline zasobów | fe280ed8-5083-4da6-8a61-59010d54c512 | backlog | low |
| [Future] Agent Runs — trwałe sesje, checkpointy i wznowienie po awarii | 7363a896-d93c-4b97-b303-f57e2d658aa2 | backlog | low |
| [Future] Autonomous Project Studio — wieloagentowe wykonywanie projektów | eec1f299-97f9-40e6-bf0e-a3b74ddc461b | backlog | low |
| [Future / Post-launch] Kanały Stable / Beta / Nightly na subdomenach | c4c53ab6-ba60-42f4-a0c6-db5ef43891a0 | backlog | low |
| [Start P1] Pilot z 3–5 testerami: onboarding agenta, landing, pierwszy efekt | 616a71da-34e6-4f3d-a69b-4ef440eba2dd | todo | high |
| [Docs P2] Lekki edytor dokumentacji projektu (rich text + Markdown) | ea2331ee-5e88-4497-af5c-3d1ffc58838e | backlog | low |
| [Start P0] Przycisk 'Onboard your agent' + bezpieczny quickstart MCP | a4f0d240-774a-4b7b-9ee3-5ddee8adc6ca | review | critical |
| [Po starcie] Globalne zaawansowane wyszukiwanie zadań (nie tylko Kanban) | 53fba2aa-205a-4671-98f1-cccc9a5b5fe8 | backlog | medium |
| Dokumenty | 72d14d4d-f308-41fe-9953-5d1247d14860 | backlog | low |
| Dropdowny | 4c1aacf7-bbc7-4d98-81f0-86be195beabd | review | medium |
| Taksi | 6d2c3a23-6b52-4e69-8cf2-28e548e9c37e | review | medium |
| Ora.ai exlusive raport | 278e7514-0414-4920-8be0-dc91a07b5ddd | review | medium |
| [Po starcie] incident.io: publiczna status page i obsługa incydentów | 2c9153b7-1591-4edf-891d-d38e96338711 | backlog | low |
| Zmienanie opisu taksu | f3bdc95c-1b04-41b7-8418-04c59ab99631 | ai_working | medium |
| Drop downy | 23054157-0802-4357-8e2b-dcf36d3b5685 | review | medium |
| Bug | 9bea1b31-cdae-4bf2-a7d7-9f7c2e20a506 | review | high |
| Tabela zadań | 2fe34c9f-5e8b-4fa8-920b-c64ae37b1cff | review | critical |
| Chrom Lighthouse report TODO | eda6cc75-98e4-4dc1-8fe9-124940c28410 | review | high |
| Optymalizacja | 2ae19947-5900-49d4-901a-3cc8ca09a4a6 | review | medium |
| Moduły | faabb7da-4ddd-4f0e-b97e-7bc4a7b0a09a | review | medium |
| Tworzenie taskow | e32224f3-e18e-4668-b40b-82b6428b52a7 | ai_working | medium |
| Moodboard | 5fd50dd5-9def-44ca-883b-c146f9a95dcf | ai_working | medium |
| favicon | 52c882bb-cffa-4374-88ad-d9049776d74d | review | medium |
| [Apple Design][AD-19] Ujednolicić potwierdzenia usuwania i tłumaczenia | b0b31bb5-728b-44c2-9ee3-1c44bae3d8a0 | review | low |
| [Apple Design][AD-18] AI Chat: IME Enter i rozmiar panelu na telefonie | a07f48c4-7f41-4609-8916-d4c43f2292c6 | review | medium |
| [Apple Design][AD-17] Usunąć zagnieżdżone landmarki main w modułach | 9897f2ed-e5ce-49fe-afb9-254f9dcf365b | review | medium |
| [Apple Design][AD-16] Ogłaszać przeniesienie kart tablicy czytnikom | 5a5c855e-71c9-45e8-a6b7-258ff742a2a5 | review | medium |
| [Apple Design][AD-15] Dostęp do wszystkich zadań w dniu kalendarza | ef920bbe-da54-4d50-9577-3448e21a44bd | review | medium |
| [Apple Design][AD-14] Semantyczne zakładki kontekstu projektu | a646858c-11b3-49cc-9b4a-1ae46ef21cd2 | review | medium |
| [Apple Design][AD-13] Pokazywać loading/error/retry w wyszukiwaniu | 23164257-6728-422f-98c8-9c7eb808d576 | review | medium |
| [Apple Design][AD-12] Usunąć opóźnienie podczas przycinania obrazu | f6cd7f5f-fa7a-44d8-959e-9fc7c5a629b2 | review | medium |
| [Apple Design][AD-11] Ulepszyć gest przewijania zdjęć lightboxa | 8e9886e8-ef1a-470d-a5c0-18d585c37200 | review | medium |
| [Apple Design][AD-10] Wariant jednolitego tła do pracy w skupieniu | 5d01af5c-f84d-45e0-90ab-ed2e11184b5b | review | medium |
| [Apple Design][AD-09] Uprościć hierarchię nawigacji i sidebara | 490cfed2-b450-4c64-8741-f63fb2d10c40 | review | medium |
| [Apple Design][AD-08] Dodać reduced transparency i high contrast | 67546676-56bb-4779-8f0e-74fdde7449fb | review | medium |
| [Apple Design][AD-07] Uwzględnić reduced motion w animacjach JS | c4e5b155-017a-42f5-bd05-30bcd74db083 | review | medium |
| [Apple Design][AD-06] Zwiększyć cele dotykowe podstawowych kontrolek | 1031004a-4c2e-4883-af71-f4d209ace5ed | review | medium |
| [Apple Design][AD-05] Bezpieczne przewijanie i wysokość długich dialogów | a22fac2f-033f-4b13-9249-7eee12e3db8b | review | high |
| [Apple Design][AD-04] Udostępnić przełącznik widoczności hasła z klawiatury | 5cb630da-5e1e-46e1-92e9-965da223bf9b | review | high |
| [Apple Design][AD-03] Dostępność AI Chat: nazwy kontrolek i komunikaty live | d4589b03-aeee-434a-980b-b0f5922cc990 | review | high |
| [Apple Design][AD-02] Chronić niezapisane zmiany zadania i szkic tworzenia | 643ae2c5-f1d1-4291-9ded-8a4796598bed | review | high |
| [Apple Design][AD-01] Anulowanie przeciągania nie może zapisywać zmiany | 5ad45e44-03bf-4b55-b7fd-966ea75b44bf | review | high |
| Plakietka BETA | 6fdc95eb-3afd-4703-80d1-8f63c0b22632 | review | high |
| Feedback | 56b3bd1f-0b60-4e07-8f26-9561388e5eae | review | medium |
| [Release P0] Paczka standalone bez konfiguracji i lokalnych danych | 7acbf37e-00cc-4a67-b024-1159da7740bc | review | critical |
| [Security P0] Usunięcie podatnych zależności przed premierą | dec8686b-4eee-4b95-a657-eaf026da9b97 | review | critical |
| Tablica zadań | a9f55d4d-0b00-4a4f-b197-52d3d2f7c5e9 | review | medium |
| Moduły | 94dbb45e-f214-4469-b8d2-72af8ffa004e | review | medium |
| Uporządkowanie sidebara | ea3622d9-cf1f-44c6-9691-fc0f407d867a | review | medium |
| Przypinanie zadań | a583998f-0821-4a53-81bf-65ad83ea5e19 | review | medium |
| Rozsówanie side bara | 1dd092c3-17b8-4554-aaab-e807465b1fca | review | medium |
| Ikony | 4ea9813c-d2df-4654-a15b-410765782713 | review | medium |
| Przyciski | 1ff5fc67-ca91-46e3-bc1a-0584ccd9a345 | done | medium |
| Ikona projektu i organizacji | b9306fa9-3d40-4ed9-b2f7-cd3437e383c7 | done | medium |
| Tablica zadań | 8424bcaf-6283-43d7-bdd7-1ef89f97fc42 | done | medium |
| [Triage P0] Review: weryfikacja zadań i decyzje release blockers | 1ca736ec-e450-4809-becd-fd989dc3c208 | review | critical |
| [Context Engine P1] Observability, backfill i koszty AI | 239c8792-592c-43f1-b516-9ee9882ee205 | backlog | low |
| [Context Engine P0] QA: E2E, uprawnienia, regresja i quality gates | 9ddf32fc-8c1f-4c59-9442-408b7c3cd8bb | review | critical |
| [Context Engine P1] Agent runs: raporty zmian i przypisanie wyników | 40cabe84-befa-4bcf-9cd1-cf1fba571e5c | backlog | low |
| [Context Engine P1] Panel kontroli źródeł i prywatności | 3632876e-46e5-48ee-bd1f-a1f2b2f4e7eb | review | high |
| [Context Engine P1] Why Panel z historią i źródłami | 6c2b6ba6-9c07-494d-8465-7dab25449940 | review | high |
| [Context Engine P0] Context API / MCP dla agentów | e8151b63-0b4f-4ff0-9861-07a661d6d6ce | review | high |
| [Context Engine P0] Living Project Memory: aktualizacje z dowodami | a63ffcf0-b6ee-4c59-a414-0d35c6907842 | review | high |
| [Context Engine P0] Smart Linking: zadanie ↔ commit ↔ PR ↔ decyzja | 409bda91-9483-420c-97e9-1411e6bc84fa | review | high |
| [Context Engine P0] Event capture i dziennik aktywności | 1081abc6-1a01-43d4-a7d2-93025d983a62 | review | critical |
| [Marketplace QA] E2E instalacji, wersji i ochrony tenantów | b8127b26-3187-4f0a-92ed-4f4ac5042d4f | review | high |
| [Marketplace V4] Model płatnych modułów i rozliczeń autorów | 73e5b3b9-0a22-4526-9e97-1aa97143c6a4 | review | low |
| [Modules V3] Automatyzacje, API zdarzeń i połączenia MCP | 5b56a965-aa3f-400a-84f1-be2b267adc09 | review | medium |
| [Modules V3] Developer SDK + Monaco + sandbox runtime | d1c7c5fe-9f96-4a6f-8099-c1555c642921 | review | medium |
| [Marketplace V2] Developer Dashboard i historia wydań | 24207c27-8df4-4b00-b7ed-89c2e9028217 | review | medium |
| [Marketplace V2] Registry, review i publikacja modułów | 423650d6-fb31-4325-a6e8-8b01d8954e20 | review | medium |
| [Modules V1] Visual Editor pól, widoków i formularzy | 7354e24f-df38-4e1d-b9cc-ab9b7af89a55 | review | medium |
| [AI Builder V1] Live Preview, walidator i testy modułu | 02c6dccb-028b-492f-9127-4fa53b6d24f6 | review | high |
| [AI Builder V1] Edytor 3-panelowy i mobilne zakładki | a1dc8b04-9b9c-4008-bb28-96165316858f | review | high |
| [AI Builder V1] Kreator prompt → plan → deklaratywny schemat | b899da0b-b866-482c-a6f4-bebbfa3e2110 | review | high |
| [Marketplace V1] My Modules: ustawienia, update i odinstalowanie | 9236e9a3-e16f-40b5-976d-8648f0d4fa2b | review | high |
| [Marketplace V1] Kreator instalacji i przypisanie do projektu | 59a40246-a613-4b06-a0c6-5d72de737fb3 | review | high |
| [Marketplace V1] Szczegóły modułu, demo i jawne uprawnienia | 99b24c36-0d1c-4f34-9f35-513fee53222e | review | high |
| [Marketplace V1] Nawigacja, katalog i wyszukiwarka modułów | 57efc91d-f906-4695-83a7-e5b490cb353a | review | high |
| [Modules V1] Bezpieczny renderer i izolacja danych modułów | 3b90c28d-2315-4cf3-90bf-d59fb7d1ca5e | review | high |
| [Modules V1] Specyfikacja manifestu, wersjonowania i uprawnień | ac70962d-b2db-4884-960c-b80e44c370bf | review | high |
| Sidebar | 943ec8be-a492-49b3-bb8f-ece60ef7e603 | review | high |
| [QA][P0] Release gate: testy, backup, migracje, rollback | 5b734e2a-9d94-4e3e-a6d2-430b1cdf4b3c | review | critical |
| [QA][P1] Performance i regresja dużych projektów | 40e24352-0ff3-4f23-abf0-80db6439c4df | review | high |
| [QA][P1] AI: dostawcy, timeouty, budżety i bezpieczne odpowiedzi | 3be4feeb-795e-491d-8909-3156cb99be52 | review | high |
| [QA][P1] Moduły: roadmap, decyzje, wiedza, pliki i custom modules | ec708b24-27a0-4dd2-bd2e-5f397736ad65 | review | high |
| [QA][P1] Webhooki: podpisy, SSRF, awarie i retry | d94e8175-e41a-4522-a4ff-6bd0cada8ad4 | review | high |
| [QA][P1] Accessibility: axe, klawiatura i kontrast | 868d6605-ffe3-4507-a565-2f816a330508 | review | high |
| [QA][P1] Mobile i responsywność: iPhone Safari/Android | c011cbbb-bc9a-47db-b810-6e4f116ea078 | review | high |
| [QA][P0] Stripe sandbox: subskrypcje, idempotencja i uprawnienia | 9129015e-486d-4e2c-9e6a-1ec3d2734446 | review | critical |
| [QA][P0] Testy izolacji organizacji i autoryzacji API/MCP | f76a9572-8004-492f-b560-ab88e99fdde4 | review | critical |
| [QA][P0] E2E: Kanban, taski i współbieżne edycje | d7b880f7-d561-4746-9998-1417995202fe | review | critical |
| [QA][P0] E2E: onboarding, organizacja i pierwszy projekt | 0a88a2dd-5827-40fe-8f61-516039ad5a67 | review | critical |
| [QA][P0] E2E: rejestracja, logowanie, reset hasła i sesje | faf1537d-aed4-4a50-b2ab-f2d105c2db7e | review | critical |
| [QA][P0] Playwright E2E: konfiguracja, fixtures i CI | ab507a10-28c0-4c81-a35c-5c2d6bdd0cab | review | critical |
| [Feature] Feedback Portal / public roadmap | 08175b12-c32c-4d97-8611-690365e866d3 | backlog | low |
| [Feature] Custom Modules 2.0 | 946f9a27-384d-4bcd-b713-aaca481c76d5 | backlog | low |
| [Feature] QA & Release Management | 39827fd1-de87-4b84-9730-dca0e71287e7 | backlog | low |
| [Feature] Sprint Planning i zaawansowane raporty | 250512fd-6e92-4b6b-90bc-a44d780a9329 | backlog | low |
| [Feature] AI Project Health & Daily Briefings | 01bfc373-f34b-42c1-9240-54057bdb3398 | backlog | low |
| [Feature] Visual Automation Builder MVP | bebaa190-9874-4cfa-b1e9-0d601c21a6a5 | backlog | low |
| [Feature] AI Agent Control Center MVP | 1eb76523-da33-452b-9c51-1d29f050c749 | backlog | low |
| [Feature] GitHub Development Hub (większość jest już w Smart Linking, PR #87 – sprawdzić, co zostało) | f135cc67-9109-4401-af53-cdefdbd8131e | backlog | low |
| [Feature] Project Analytics MVP | 79aacf7f-7130-4690-9827-f4f1cc781e9e | backlog | low |
| [Reliability] Kolejka webhooków, retry i historia dostarczeń | c83d728d-3baa-4ae0-a87b-3ccd06552e49 | review | high |
| [Launch] Materiały promocyjne i test 3 reklam Guidona | 0d072e51-6957-4b16-937a-1608c77a35b9 | todo | medium |
| [Launch] Analityka lejka rejestracja → aktywacja → subskrypcja | de9151ad-aa1c-40ba-9467-018e5f7b2a48 | review | high |
| [Launch] SDK npm/PyPI + dokumentacja Quickstart | 5217830b-cd3d-4e0c-bb9b-3b7a2c7288df | review | high |
| [Launch] Monitoring produkcji, backup/restore i procedura rollbacku | 2cc56dff-6011-4e2f-b0eb-15c17c2baf24 | review | high |
| [Launch] Kontrola bezpieczeństwa i izolacji tenantów przed publikacją | 97feeeb4-f5e0-4e20-aa49-a3e547f525a1 | review | critical |
| [Zablokowane] Produkcyjne Stripe, webhooki i obsługa błędów billingowych | bb72c893-999d-403b-a49b-d11512cef82b | backlog | high |
| [Launch] Audyt gotowości do premiery i scenariusze end-to-end | 57226c85-3237-4ebd-bf05-045cfca1315d | review | critical |
| Ora.ai TODO Ma być 100 | 25ed0b4f-9aea-4e6b-880c-cc02c62e4722 | review | medium |
| Przygotowanie do sprzedaży | 0a279bcc-f782-4291-bf1f-b122afc695ca | review | medium |
| Pzepmieszczanie po tabeli zadan | 17cee839-1a4e-46e0-9a3a-f78625c4ef76 | review | medium |
| Tapeta | bc13beaa-2384-40ea-8284-6e41591a8cc7 | review | medium |
| Górny pasek | 53ee3ecb-e77d-44d2-9b73-28e2b4039f4f | review | medium |
| Pliki | f43993bc-78bc-46b3-a80b-252d6aeb35b9 | review | medium |
| Fix | b1c937b4-c2c0-41ff-9c32-9433034890b3 | review | critical |
| Isagentic TODO ma być lepiej | 8fe7fe45-dbc0-44b9-8de9-a191cf355889 | review | medium |
| Ora.ai TODO Ma być 100 | d28efad9-0ab6-45b4-bf02-e60f7385afab | review | medium |
| Wiadomości e-mail | 87989780-8e82-42e7-9276-63b735ccf513 | review | medium |
| Seciurity audit | 6ab77230-977b-47b8-aab1-523ad1c0f94e | review | medium |
| Przypięte zadania | 166c0ff3-e421-4209-96c7-bdfa0285e5bb | review | medium |
| Filmy instruktażowe | 2520249f-870f-4376-a968-1359990cbdfa | review | medium |
| AI | 00de1380-3000-482e-97e0-d6f27994a6ca | review | medium |
| Kalendarz | e64b77a1-6c57-482a-b0ed-61c1648b45df | review | medium |
| Dostosowanie | 4f55821e-1320-4530-9ad3-0411a7d92954 | review | medium |
| E-mail supportu | 57fc5b25-444b-406a-8480-f7660f5863d0 | review | medium |
| Niebezpieczne | 121c8707-0178-444e-85ef-9a9becdeb68d | review | critical |
| Błędy | 979f2e2e-4a63-4250-96dc-b6d1371c3f5e | review | medium |
| Dropdowny | eb5a768e-f7a7-432e-b496-b4fee5ff9bd9 | review | medium |
| Przypinanie projektów | 8c8f00ef-2c06-495e-ad3d-7c007a12d194 | review | medium |
| Do zrobienia | e461f6f5-de5a-4650-937d-1970b147c9f6 | review | medium |
| Apple Store | 48fd6f5c-6d10-457c-a0bf-d5fed18e55ed | review | medium |
| Popraw | 9f22449e-0f9a-45ce-8286-e26ca8773d47 | review | medium |
| Dla Apple Store | bf58bb33-5084-414e-98a5-0bd76004d3e5 | review | medium |
| Onboarding | 61860d92-2f6e-417b-a757-261fa04a6f92 | review | high |
| Apple Store complience | b00d44bb-1658-4bb6-b77b-80a032c5b206 | review | medium |
| Optymalizacja | e62a97c6-56d5-4f2c-95d3-ccf27d35737c | review | medium |
| Billing grace period | 5b26144a-772f-4d03-bd0f-a9a4f27b84d8 | review | medium |
| EULA | e9372209-a1a4-42ec-9fb5-8d05e1375bb1 | review | medium |
| Free Trial | 951eb8d3-84e6-4c44-8f57-fe3a66145b12 | review | medium |
| Płatności | 721af418-cbfa-4dc3-85b4-972876660ffd | review | medium |
| Corner Concentricy API Apple | d8daf8d2-d20e-4bc8-a49f-fdc168c371bf | review | medium |
| Oriented transition | 07ee0896-8149-4b14-af2b-65bd90e70b59 | review | medium |
| Optymistic UI | 1e7c5979-3f5f-42d5-91fd-32521619a99b | review | medium |
| Dodanie haptic feedback | 13b5a50b-78cd-4c70-83b0-590965c9e4c5 | review | high |
| Ustawienia kategorii Done | 20661505-d889-4927-9659-9d78f4316a5e | review | medium |
| Tabela zadan | 08ab2ff4-0231-427a-9069-b1ff5fb23666 | review | medium |
| Kody promocyjne | 21a9ce8c-88c5-48d8-9fc5-8b726128bc72 | review | medium |
| Funkcje AI | 15567533-efff-4e59-be83-1fefc28fbd2b | review | medium |
| Edycja kodu w plikach | c9a70b29-199c-4f57-b834-12b1b30fe0d9 | review | medium |
| Import tasków | 82239b6c-5b36-47ea-ab97-b2ba4dda4339 | review | medium |
| Logowanie | a09cad93-8df8-455d-a5ba-9eea7b48a789 | review | medium |
| Zmienić localhost | 3b17b1c5-403e-4f37-a8aa-ebac31e42af1 | review | medium |
| Język projektu | 9f586710-da7c-47f3-a061-0bf29b4c5d47 | review | medium |
| Członkowie | d11343e7-a809-405b-aca5-0c1a9aed7d53 | review | medium |
| /dashboard | 85d2997e-0422-4e1b-9c6a-e586113402ba | review | medium |
| Marka | db4e63c0-cba9-42b7-9ffd-1976e66ed87b | done | high |
| Github | 914a6ba9-3689-4b8b-96a7-789db32d9722 | review | medium |
| Dokumentacjs | 608a6f46-dfe8-4457-b8aa-e6cc22e9d565 | review | low |
| Znaczek new | 49b4f8ea-c026-444b-93e0-d6963c6be482 | review | low |
| Dźwięki | c661cc19-29bc-45c9-bbf9-c9f1084d26b9 | review | medium |
| Import .guidon | 1f63b8f1-2e4d-4f39-80a8-3fb7e8a73099 | review | medium |
| Dodawanie customowych tapet | 12db20de-8b3b-4447-bdee-1cd2495890bd | review | low |
| Moduły | c369fde2-aa78-4880-91f5-ef57f61d9d52 | review | medium |
| Skróty klawiszowe | 4e96ca72-eb41-43cf-87c1-860258ff01f8 | review | medium |
| Strefa zagrożenia w ustawieniach | a1bb3455-00db-44f6-8343-8532622129ea | review | medium |
| Tabela zadań | 5c68b703-e326-467a-b0c8-a757a8e3efa2 | review | medium |
| Kontrast tekstu | d4de6031-acab-4afb-8670-aa2a4bd122e6 | review | medium |
| Tło | d9418bb8-4524-4d96-b70e-cf8dbe2f8820 | review | high |
| Bot na strtonie | ddd5295f-330a-43e2-b3fc-3bbce78e6d5f | review | medium |
| Wyswietlanie linków | 47ef61ef-5ecc-4bc0-84bd-ebfc878a6712 | review | medium |
| Hackowanie aplikacji | bd659cbe-8fd0-4fef-81cc-a9cc8e30a391 | review | high |
| Opisy taskow | 67e8653d-cee4-4fc1-aa5e-4fb4b1a80ad8 | review | medium |
| Title metadata | 7442f9ee-5263-403b-be7d-61c118c944eb | review | high |
| 1 projekt | aa60b5a7-c18c-4d08-9f2c-bd1030f652c8 | review | medium |
| Customowych Kolumny tablicy | 5f5d3108-1c22-433a-9d93-d0f41b632d98 | review | medium |
| AI | ffad82d4-428e-4b3f-8db4-7782e7dc1a1f | review | medium |
| Ikony | 5bee625e-d56b-486c-90f4-804ef2026e1b | review | medium |
| Implement bulk actions on Kanban board | 5b2e3380-f9bd-4a63-8e3a-0c453d09c6eb | review | high |
| Implement cross‑project 'Moje zadania' view | 73770ff8-a17d-475a-8d72-339329ef313c | review | high |
| Implement cyclical tasks (L) with rule (weekly, monthly, every N days) and automatic repetition upon completion | ceff0b5c-e5df-46cd-a0a2-d7edb55faefc | review | medium |
| Skleton lodery | dcce0d71-32a3-48d5-91ca-f247c066c1c2 | review | medium |
| Ulepszenie MCP | 56c73921-1a6c-4978-8e2e-ef9145248243 | review | high |
| Konta dla AI | 28425368-63fa-402d-b632-dcaa0eeef0ed | review | medium |
| Moduły | 4eefc9b5-34c1-4deb-ae9c-627d9ba7f553 | review | high |
| Przegloąd wygodu | ca7cdde2-c3bb-4613-9de7-c2bc7561f958 | review | medium |
| Dodawnie daty do taskow | cfc5399a-f6e1-45d7-81ef-82b3c1dc371a | review | medium |
| Zarzadzanie priority | b4cd140a-b21f-4145-ab73-7bf26d681b3e | review | medium |
| Wieksza customizacja taska przy tworzeniu | ba3c8766-2ff0-425e-b928-49edaca757df | review | medium |
| Naprawa schowanego sidebara | 05267149-61d3-49cd-a73d-baa192531d64 | review | high |
| Zwiększenie modularności aplikacji | d26ecfc0-47dd-479c-8d88-c3d569980469 | review | medium |
| Dodanie podpisów | 68d4a7e0-2feb-4696-bc1b-5a6fa1499366 | review | medium |
| https://is-agentic.com/ | 50980517-0e64-4a3f-92ee-8a0a967abf7d | review | medium |
| Zgłaszanie błędów | cea3023f-10bf-4c1f-86e7-7b57c4dc4944 | review | medium |
| Auto Complite | fa6562a5-9239-46c6-bc11-81b089ef05a1 | review | medium |
| Scalenie pluginów | c8389b6c-5e91-4759-99a6-c71c2383b418 | review | medium |
| Dopracowanie wyglodu wersji mobilnej | e06ff1a3-9856-435f-a6e1-34de8dcdfa4b | review | high |
| Aplikacja desktopowa | 777cd7ba-b3e3-4fe9-88bf-94673ee914e6 | review | high |
| Powiadomienia | ad94465b-6784-42c4-bb63-c918c6398045 | review | high |
| Okno zadań | d7d8e52f-1d06-4299-b5a3-c450be9ca840 | review | medium |
| Zrobienie bota/integracji Slack (odpowiednik bota Discord) | 07a1c2da-15c2-4658-b210-0ab8f81cc0f3 | review | medium |
| Dodanie prezentów Tasków | 1157bcf9-dddc-4707-a227-a2040c348c90 | review | medium |
| Błąd | e12afb78-c728-4762-bfbc-0ca2cb1ef3ac | review | critical |
| Zmienić logowanie do bota przez normalne konto | addd24dc-6980-47c3-9a5d-16b6d26d9303 | review | high |
