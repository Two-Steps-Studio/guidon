# Context Engine QA — 2026-10-28

Guidon task `9ddf32fc` ([Context Engine P0] QA: E2E, uprawnienia, regresja
i quality gates). Każde kryterium zadania ma tu wskazany dowód: test,
który go sprawdza, albo jawnie opisaną lukę. Nic nie było testowane na
produkcji.

## Wynik

- **Nie znaleziono krytycznych błędów bezpieczeństwa.**
- **Znalezione i naprawione w tym przebiegu:**
  1. **Zdarzenia GitHuba poza kolejnością cofały stan PR.** Spóźnione
     `synchronize` albo `opened` po `closed` (merged) zmieniało link
     z „merged” z powrotem na „open”. Teraz zmergowany PR zostaje
     zmergowany, a zamknięty otwiera się tylko przez `reopened`
     (`nextPrState` w `src/lib/github/link-core.ts`). Nowy test E2E nie
     przechodzi bez tej poprawki.
  2. **Ranking decyzji w `get_project_context`.** Kod sprawdzał status
     `accepted`, którego schemat nie ma (są `proposed`, `approved`,
     `rejected`, `deprecated`), więc zatwierdzone decyzje nigdy nie
     dostawały wyższej wagi. Teraz sprawdza `approved`.

## Pętla end-to-end

`tests/e2e/agent-loop.mjs` w każdym przebiegu `npm run test:e2e`
(Chromium). Prawdziwe `/api/mcp`, podpisany webhook GitHuba i okno zadania:

1. Agent wywołuje `list_tasks` i `get_task_context`. Pakiet zawiera regułę
   projektu i powiązaną decyzję.
2. Agent wywołuje `start_task` i `record_attempt` z wynikiem „failed”.
3. Commit i PR z `guidon#…` dają potwierdzone linki:
   - powtórzony push nie dodaje niczego;
   - spóźnione `synchronize` po merge'u nie zmienia stanu „merged”.
4. Repozytorium innego tenanta, które wspomina to zadanie, nie tworzy linku.
5. Kolejne `get_task_context` zaczyna od `[FAILED]` z przyczyną i pokazuje
   zmergowany PR.
6. Agent wywołuje `comment_on_task` i `set_task_status review`.
7. Pamięć z zakończonego zadania:
   - pokazuje `Evidence: task <id>`;
   - po ponownym otwarciu zadania znika (migracja 098).
8. Klucz innego tenanta dostaje błąd z `get_task_context`,
   `get_project_context` i `list_task_links`, bez żadnej treści.
9. Okno zadania pokazuje decyzję w panelu „Why” i PR w „Linked code”.

## Kryteria

| Kryterium | Dowód |
|---|---|
| E2E: zadanie → praca agenta → commit/PR → link → pamięć → Why → Context MCP | `agent-loop.mjs` (wyżej) |
| Wielu tenantów | `agent-loop.mjs` (obcy klucz, obce repozytorium); `api-isolation.mjs`: kontekst obcego projektu daje 404 przez REST i błąd przez MCP, jego pamięć nie wychodzi; `test:db` sekcja 81: RLS `task_links` dla viewera, developera i obcego tenanta |
| Odebrany dostęp do repozytorium | `smart-linking.mjs`: odłączone repozytorium jest oznaczone „Repository no longer connected”; webhook z niepodłączonego repozytorium nie tworzy linków (`agent-loop.mjs`) |
| Sprzeczne dowody | `smart-linking.mjs`: sugestia potwierdzona jawnym odnośnikiem, odrzucenie przetrwa kolejne zdarzenia. `test:ai`: pamięć nie łączy faktów różniących się liczbą lub wersją. Kontekst oznacza wpisy starsze niż 180 dni jako „stale” (`test:context`) |
| Złe linki | `test:github`: fałszywe trafienia (ogólne słowa, jedno wspólne słowo, odnośniki-podróbki, niepowiązane PR-y), najwyżej 3 sugestie, confidence < 1. Odrzucenie w UI (`smart-linking.mjs`) |
| Zdarzenia poza kolejnością | `nextPrState` (`test:github`, 5 przypadków) i `agent-loop.mjs` |
| Powtórzone dostarczenie | `agent-loop.mjs` (ten sam push dwa razy, jeden link). Unikalność `task_links (task, kind, repository, ref)` (`test:db` 81). Komentarze i zmiany statusu z webhooka są claimowane per zdarzenie (`github_task_events`) |
| Wycieki uprawnień | `api-isolation.mjs` (125 sprawdzeń REST/MCP); `test:db` 81–82; obcy klucz w `agent-loop.mjs` |
| Prompt injection | `test:context`: nagłówki, bloki kodu, HTML i linie poziome z tekstu użytkownika są neutralizowane, tekst przypominający instrukcje jest oznaczany. `api-isolation.mjs`: wpis „Ignore all previous instructions…” jest oznaczony w prawdziwym pakiecie. Pakiet mówi agentowi, że treść to dane, nie polecenia |
| Usuwanie danych | `test:db` 81 (usunięcie zadania usuwa jego linki); 82 (ponowne otwarcie lub usunięcie wycofuje niezweryfikowane wnioski, zaakceptowane zostają, usunięcie projektu działa); sekrety są redagowane przed wysłaniem (`test:context`, `api-isolation.mjs`) |
| Bez zgody na zewnętrzny LLM | Pakiety kontekstu nigdy nie wołają LLM: są składane dosłownie z wierszy pod RLS (`agent-context-builder.ts`). Uczenie z zakończonych zadań (`task-learning.ts`) działa tylko, gdy: (1) projekt ma włączone AI (`projects.ai_enabled`, migracja 046), (2) moduł Memory nie jest ukryty, (3) organizacja skonfigurowała dostawcę. Jego wynik to niezweryfikowane wpisy do review |
| Trafność i świeżość | `test:context`: ranking (reguły > decyzja powiązana > nieudane próby > fakty…), trafność względem zadania i `focus`, kara za wiek, oznaczenie stale, budżet tokenów dla całego dokumentu |
| Opóźnienie | `agent-loop.mjs` mierzy `get_task_context` przy 300 wpisach pamięci. Budżet testu: 5000 ms. Lokalnie (serwer deweloperski): 67–442 ms. Wartość z CI jest w logu E2E („pass agent loop … ms”). `npm run perf:large` mierzy tablicę i API przy 1000–3000 zadaniach |

## Czego ten przebieg nie sprawdza

- **Supabase Cloud.** Brak stagingu (ograniczenie zapisane w pamięci
  projektu). Ścieżka self-hosted z tymi samymi politykami RLS jest
  przetestowana. Wdrożone polityki w Cloud trzeba sprawdzić po migracjach
  (zadanie `f141afb1`).
- **Uczenie z prawdziwym modelem.** `test:ai` sprawdza wybór zadań, czytanie
  odpowiedzi i deduplikację. E2E wstawia wniosek tak, jak robi to
  `task-learning`, ale bez wywołania dostawcy (w CI nie ma kluczy i nie
  płacimy za wywołania).
- **Trafność na prawdziwych danych.** Ranking jest regułowy i sprawdzony na
  przypadkach. Brak oznaczonego zbioru danych. Ocenę z ludźmi przewiduje
  pilot (`616a71da`).
