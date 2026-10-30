# Wdrożenie poprawek UI i ruchu — 30.10.2026

Zakres: wszystkie 10 ustaleń z audytu webowego oraz wspólna obsługa ruchu aplikacji Next.js. Aplikacje natywne nie były przebudowywane. Nie dodawano nowych bibliotek ani dekoracyjnych animacji danych i nawigacji.

## Wdrożone poprawki

| Before | After | Why |
| --- | --- | --- |
| Toast schowany pod modalem | Jeden Toaster poza warstwą `z-20`, z obsługą wskaźnika; zamknięcie komunikatu nie zamyka edytora | Feedback pozostaje widoczny bez utraty szkicu |
| Inicjały rozcinały UTF-16 | Wspólny `initialsFor` korzysta z `Intl.Segmenter`; sidebar i profil również go używają | Emoji, ZWJ i znaki złożone nie powodują błędu hydratacji |
| Długi e-mail wychodził poza profil/drzewo członków | Ograniczenie kolumn tekstowych i łamanie długich identyfikatorów | Pełna informacja mieści się przy 320 px |
| Niestandardowy tag wychodził poza kartę, kontrast 4,34:1 | Zawijanie tagu wewnątrz karty oraz wyższy kontrast tekstu | Czytelność, WCAG AA i poprawny układ mobilny |
| Paleta, pomoc i tworzenie zadania odtwarzały wejście przy częstych operacjach klawiaturowych | Jawny wariant `motion="none"` obejmuje treść i nakładkę | Natychmiastowa reakcja w podstawowym workflow |
| Sidebar animował szerokość całego layoutu oraz geometrię dzieci | Zmiana geometrii natychmiastowa; mobilny panel zachowuje ruch przy dotyku i pomija go przy skrócie/klawiaturowym kliknięciu | Mniej pracy layoutu i spójna obsługa różnych sposobów aktywacji |
| Tooltip zawsze powtarzał slide/zoom | Początkowe opóźnienie 300 ms; sąsiedni `instant-open` bez animacji | Mniej przypadkowych podpowiedzi i szybkie przeglądanie ikon |
| Drugi pointer nadpisywał gest lightboxa | Kontrola aktywnego gestu i głównego pointera; cancel/lost capture filtrują ID | Dodatkowy palec nie przejmuje istniejącego swipe |
| Każda klatka przeciągania renderowała rodzica tablicy | Współrzędne ghosta jako motion values; React aktualizuje początek/koniec i zmianę celu | Mniej zbędnej pracy na dużych tablicach |
| Animowany cień i `transition-all` w kontrolkach | Stały cień ghosta, natychmiastowa geometria drop slotu, transform-only w Progress, statyczny pasek roadmapy | Brak niezamierzonej interpolacji layoutu |
| Stary ghost zanikał jeszcze po puszczeniu karty | Natychmiastowe usunięcie kopii po drop/cancel | Szybko rozpoczęty kolejny drag nie przemieszcza poprzedniej kopii |

## Wspólny język animacji

Tokeny w `src/app/globals.css` obejmują wszystkie współdzielone dialogi, nakładki, dropdowny i submenu, popovery, tooltipy i mobilne panele:

- Menu/popover: **180 ms**, `cubic-bezier(0.23, 1, 0.32, 1)`.
- Dialog i nakładka: **200 ms**, ta sama krzywa.
- Mobilny panel: **240 ms**, `cubic-bezier(0.32, 0.72, 0, 1)`.
- Tooltip: **125 ms**; kolejne podpowiedzi bez ruchu.
- Wyjście: **120 ms**; tryb ograniczonego ruchu używa przenikania bez slide/zoom.
- Przyciski: subtelne wciśnięcie **100 ms**, z prawidłową interpolacją właściwości `scale`; klawiaturowy focus nie skaluje przycisku.

Zachowano originy Radix, kierunki wejścia/wyjścia paneli, działanie focus trapów i fizykę swipe lightboxa. Nie dodano staggerów kart, liczników startujących od zera, przejść między trasami ani dekoracyjnego ruchu wykresów. Istniejące sterowanie i zabezpieczenia Dither pozostają.

## Testy

- `node --experimental-strip-types --test tests/people.test.mjs`: **9/9**.
- `npx tsc --noEmit`: **PASS**.
- `npm run lint -- --quiet`: **PASS**.
- `npm run test:board-pan`: **PASS**.
- Nowy `tests/e2e/ui-polish.mjs`: **PASS** w lokalnym Chromium; jest włączony do głównego runnera E2E. Sprawdza realny UI: emoji i brak błędów hydratacji, długi e-mail na telefonie, etykiety, axe WCAG A/AA, paletę, sidebar, hit testing toastu ponad modalem, zamknięcie toastu bez utraty dialogu i reduced motion. Dane testowe są sprzątane w `finally`.
- Istniejący `mobileCoverage`: **PASS** dla 375/390/430 px — panele, nawigacja, upload, zapis priorytetu i zmiana kolumny przez menu; natywne zdarzenia dotykowe Chromium potwierdziły scroll/swipe, hold-drag, anulowanie i zapis przeniesienia. Pierwszy przebieg mobilny zakłócił Fast Refresh podczas kompilacji tras; stabilny przebieg przeszedł w całości.
- Rzeczywista tablica z **1000 kart**: **PASS** — ghost śledzi wskaźnik 1:1, Escape anuluje bez usuwania/przenoszenia zadań. Nie jest to pomiar FPS na telefonie.

Lokalne helpery uruchamiają zapisane testy przeciwko audytowej organizacji; nie modyfikują istniejących projektów użytkownika. Pierwszy przebieg testu UI został przerwany przez czas kompilacji strony wylogowania w dev; kompletny kolejny przebieg przeszedł. Pełny runner produkcyjnego E2E nie został uruchomiony, ponieważ build produkcyjny nadal blokuje dostęp sieciowy do Google Fonts (Fraunces/Geist/Geist Mono, HTTP 403). Nie obchodzono TLS ani weryfikacji paczek.

Screenshoty i logi pomocnicze znajdują się poza repozytorium w `/workspace/guidon-audit/after/`. Nie należy commitować lokalnego stanu sesji ani plików poświadczeń audytowego użytkownika.

Końcowy przegląd nie wykazał blokujących regresji. Fizyczny pinch-zoom lightboxa i płynność na rzeczywistym telefonie pozostają do ręcznej oceny; emulacja Chromium nie zastępuje pomiaru GPU ani testu na iOS.
