# Guidon: audyt Apple Design, 2026-10-31

Baza: `7852bcdc` (main po PR #122). Audyt według apple-design:
reakcja na wejście, manipulacja bezpośrednia, przerwanie gestu, orientacja,
typografia, dostępność i ochrona pracy. Nie jest certyfikacją Apple ani WCAG.

## Dowody i zakres

Izolowana aplikacja po czystej instalacji, migracjach i buildzie produkcyjnym,
jednorazowy PostgreSQL, fikcyjne konta, brak połączeń do usług produkcyjnych.
Runner: `node tests/e2e/run.mjs --design-audit`.
Artefakty: `output/e2e/6fe349f17fbf/design-audit-*.json` i zrzuty `audit-*`.
Chromium: 163 obserwacje stron/scenariuszy; Firefox i WebKit: po 31 obserwacji głównych
ekranów. Motywy jasny/ciemny, 1440×1000 oraz 375×812, ograniczony ruch.

Obejmuje publiczne strony, logowanie, dashboard, projekty, organizacje, profil,
moduły, administrację i główne widoki projektu. Przegląd kodu współdzielonych
dialogów, arkuszy, lightboxa, gestów, szkiców oraz Expo. Nie obejmuje testów
VoiceOver/TalkBack, fizycznego telefonu, wszystkich ról/danych ani usług live.
Telefon w tym runnerze oznacza rozmiar viewportu, nie emulację dotyku.

## Wyniki

| Priorytet | Ustalenie | Dowód / działanie |
| --- | --- | --- |
| P1 | Wcześniej zaobserwowana utrata wpisanej wartości/szkicu w WebKit wymaga ustalenia przyczyny. | Zadanie `9037932e-1029-474a-84ec-0cb723053372`, run `5fb4f3b1b0b3`. Nie przypisano winy animacjom. Oddzielny trace kontekstu write-safety oraz celowany scenariusz. |
| P2 | Edytor limitu projektów nie ma dostępnej nazwy; plan organizacji nie ma skojarzonej etykiety kontrolki. | `/admin/organizations`, `project-limit-editor.tsx`, `plan-editor.tsx`. Dodać tłumaczone nazwy z kontekstem organizacji. |
| P2 | Ukryty wizualnie input obrazu organizacji nadal jest w drzewie dostępności, bez nazwy. | `org-avatar-upload.tsx` / `ImageCropInput`. Widoczny przycisk ma poprawny opis; input również potrzebuje nazwy. |
| P3 | Drobne kontrolki desktopowe bywają mniejsze niż 44px. | To kandydaci do testu dotykowego, nie automatyczne naruszenie WCAG. Wspólne kontrolki mają reguły coarse-pointer; wymagane sprawdzenie na urządzeniu. |

W macierzy 225 obserwacji nie zaobserwowano błędów JavaScript ani poziomego
przepełnienia. Escape przy zmienionym zadaniu otwiera potwierdzenie; anulowanie
zachowuje edycję. Nie jest to dowód poprawności każdego scenariusza szkiców.

## Zachowania zachowane

- Wyśrodkowany pierwszy ekran i brak przycisków odtwarzania zgodnie z decyzją właściciela.
- Krótkie informacje zwrotne w kontrolkach; command palette bez animacji otwarcia.
- Przerwanie i anulowanie gestów lightboxa, próg zamiaru, prędkość i projekcja.
- Wspólne tokeny ruchu, ograniczenie ruchu, jednolite materiały przy ograniczeniu przezroczystości i zwiększonym kontraście.
- Brak dodawania dekoracyjnego ruchu do odczytywanych danych lub nawigacji klawiaturą.

## Poprawność samego pomiaru

Starszy collector emulował media na karcie, którą następnie zamykał.
Nowy ustawia media na każdej obserwowanej karcie i zapisuje rzeczywiste
preferencje. Uwzględnia obecny dialog odrzucenia edycji zamiast próbować
klikać tablicę pod modalem. Wyniki zapisuje po każdej stronie, również po błędzie.
Pierwszy run `182fcfaf1443` zatrzymał się na tym nieaktualnym scenariuszu;
nie jest traktowany jako regresja aplikacji.

## Kolejka Guidona

Odczytano wszystkie 273 zadania przez MCP: 3 Todo, 46 Backlog, 220 Review,
4 Done. Review nie oznacza automatycznie Done; nie zmieniono tych statusów
zbiorczo. Kolejność: szkice WebKit, etykiety z audytu, raport Lighthouse,
materiały promocyjne. Kampanie płatne i prace oznaczone po premierze wymagają
osobnego zakresu; nie są uruchamiane w ramach audytu.

Nowe zadanie etykiet: `0dce3fa9-e815-4f83-91c4-ae47bf372428`.

## Próba odtworzenia P1

`node tests/e2e/run.mjs --write-safety`, run `e9420944ddc6`:
Chromium/Firefox/WebKit PASS, bez ponawiania wpisywania tytułu i bez osłabiania
warunku istnienia szkicu. Dodano trace właściwego, izolowanego kontekstu.
Przyczyny poprzedniej awarii nie ustalono; zadanie pozostaje Todo, zapisano
próbę jako partial. Nie wprowadzono spekulacyjnej poprawki w zapisie danych.
