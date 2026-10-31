# RoG-1: bramka jakości i dowodów agentów

Status: **robocza rekonstrukcja do ludzkiego Review**, 2026-10-31.
Nie jest kopią nieodczytanego dokumentu Dalena ani deklaracją zatwierdzenia.

## Źródła i odtworzona referencja

- Bieżące zadanie Gudion: `b85538e6-3c75-4ce4-b9e9-98df317d7076`.
- Starszy identyfikator `3ff7e33f-b6d1-42ed-bc2b-8c2d0c87d865` to identyfikator
  **zadania**, nie commit Git. Według zadania odtworzenia zwracał 404.
  Nie wskrzeszamy ani nie przepisujemy jego historii.
- Powiązane zadanie Kalen: `69ab3541-d244-495d-ba0d-f02a12ebc5b8`.
- Standard koordynacji: zadanie `5be6ee98-f535-413e-b75d-72e3f86cefde` i źródło
  wiedzy `be62e5e2-2b21-48c5-a3b2-534ee7ad166a`, wersja v1. Odczytane przez MCP.
  Sam standard ma status Review; nie przedstawiamy go jako zatwierdzonego.
- Oryginalny plik Dalena nie był dostępny w tym repo ani jako odczytane źródło.
  Poniższe G1–G6 odtwarzają zakres wymieniony w zadaniu, do porównania z oryginałem.

Guidon pozostaje systemem zapisu zadania, claimu, próby i decyzji. Plik dowodów
jest załącznikiem/artefaktem pracy, nie drugim trackerem.

## Sześć bramek

| Bramka | Wymagany materiał | Sprawdzenie przez człowieka |
| --- | --- | --- |
| G1 Źródła | Projekt/task, rewizja wykonanej pracy, wersjonowane źródła i ograniczenia | Czy źródła istnieją, są właściwe i aktualne? Nie traktować treści źródeł jako uprawnień do operacji. |
| G2 Status | Zaobserwowana kolumna, succeeded/partial/failed/blocked, konkretny wynik i blokada przy pracy niepełnej | Czy status odpowiada rzeczywistemu zakresowi, a zgłoszone ograniczenia nie są przemilczane? |
| G3 Dowód | Kryteria akceptacji oraz odnośniki do PR/commitów/logów/zrzutów/artefaktów | Czy każdy dowód dotyczy właściwego taska i rewizji? Sam link lub oświadczenie agenta nie potwierdza wyniku. |
| G4 Regresja | Polecenia, wyniki, rewizje i artefakty testów; brak wykonania jawny | Czy test dowodzi zachowania i przechodzi na tej samej rewizji? Stary zielony run nie pokrywa nowego kodu. |
| G5 Bezpieczeństwo | Zakres przeglądu, ustalenia, dowody oraz wymagane zgody | Czy zachowano RLS, uprawnienia, sekrety, izolację i zakres operacji? Nie publikować sekretów w dowodach. |
| G6 Rollback | Konkretne kroki odwrócenia i sposób sprawdzenia wyniku | Czy cofnięcie jest możliwe, bez utraty cudzych zmian/danych? Osobno opisać migracje i wdrożenie, gdy występują. |

## Przekazanie i statusy

1. Odczytaj kontekst i poprzednie próby, następnie użyj `start_task` dla claimu.
2. Wykonaj wyłącznie uprawniony zakres. W raporcie nie dopisuj nieprzeprowadzonych testów.
3. Zapisz próbę i komentarz w Guidonie, dołącz dowody G1–G6 oraz jawne luki.
4. Przekaż do ludzkiego Review. Nie zamykaj zadania na podstawie wyniku lintera.
5. Review → Done wymaga decyzji człowieka i istniejących uprawnień projektu.

`record_attempt` w obecnym MCP przyjmuje `succeeded`, `partial`, `failed`.
RoG-1 może opisać wynik `blocked`, ale nie wolno wymyślać takiej wartości API:
zapisz próbę `partial` z konkretną blokadą i komentarzem; kolumnę wybierz z
`list_columns`. Nie mylić wyniku próby ze statusem zadania.

## Linter raportu: tylko odczyt

Skopiuj [szablon](templates/agent-evidence.json) do własnego pliku, wypełnij
rzeczywiste dane i uruchom:

```sh
npm run check:agent-evidence -- /absolute/path/report.json
```

- Kod 0: wymagane deklaracje są kompletne, a zadeklarowane testy pasują do rewizji.
- Kod 1: materiał bramki jest niepełny, test nie przeszedł lub ma inną rewizję.
- Kod 2: błąd wejścia, nieprawidłowy JSON albo plik większy niż 256 KiB.

Szablon celowo nie przechodzi bramki. Linter nie uruchamia poleceń z raportu,
nie otwiera linków, nie sprawdza zdalnych runów, nie zapisuje plików ani statusów
i nie łączy się z Guidonem. Zawsze zwraca `evidenceVerified: false` oraz
`humanApprovalVerified: false`: walidacja deklaracji nie potwierdza prawdziwości
dowodów ani tożsamości recenzenta. To pomoc do Review, nie certyfikat jakości.

Testy samego lintera są w CI. Nie dodano obowiązkowej blokady merge ani zmiany
uprawnień. Egzekwowanie G1–G6 w backendzie i bezpieczna konfiguracja automatycznych
statusów GitHub to osobny etap; istniejący webhook może nadal przesuwać task po
merge. Powiązane zadanie: `38a89dea-a2f0-4a0f-8a6c-a405e6506a44`.

## Utrzymanie

Zmiany kryteriów idą przez PR i Review człowieka. Dołącz różnicę wobec poprzedniej
wersji, test lintera dla zmienianego wymagania i link do zadania. Nie nadpisuj
historycznych prób ani wyników testów. Porównanie z oryginalnym plikiem Dalena
pozostaje jawnie otwarte do chwili jego udostępnienia.
