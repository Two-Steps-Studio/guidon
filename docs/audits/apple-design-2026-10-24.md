# Guidon — audyt interfejsu według apple-design

Data: 2026-10-24. Baza aplikacji: `a006133bde6fa76d2f13e1c04b48292544904bf6`
(PR #62, wraz z wcześniejszymi PR-ami w tym stosie). To audyt UX i implementacji
interfejsu, nie ocena bezpieczeństwa OAuth ani oficjalna certyfikacja Apple.
Nie nadaję arbitralnego „100/100”: brak błędu w jednym scenariuszu nie dowodzi
poprawności całego produktu.

## Wniosek

Guidon ma spójny kierunek kolorów, działające podstawy dostępności i dobre
elementy bezpośredniej manipulacji. Najpierw trzeba usunąć ryzyko utraty pracy,
niezamierzonego zatwierdzania gestów i bariery obsługi. Następnie uprościć
nawigację i uspokoić powierzchnie robocze. Dodawanie sprężyn lub szkła do każdego
elementu nie rozwiąże tych problemów.

## Zakres i sposób czytania dowodów

- Inwentaryzacja wszystkich 63 `src/app/**/page.tsx`, ich wspólnych layoutów,
  formularzy, elementów UI oraz interakcji zadań, modułów, plików i AI.
- Przegląd kodu Expo: logowanie, projekty, tablica, tworzenie i edycja zadania,
  ustawienia, picker, komunikaty, haptyka i tokeny. Bez uruchomienia na urządzeniu.
- UI wtyczek edytorów/silników nie było uruchamiane w aplikacjach hostujących.
  Publiczna strona pobierania jest częścią przeglądu webowego.
- Rzeczywista aplikacja po czystej instalacji, migracjach i produkcyjnym buildzie,
  z własną jednorazową bazą, fikcyjnymi kontami i blokadą połączeń do usług live.
  Desktop 1440×1000, telefon 375×812; jasny/ciemny motyw, ograniczenie ruchu.
- Chromium: pełna macierz głównych ekranów. Firefox/WebKit: publiczne strony
  i reprezentatywne dashboard/profil/tablica/moduły/billing. Macierz nie jest
  iloczynem wszystkich ekranów, języków, ról i stanów danych.
- Obserwacja DOM wskazuje kandydatów do sprawdzenia (wymiary, etykiety,
  landmarki, błędy JS). Sam skan nie jest testem VoiceOver ani certyfikatem WCAG.
  Próg 44px jest celem wygody dotyku; każdy mniejszy element nie jest automatycznie
  naruszeniem WCAG — liczą się też odstępy, alternatywy i właściwe kryterium.
- **K**: potwierdzone w kodzie; **R**: zaobserwowane w działającym UI;
  **H**: hipoteza/propozycja projektowa, wymaga porównania z użytkownikami.
  P1: utrata pracy lub bariera kluczowej obsługi; P2: znacząca jakość/ergonomia;
  P3: spójność i dopracowanie. Brak ustalonego P0 w tym audycie.

Wyniki oraz granice pomiarów są w sekcji „Dowody wykonania” na końcu.

| Obszar | Sprawdzone teraz | Pozostała weryfikacja |
|---|---|---|
| Landing, About, Developers, Plugins, Contact, legal | Publiczny desktop; Chromium również telefon | Pełne długie strony, czytniki i wszystkie języki |
| Login/signup/recovery entry | Render formularzy i wspólne kontrolki | Supabase recovery/confirmation oraz zewnętrzni providerzy |
| Dashboard, My tasks, Projects, Organizations, Profile | Cztery tryby Chromium; próbki FF/WebKit | Duże zbiory, role, powiększenie i utrudniona sieć |
| Projekt: overview, work, calendar, roadmap, knowledge, decisions | Cztery tryby Chromium; tablica również FF/WebKit | Zasilony kalendarz i długie formularze na urządzeniu |
| Memory, context, technology, references, activity, members, settings | Główne ekrany z fixture w Chromium | Rich content, załączniki, wszystkie zakładki i mutacje |
| Moduły, My modules, marketplace | Builder i widoki list; przegląd kodu zarządzania | Instalacja/upgrade/rollback, pełny edytor i dane modułu |
| Files/GitHub/Monaco | Ekran plików i stan bez repo, kod workspace | Rzeczywiste testowe repo, edycja i konflikty |
| Organizacja: settings/members/AI/billing | Podstawowe ekrany; billing self-hosted | Cloud płatności, portal, live AI i błędy usług |
| Admin: overview/users/orgs/logs/integrations/feedback/promo | Chromium, fikcyjne dane | Duże tabele, wszystkie filtry i formularze |
| Start/sandbox/mini/OAuth/Discord/plugin login | Inwentaryzacja i kod, wspólne wzorce | Osobne poprawne sesje i parametry wejścia |
| Expo mobile | Przegląd komponentów i ekranów | Urządzenia iOS/Android, VoiceOver/TalkBack, Dynamic Type |

## Ustalenia i warunki zamknięcia

### AD-01 · P1 · Anulowanie gestu może zatwierdzić zmianę · K

`src/components/work/task-card.tsx:312`: `onPointerCancel` wywołuje `endGesture`
tak samo jak `pointerup`. Dla uzbrojonego gestu dochodzi do `onDragEnd`, a
`kanban-board.tsx:451` zatwierdza zapamiętany cel. Anulowanie przez system lub
przeglądarkę powinno odrzucić gest. Escape ma już poprawną osobną ścieżkę.

**Poprawka:** oddzielić cancel od commit i wyczyścić capture, ghost oraz auto-scroll.
**Dowód zamknięcia:** pointercancel po wskazaniu innej kolumny nie zmienia statusu
ani kolejności w bazie; zwykły pointerup nadal działa; Escape i utrata capture
mają określone zachowanie. Nie dodawać bezwładności do dyskretnej zmiany statusu.

### AD-02 · P1 · Niezapisana edycja zadania nie jest chroniona · K/R

`src/components/work/task-detail-dialog.tsx:341` zamyka okno bez sprawdzenia
zmienionego formularza. Odmontowanie wewnętrznego komponentu usuwa jego stan.
`work/create-task-dialog.tsx:212` chroni zamykanie podczas wysyłki, ale nie sam
szkic przed wysyłką. Zewnętrzny klik/Escape może zakończyć dłuższą pracę.

Końcowy scenariusz Chromium potwierdził: zmiana tytułu → Escape → ponowne
otwarcie daje pierwotny tytuł, bez potwierdzenia odrzucenia szkicu.

**Poprawka:** zachować szkic lub przy zmienionych danych zaoferować „Kontynuuj
edycję / Odrzuć”. Bez potwierdzania zamknięcia pustego, niezmienionego okna.
**Dowód:** tytuł, opis, pola i kolejka załączników zachowane po przypadkowym
zamknięciu; błąd zapisu nie usuwa treści; celowe odrzucenie działa.

### AD-03 · P1 · Podstawowe akcje czatu AI są bez nazwy · K

`src/components/ai/AIChat.tsx:113` umieszcza klik otwierający na `div`; wewnętrzny
przycisk z ikoną nie ma nazwy. Przycisk wysyłania (`:231`) również jest samą
ikoną. Wiadomości i stan „myśli” nie mają `role=log`/obszaru live. Placeholder
kompozytora nie zastępuje trwałej etykiety.

**Poprawka:** przenieść akcję na nazwany przycisk, nazwać kompozytor i wysyłkę,
dodać spokojne ogłaszanie nowych odpowiedzi oraz stanu oczekiwania.
**Dowód:** cały scenariusz klawiaturą i VoiceOver/NVDA, bez czytania każdej
historycznej wiadomości po zmianie. Zachować istniejące potwierdzenie usuwania.

### AD-04 · P1 · Podgląd hasła pomijany przez klawiaturę · K

`src/components/ui/password-input.tsx:23`: przycisk ma `tabIndex={-1}`. Osoba
używająca Tab nie może uruchomić dostępnej myszą funkcji.

**Poprawka/dowód:** przycisk w kolejności Tab, z widocznym fokusem, poprawną
lokalizowaną nazwą i ogłoszonym stanem; Enter/Spacja przełączają widoczność,
bez wysyłania formularza i utraty zawartości.

### AD-05 · P1 · Długie zwykłe dialogi nie mają bezpiecznej wysokości · K

`src/components/ui/dialog.tsx:76` centruje domyślne okno bez limitu wysokości
i przewijania. Dopiero opt-in `scrollable` (`:82`) zapewnia ograniczenie i safe
area. Formularze m.in. projektu, decyzji, pamięci, źródeł i faz używają zwykłego
wariantu. Ryzyko rośnie na niskim ekranie, przy powiększeniu i klawiaturze telefonu.

**Poprawka:** standard przewijania długich formularzy z dostępnym zamknięciem
i przyciskami. **Dowód:** 320px szerokości, orientacja pozioma, 200% tekstu,
otwarta klawiatura; wszystkie pola i akcje osiągalne. Konkretne kombinacje
urządzeń wymagają odrębnej weryfikacji, kod sam nie dowodzi każdego przepełnienia.

### AD-06 · P2 · Zbyt małe cele dotykowe we wspólnych kontrolkach · K/R

`ui/button.tsx`: 32/36/40px; pasek wyszukiwania i dzwonek 32px, `dialog-close`
i `sheet` mają ikonę bez większego hitboxu. W lightboxie kontrolki mają 16px
ikony i `p-1`, czyli około 24px. To rozchodzi się z wygodną obsługą telefonu.

**Poprawka:** warianty dotykowe min. 44×44 CSS px albo większy niewidoczny cel
z zachowaniem odstępów. Gęste desktopowe tabele oceniać osobno.
**Dowód:** rzeczywiste prostokąty trafienia, brak nakładania sąsiednich akcji,
test palcem, fokus i obsługa zoomu. Raport wymiarów nie obejmuje wszystkich linków.

### AD-07 · P2 · Brak spójnego ograniczenia ruchu JavaScript · K

Globalne CSS skraca animacje przy `prefers-reduced-motion`, a Dither reaguje
na ten sygnał prawidłowo. Ghost karty `kanban-board.tsx:618` ma jednak własny
Motion spring, skalowanie i wyjście; nie odczytuje tej preferencji i w repo nie
ma globalnego `MotionConfig reducedMotion`. CSS nie zatrzyma animacji JS.

**Poprawka/dowód:** przy ograniczeniu ruchu zachować śledzenie palca, wyłączyć
ozdobne skale/sprężyny, zapewnić statyczny lub krótki opacity feedback.
Zweryfikować również zmianę preferencji w czasie otwartej sesji.

### AD-08 · P2 · Brak wariantów mniejszej przezroczystości i większego kontrastu · K

Nie znaleziono obsługi `prefers-reduced-transparency` ani `prefers-contrast`.
Dropdowny używają warstw `/90`, `/75` i blur, tekst na tle korzysta ze `scrim`.
Obecny tryb reduced motion nie rozwiązuje czytelności materiałów.

**Poprawka/dowód:** bliskie pełnej nieprzezroczystości powierzchnie i czytelna
granica w odpowiednich preferencjach; test również w forced colors. Nie usuwać
istniejących semantycznych tokenów jasnego i ciemnego motywu.

### AD-09 · P2 · Nawigacja konkuruje z podstawowym zadaniem · K/H

`layout/app-sidebar.tsx`: siedem globalnych wejść, do piętnastu projektowych,
przypięte projekty i dodatkowo siedem administracyjnych. Plugins, Marketplace
i My modules mają tę samą ikonę. Na desktopie część projektu wymaga przewijania;
zwinięty rail zachowuje stabilne pozycje po PR #62, ale nadal ma wiele przystanków.

**Kierunek:** częste Work/Calendar/Files na pierwszym poziomie; zarządzanie,
administracja i instalowanie rozszerzeń w wyraźnych grupach. Zachować możliwość
ukrywania modułów. **Dowód:** użytkownik bez instruktażu odnajduje zadanie,
źródło i ustawienia; porównać czas i pomyłki z obecną wersją. Nie zmieniać
nazw tras ani grup wyłącznie na podstawie gustu audytora.

### AD-10 · P2 · Tło robocze wymaga spokojniejszego wariantu · K/H

`layout/dither-background.tsx` montuje pełnoekranową falę WebGL na wszystkich
trasach poza landingiem. Domyślne auto oznacza animację, jeśli system jej nie
ogranicza. Użytkownik może wyłączyć ruch, lecz nadal otrzymuje wzór. Brakuje
prostego wyboru jednolitego tła; tapeta jest inną funkcją. Nie każdy nagłówek
i tekst w aplikacji znajduje się na scrim.

**Kierunek:** jednolite tło jako wariant pracy wymagającej skupienia; wzór jako
świadomy wybór. **Dowód:** porównanie czytelności i wydajności na słabym GPU,
pomiar klatek oraz energii na urządzeniu. Nie twierdzę, że sam WebGL dowodzi
regresji wydajności. Kod ma już ograniczenie DPR, obserwację widoczności i pauzę
w ukrytej karcie — należy je zachować.

### AD-11 · P2 · Lightbox nie prowadzi obrazu razem z palcem · K

`ui/image-lightbox.tsx:88–99` zapamiętuje początek i rozpoznaje poziomy dystans
dopiero na końcu. Brak śledzenia 1:1, blokady osi, obsługi anulowania i prędkości.
Ukośny pionowy gest może zmienić zdjęcie. Obraz zmienia się skokowo.

**Poprawka/dowód:** rozpoznawać intencję, śledzić offset, anulować bez zmiany,
przekazać prędkość do odpowiedniej sprężyny. Strzałki i klawiatura muszą zostać.
Nie wymuszać gestu jako jedynej metody przechodzenia między obrazami.

### AD-12 · P2 · Przycinanie obrazu dodaje opóźnienie do suwaka · K

`ui/image-crop-input.tsx` ma `transition-transform` na obrazie sterowanym
na bieżąco suwakami zoom/x/y. Kolejne cele transformacji są doganiane zamiast
odzwierciedlać wartość kontrolki bezpośrednio.

**Poprawka/dowód:** bez przejścia w czasie manipulacji; animacja dopiero przy
celowym snap/reset, jeśli jest potrzebna. Szybka zmiana kierunku nie zostawia
obrazu za suwakiem. Zachować klawiaturowe suwaki i opisane etykiety.

### AD-13 · P2 · Wyszukiwanie ukrywa oczekiwanie i błąd jako pusty wynik · K

`layout/command-palette.tsx:119–175`: jest 200ms debounce i abort, ale stan
`loading` wyłącznie ukrywa „brak wyników”. Nie widać komunikatu oczekiwania;
błąd HTTP nie jest rozróżniony, catch ustawia pustą listę. Starsze `finally`
może też zmienić stan oczekiwania nowszego żądania.

**Poprawka/dowód:** osobno szukanie, brak wyników i błąd z ponowieniem; odpowiedź
ostatniego zapytania wygrywa; test opóźnionych i przestawionych odpowiedzi.
Sam debounce nie jest błędem — zmniejsza zbędne zapytania.

### AD-14 · P2 · Zakładki kontekstu nie komunikują stanu · K

`projects/[id]/context/context-tabs.tsx:56`: stylowane przyciski bez `tablist`,
`tab`, `aria-selected`, powiązanego panelu i klawiszy strzałek. W edytorze
modułu podobny wzorzec ma już te elementy (`work/module-editor-frame.tsx`).

**Poprawka/dowód:** wspólny wzorzec zakładek z fokusem i panelami; czytnik
komunikuje wybraną zakładkę oraz jej liczbę elementów; telefon nie ucina grupy.

### AD-15 · P2 · Kalendarz ukrywa dalsze zadania bez wejścia do nich · K

`calendar/calendar-view.tsx:208`: dzień pokazuje pierwsze cztery zadania;
„więcej” jest tekstem w `li`, bez akcji rozwinięcia. Siedem wąskich kolumn
i tekst 10/11px wymagają innego sposobu przeglądu na telefonie.

**Poprawka/dowód:** aktywne „pokaż wszystkie” z listą dnia; agenda dla małej
szerokości lub równoważny wygodny widok. Przy co najmniej pięciu zadaniach
każde jest osiągalne z kalendarza dotykiem i klawiaturą.

### AD-16 · P2 · Zmiana położenia karty nie jest ogłaszana czytnikowi · K

Karty mają nazwy, Enter/Spację, Alt+strzałki oraz menu zmiany statusu — to mocna
podstawa. Brak dedykowanego ogłoszenia sukcesu przeniesienia i pozycji w tablicy.
Nie należy zakładać, że sama zmiana DOM zostanie właściwie odczytana.

**Poprawka/dowód:** spokojny status „przeniesiono do …, pozycja …”, utrzymany
fokus, wyraźny błąd i powrót po nieudanym zapisie. Osobny test NVDA/VoiceOver.

### AD-17 · P2 · Zagnieżdżone landmarki głównej treści modułów · K/R

`projects/[id]/modules/[moduleId]/page.tsx:29` zwraca `main` wewnątrz
projektowego AppShell; `ui/sidebar.tsx:344` również zwraca `main`.
Wspólny root celowo usunął podobne zagnieżdżenie, ale ten ekran je przywraca.
Runtime wykazał też dwa `main` na `/my-modules` i `/projects/[id]/modules`.

**Poprawka/dowód:** jeden główny landmark, opisane sekcje; pełny ekran wymaga
fixture z zainstalowanym modułem. Pusty katalog nie weryfikuje tej ścieżki.

### AD-18 · P2 · Czatu AI nie należy zatwierdzać samym Enter podczas IME · K

`AIChat.tsx:224` wysyła wiadomość na Enter bez sprawdzenia składania znaków.
Może wysłać nieukończoną treść użytkownikowi korzystającemu z IME. Panel ma
ponadto stałe `w-[400px]` przy ekranie 375px, do sprawdzenia geometrii i klawiatury.

**Poprawka/dowód:** respektować `isComposing`, zachować Shift+Enter, ograniczyć
szerokość do viewportu, sprawdzić safe area i widoczność kompozytora nad klawiaturą.

### AD-19 · P3 · Niejednolite potwierdzenia i lokalizacja podstawowych kontrolek · K

Projekt ma własny dialog usunięcia, natomiast bulk delete, webhooki, konta AI
i rekordy modułów używają `window.confirm`. `Dialog`/`Sheet` mają literalne
„Close”. To rozjeżdża wygląd, język i informację o skutku działania.

**Poprawka/dowód:** jeden dostępny wzorzec dla nieodwracalnych działań, konkretna
nazwa obiektu i skutek, powrót fokusu. Dla operacji odwracalnych rozważyć undo.
Nie dodawać potwierdzenia do każdej drobnej akcji. Sprawdzić PL/EN/DE/ES.

### AD-20 · P3 · Szuflady mają niesymetryczny rytm otwierania/zamykania · K/H

`ui/sheet.tsx:34`: 500ms wejścia i 300ms wyjścia, stałe CSS animacje. Kierunek
jest symetryczny, co jest dobre. Dla panelu uruchamianego przyciskiem CSS nie
jest z definicji wadą, ale szybka zmiana decyzji wymaga sprawdzenia skoku i fokusu.
Nie ma podstaw do twierdzenia, że wszystkie panele obecnie blokują wejście.

**Kierunek/dowód:** krótsza odpowiedź przyciskowych paneli; dla panelu faktycznie
przeciąganego sprężyna z bieżącej wartości/prędkości. Ponowne otwarcie podczas
zamykania bez skoku, blokady i utraty fokusu. Reduced motion bez przesuwania.

### AD-21 · P2 · Profil odtwarza część UI po błędzie hydratacji · R

Na `/profile` z kluczami API testowego konta powtarza się React #418 (różnica
tekstu serwera i klienta), w jasnym/ciemnym motywie i obu szerokościach.
To rzeczywisty błąd, mimo odpowiedzi HTTP 200 i widocznego formularza.
`profile/api-keys.tsx:132/135` formatuje daty przez `toLocaleDateString()` bez
ustalonego locale/timezone — kandydat do diagnozy, nie udowodniona przyczyna.

