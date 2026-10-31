# GitHub PR → status zadania: stan i luki

Zadanie `38a89dea-a2f0-4a0f-8a6c-a405e6506a44`, baza `11ab806f`.
Zakres tej iteracji zgodnie z opisem zadania: audyt istniejącej funkcji i QA.
Nie zmieniono statusów produkcyjnych, uprawnień ani konfiguracji GitHuba.

## Istniejące zachowanie

`src/lib/github/task-refs.ts` planuje komentarz i docelowy status:

- push startuje niepodjętą pracę;
- otwarcie/reopen/ready PR kieruje zadanie do Review (draft tylko do In Progress);
- merge do domyślnej gałęzi kieruje niezakończone zadanie do Done;
- merge do innej gałęzi i close bez merge pozostawiają status.

`webhook.ts` wymaga jednoznacznego dopasowania zadania w podłączonym projekcie,
zapisuje zdarzenie/komentarz i wykonuje przejście jako osoba łącząca repo pod RLS.
`github_task_events` deduplikuje `(task,event)`. `nextPrState` w `link-core.ts`
chroni **stan linku PR** przed spóźnionymi zdarzeniami. To nie jest to samo
co ochrona ręcznie ustawionego **statusu zadania**.

`npm run test:github`: 72 testy PASS. Sprawdzono planowanie przejść,
podpisy, referencje, zakres repo i kolejność stanów linków. Ten zestaw nie dowodzi
istnienia konfigurowalnych reguł ani pełnego retry przejścia po awarii zapisu.

## Potwierdzone luki względem zadania

| Wymaganie | Stan |
| --- | --- |
| Edytowalna mapa zdarzeń/statusów i jawny opt-out | Brak w obecnym plannerze; reguły są stałymi w kodzie. |
| Trwały manual override | `shouldMove` sprawdza bieżącą kolumnę/is_done, nie intencję osoby ani wersję ręcznej decyzji. Późniejszy PR może ponownie przesunąć zadanie z dozwolonej kolumny. |
| Retry po błędzie przejścia | `applyActions` zapisuje `recordEvent` przed `setTaskStatus`; wynik `!ok` dopisuje do skipped. Kolejna identyczna dostawa zostaje pominięta jako już obsłużona. |
| Out-of-order dla statusów zadania | Ochrona `nextPrState` dotyczy linku; planner/status nie opiera decyzji na zapisanym porządku zdarzeń PR ani rewizji ręcznej zmiany. |
| Human Review → Done w RoG-1 | Merge może ustawić Done bez osobnego potwierdzenia w Guidonie. Read-only linter RoG-1 nie egzekwuje ochrony backendowej. |

## Następna implementacja

W jednym spójnym przebiegu zaprojektować projektowe ustawienia reguł, trwały
manual override i atomową/idempotentną historię zastosowania przejścia. Odróżnić
zapis komentarza od zakończonego przejścia statusu. Dla istniejących instalacji
przygotować jawną migrację zgodności zamiast po cichu zmieniać zachowanie merge.
Nie używać uprawnień człowieka jako sposobu omijania bramki jakości agenta.

Wymagane regresje: duplikat po sukcesie; błąd przejścia i retry; zmiana człowieka
między dwoma zdarzeniami; spóźnione open/ready po merge; PR z forka/innego
projektu; wyłączona automatyzacja; niestandardowa/ukryta kolumna; merge przy
wymaganym ludzkim Review. Sprawdzić oba backendy, RLS oraz rollback ustawień.

Ocena nie zamyka luk. Zadanie pozostaje w Todo na etap implementacji; dowód
audytu powiązano z PR odtworzenia bramki RoG-1.
