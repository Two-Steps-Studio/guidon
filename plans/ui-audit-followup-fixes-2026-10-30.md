# Poprawki po drugim audycie UI — 30.10.2026

Wdrożono wszystkie osiem ustaleń i lukę cleanup przeciągania z ostatniego audytu. Zachowano wcześniejsze zmiany w UI. Nie zmieniano bibliotek, lockfile zależności aplikacji ani konfiguracji integracji GitHub.

| Before | After | Why |
| --- | --- | --- |
| Podgląd kadru i eksport używały różnych obliczeń | `src/lib/image-crop.ts` wyznacza jeden ograniczony prostokąt źródłowy; obraz w podglądzie pozycjonowany jest według tych samych współrzędnych co `canvas.drawImage` | Kwadrat, panorama, portret i zoom nie odsłaniają pustego tła i zapisują widoczny kadr |
| Możliwość użycia kadru przed załadowaniem obrazu | Przycisk aktywny dopiero po odczycie wymiarów; eksport kontroluje aktualny plik | Nie zapisuje się niegotowego ani anulowanego wyboru |
| Drugi pointer nadpisywał gest karty lub go anulował | Pierwszy/aktywny pointer ma wyłączność; cancel i lost capture sprawdzają ID | Drugi palec nie pozostawia osieroconej kopii ani nie przerywa pierwszego gestu |
| Usunięcie karty nie kończyło przeciągania | Cleanup karty usuwa timer, zwalnia capture i wywołuje aktualny callback anulowania | Filtrowanie/usunięcie zatrzymuje ghost i pętlę auto-scroll |
| Pobierano blob również z odpowiedzi 403/404/500 | Kontrola `response.ok` i lokalizowany komunikat HTTP | Treść błędu nie zostaje zapisana pod nazwą pliku użytkownika |
| Strzałki w podglądzie plików przejmowały sterowanie nad odtwarzaczem i edycją | Pomijane są kontrolki, multimedia, edytowalny tekst, code/pre i obsłużone lub modyfikowane zdarzenia; podgląd kodu można fokusować | Klawisze zachowują funkcję w aktualnie obsługiwanej kontrolce, a nawigacja galerii nadal działa poza nią |
| Odłączanie repozytorium miało anonimowy przycisk z ikoną | Lokalizowana nazwa zawiera nazwę repozytorium | Czytnik ekranu identyfikuje działanie |
| Rozwinięcie katalogu i aktywny plik były oznaczone tylko wizualnie | `aria-expanded`, powiązany region `aria-controls` i `aria-current`; chevron zmienia się natychmiast | Stan jest czytelny dla technologii wspomagających bez udawania pełnej nawigacji ARIA tree |
| Pole brancha i tryb commita miały niepełną semantykę | Powiązany label, nazwana grupa, `aria-pressed` oraz tłumaczenia EN/PL/DE/ES | Nazwa pola i aktualny wybór są dostępne także bez koloru |
| Menu, selektory i date picker animowały wejście z klawiatury | Wspólny `SurfaceMotionProvider` zachowuje sposób aktywacji również przez portale; klawiatura oznacza `data-motion="none"`, pointer zachowuje krótkie przejście | Spójna natychmiastowa obsługa klawiatury bez zmian w focus management Radix |

## Dodatkowe błędy znalezione podczas regresji

- Radix przywraca focus po unmount na timerze. Przy szybkim zamknięciu i ponownym otwarciu stary timer mógł zamknąć nową powierzchnię przez przeniesienie focusu. Guard `keepReopenedSurfaceFocus` rozpoznaje nową instancję o tym samym ID i zachowuje jej focus. Zwykłe przywracanie focusu nadal działa.
- Zainstalowane Dialog i Popover używają różnych wersji stosu warstw Radix. Escape z kalendarza mógł zamknąć także formularz. Wspólny rejestr zagnieżdżonych powierzchni zamyka najpierw aktywny popover i chroni jego rodzica. Nie wymuszano aktualizacji ani podmiany zależności.

## Weryfikacja

- `node --experimental-strip-types --test tests/image-crop.test.mjs`: **5/5 PASS** — kwadrat na skrajach suwaków, panorama/portret, zoom, ograniczenia geometrii i nieprawidłowe wymiary.
- `npx tsc --noEmit`: **PASS**.
- `npm run lint -- --quiet`: **PASS**.
- Nowy `tests/e2e/audit-followup.mjs`: **PASS** przeciwko rzeczywistej aplikacji w Chromium. Włączony do głównego runnera E2E. Scenariusze:
  - podgląd kwadratu przy skrajnym przesunięciu i odczyt pikseli rzeczywiście wyeksportowanego WebP;
  - kontrolowana odpowiedź storage HTTP 403: widoczny błąd, brak zdarzenia pobrania;
  - strzałki przy focusie na video zachowują bieżący plik, a poza kontrolką nawigacja nadal działa;
  - pointer otwiera menu w normalnym trybie, klawiatura bez animacji, również po szybkim zamknięciu/otwarciu;
  - date picker otwiera się z klawiatury natychmiast, Escape zamyka wyłącznie kalendarz i pozostawia formularz;
  - kontrolowana sekwencja zdarzeń dwóch pointerów zachowuje pierwszy drag, a odfiltrowanie przeciąganej karty usuwa ghost.
- Istniejący `mobileCoverage`: **PASS** dla 375, 390 i 430 px — panele, nawigacja, upload, zapis priorytetu, przenoszenie z menu i natywne zdarzenia dotykowe Chromium (swipe, hold-drag, cancel, zapis przeniesienia).
- `git diff --check`: **PASS**.

Nowe scenariusze używają odseparowanej organizacji audytowej i sprzątają swoje rekordy w `finally`. Test kadru nie zatwierdza formularza ustawień. Nie wysyłano commitów, PR ani żądań odłączania rzeczywistych repozytoriów. Zmiany semantyki GitHub sprawdzono w kodzie i kompilacji; nie uruchamiano operacji na prawdziwym połączeniu GitHub.

Pierwsze przebiegi ujawniły opisane wyżej błędy focusu i zagnieżdżonego Escape; po poprawkach scenariusze przeszły. Dodatkowy przebieg przerwało ładowanie strony po przebudowach dev; końcowy pełny test przeszedł po restarcie własnego serwera. Produkcyjnego runnera E2E nie uruchamiano: blokada sieci Google Fonts pozostaje osobnym ograniczeniem builda. Nie obchodzono TLS ani walidacji zależności.

Fizyczny multi-touch na iOS/Android i pomiar płynności GPU wymagają urządzenia; testy Chromium nie są takim pomiarem. Lokalne logi i screenshoty: `/workspace/guidon-audit/followup-fixed/` (poza repozytorium, bez dodawania sesji/poświadczeń do Git).