**Poprawka/dowód:** ustalić dokładny różniący się tekst w trybie diagnostycznym,
ujednolicić wejściowe dane/formatowanie, bez `suppressHydrationWarning` jako
obejścia. Konto z datami kluczy/połączeń, różne locale i strefy, zero błędów
hydratacji i brak utraty fokusu podczas uruchamiania profilu.

## Co już działa i należy zachować

- Jedna semantyczna paleta jasna/ciemna, kolor marki i wariant wysokiej czytelności
  primary; motyw odczytywany na serwerze bez celowego błysku drugiego motywu.
- Reakcja `:active` wspólnego Button; akcje zatwierdzane na klik, nie od razu
  na pointerdown. Nie należy przenosić destrukcyjnych operacji na samo wciśnięcie.
- Tablica: offset miejsca chwycenia, pointer capture, progi 8/10px, hold dotykowy,
  rAF, auto-scroll, anulowanie Escape i alternatywy menu/klawiatury.
- Optymistyczne przenoszenie i cofnięcie pól konkretnego zadania po błędzie;
  obecność feedbacku błędu. Poprawki #62 ograniczyły pusty obszar przewijania
  i skoki sidebara; tych wcześniejszych usterek nie liczę ponownie.
- Radix w dialogach, popoverach i menu: podstawa zarządzania fokusem; menu mają
  origin oparty o trigger, ograniczenie dostępnej wysokości i collision handling.
- Wspólne empty states, skeletony wielu tras, root error boundary i ponowienie.
  Nie oznacza to, że każda możliwa awaria ma już właściwy komunikat.
- Globalna preferencja reduced motion, Dither z pauzą/obserwacją widoczności;
  formularz feedbacku z radiami i celami 44px, zachowaniem danych po błędzie.
- Typografia: Geist z fallbackiem systemowym, ciało blisko neutralnego trackingu,
  nagłówki mają osobny tracking/leading. Pola w pomiarze mają 16px mimo `text-sm`
  w komponentach — nie zgłaszam niepotwierdzonego błędu automatycznego zoomu iOS.

## Aplikacja natywna — osobny przegląd kodu

Mocne podstawy: systemowy font, skala 17px dla treści, safe area w FAB i pickerach,
haptyka z centralnym wyłącznikiem, 50px wiersze opcji, etykiety dostępności,
akcje dostępności do przenoszenia zadań, feedback `pressed`. Przejścia kolumn
deklarują `ReduceMotion.System`. To są dowody implementacji, nie test na iPhonie.

Do zweryfikowania na urządzeniu: duże rozmiary Dynamic Type przy `numberOfLines=1`
w OptionSheet i stałej wysokości 36px chipów tablicy; fokus VoiceOver po otwarciu
Modal i powrocie; przerwanie swipe w ReanimatedSwipeable; reduced motion toastów
(domyślne zachowanie zależy od użytej wersji biblioteki, brak podstaw do zgłoszenia
pewnego błędu wyłącznie po braku jawnego parametru); klawiatura formularzy,
orientacja, offline i scenariusze ponowienia. Kolory info/priority mobile nadal
różnią się od semantycznych akcentów webu — uzgodnić rolę, nie zamieniać masowo
wszystkich kolorów statusów na kolor marki.

## Kolejność prac

| Etap | Zakres | Warunek wyjścia |
|---|---|---|
| 1. Ochrona pracy | AD-01, 02, 04, 05 | Brak commit po cancel; szkic zachowany; pełna obsługa klawiaturą i na niskim ekranie |
| 2. Dostępna komunikacja | AD-03, 06, 13, 14, 16, 18, 21 | Nazwane akcje, widoczny stan oczekiwania/błędu, dotyk i czytniki; stabilna hydratacja |
| 3. Ruch i materiały | AD-07, 08, 11, 12, 20 | Ruch respektuje preferencje, gest można przerwać; czytelne powierzchnie |
| 4. Architektura ekranów | AD-09, 10, 15, 17, 19 | Czytelna nawigacja i wszystkie zadania dostępne z kalendarza; spójne wzorce |
| 5. Realne urządzenia/Cloud | poniższe braki | Udokumentowane scenariusze urządzeń, usług i zasilonego danymi produktu |

## Czego ten audyt nie potwierdza

Brak Supabase/Stripe stagingu oznacza brak rzeczywistego resetu/confirmation,
checkoutu, SCA, portalu klienta i płatnego stanu billing. OAuth consent i ekrany
plugin/mobile login wymagają prawdziwego, odizolowanego żądania klienta, nie
wejścia w pusty URL. Marketplace install/update/rollback i edytor z zainstalowanym
modułem wymagają odpowiednich danych; pusty katalog nie zastępuje tego scenariusza.
Podobnie połączenie GitHub, pliki/repo w Monaco, bogaty moodboard, rozmowa AI
z odpowiedzią usługodawcy, sandbox lifecycle i onboarding po rejestracji nie są
w pełni odwzorowane przez wejście właściciela do pustego projektu.

Nie wykonano testów z prawdziwymi użytkownikami, czytnikami na urządzeniu,
200%/400% zoomem całej macierzy, pomiarów energii/GPU/FPS ani pełnego pomiaru
kontrastu każdej pary (zwłaszcza nad tapetą). Brak automatycznego przepełnienia
`documentElement` nie dowodzi, że nic nie jest ucięte — root używa `overflow-x:clip`.
Nie wolno zamieniać statusu tych pozycji na „zaliczone”. Instrukcja stagingu:
`docs/release/staging-handoff.md`.

## Odtworzenie zbierania dowodów

`node tests/e2e/run.mjs --design-audit` — ten sam izolowany build, własny Docker
PostgreSQL, blokada usług live i sprzątanie jak w istniejącym E2E. Zwykły
`npm run test:e2e` zachowuje dotychczasowy zestaw regresji. Tryb audytu kolekcjonuje
obserwacje i screenshoty, nie udaje zielonego testu wszystkich zasad UX.

## Dowody wykonania

Końcowy przebieg: **`29fe60619d6f`**, wynik `evidence-collected`.

- 224 obserwacje stron: Chromium 162, Firefox 31, WebKit 31; dodatkowo dwa
  scenariusze Chromium (niezapisana edycja i panel AI na telefonie).
- 46 z 63 wzorców stron ma bezpośrednią obserwację fixture. Pozostałe 17 jest
  jawnie oznaczone w [inwentarzu i dowodach](apple-design-2026-10-24-evidence.json).
  Logout wykorzystano jako przejście sterujące; nie jako osobny screenshot ekranu.
- Zero nieudanych nawigacji i zero HTTP >=400 w tej macierzy. Osiem obserwacji
  profilu miało błąd React #418. HTTP 200 nie oznacza poprawności UI.
- Faktyczne wymiary mobilnych obserwacji: 375px; desktopowych: 1440px.
  Oba motywy i preferencja ograniczonego ruchu uwzględnione.
- Niezapisany tytuł utracony po Escape. W panelu AI brak etykiety przycisku
  wysyłania i obszaru live; szerokość panelu wyniosła 400px przy 375px viewportu.
  Pozycję panelu z tego pomiaru uchwycono podczas wejścia: nie stanowi dowodu
  końcowej pozycji. Kolektor uzupełniono o oczekiwanie na koniec animacji dla
  kolejnych przebiegów. Nie ukrywam tego ograniczenia dowodu.
- Zrzuty przejrzane wzrokowo: desktop dashboard/profile/files, ciemna tablica,
  mobilne context/modules/calendar/landing i WebKit profil w ciemnym motywie.
  To przegląd reprezentatywnych zrzutów, nie ręczny przegląd każdej klatki.
- Instalacja, migracje, build i kontrola paczki w izolacji zakończone; wcześniejsza
  bramka REST/MCP 110 sprawdzeń także wykonana. Te 110 obejmuje próbki rate limit,
  nie 110 różnych kategorii błędów. Dotychczasowa pełna regresja UI pozostaje
  odrębnym dowodem z PR #62 (`2a166aab9e54`).

Surowe JSON-y, logi, zrzuty i trace są lokalnie w
`output/e2e/29fe60619d6f/`; nie zawierają kont ani danych klientów. Skrócony
inwentarz w repo zachowuje wyniki per trasa/przeglądarka/tryb, także błędy.
Wstępne przebiegi `b7803086d1c4` (wyścig redirectu) i `d00ac13b6025`
(nowe dokumenty traciły mobilny viewport) **nie są końcowym dowodem macierzy**.
Ostateczny kolektor izoluje dokumenty i ustawia viewport dla każdej obserwacji.
Jednorazowe kontenery i pliki robocze zostały sprzątnięte. Nie wdrażano aplikacji,
nie uruchamiano migracji produkcji i nie zmieniano interfejsu produktu.
