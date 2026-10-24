# Poprawki Apple Design i połączenie zmian z main

## Zakres

Gałąź `codex/apple-design-fixes-main` zawiera wcześniejsze poprawki ze stosu
PR #57–63 oraz poprawki audytu `docs/audits/apple-design-2026-10-24.md`.
Punktem wyjścia integracji jest `origin/main` z commitem `24b040d`.
Scalenie rodzica przed późniejszym PR-em potomnym nie przeniosło automatycznie
wszystkich późniejszych commitów na main; wspólny PR zamyka tę lukę historii.

Nie uruchamiano migracji ani wdrożenia produkcyjnego. Wcześniejsza migracja
`084_feedback_rating.sql` nadal musi poprzedzać wdrożenie writerów feedbacku.
Nie trzeba wykonywać nowej migracji dla zmian UI opisanych poniżej.

## Powiązanie z zadaniami Guidona

| Karta | Implementacja | Dowód automatyczny / granica |
|---|---|---|
| AD-01 | Osobny cancel dla pointercancel/lost capture; bez commit, wyczyszczenie gestu i scrolla | Rzeczywiste gesty myszy, trzy sposoby anulowania, brak Server Action i niezmieniony rekord; zwykłe upuszczenie zapisuje |
| AD-02 | Potwierdzenie przed utratą szkicu, zachowanie edycji i kolejki plików po anulowaniu, ochrona nawigacji pomiędzy zadaniami i zamknięcia karty | Edycja i tworzenie z dwoma plikami, Escape, Cancel/Discard, baza zachowuje oryginał |
| AD-03 | Nazwane przyciski AI i kompozytor, log polite z nowymi wiadomościami | Otworzenie klawiaturą, nazwana wysyłka i odpowiedź fixture w log; VoiceOver/NVDA wymagają człowieka |
| AD-04 | Podgląd hasła dostępny Tab/Space, stan aria-pressed, type=button | Hasło zachowane, zmiana typu, brak wysłania przy przełączeniu |
| AD-05 | Wspólne ograniczenie wysokości zwykłego dialogu; zachowany wariant scrollable | 320×480 przy tekście 200%, osiągalne anulowanie; fizyczna klawiatura telefonu pozostaje osobną próbą |
| AD-06 | Większe cele dotykowe Button/menu/close, 44px lightbox, kompaktowa wyszukiwarka telefonu | Chromium z rzeczywistym emulowanym pointer:coarse, wymiary wyszukiwania i dzwonka |
| AD-07 | Ghost odczytuje reduced motion; bez ozdobnej skali/sprężyny; transform zamiast left/top; kopia inert/aria-hidden | Kod preferencji i dotychczasowe gesty; nie jest to pomiar wszystkich klatek na urządzeniu |
| AD-08 | Reduced transparency, high contrast i forced colors dla współdzielonych powierzchni | Emulacja większego kontrastu, style powierzchni i kontrola CSS; część preferencji zależy od przeglądarki |
| AD-09 | Osobna grupa rozszerzeń, różne ikony, zwijane sekcje projektu, zachowane trasy i opcjonalne moduły | Przełączenie grupy oraz dotychczasowe testy stabilności sidebara; brak badania czasu wykonania z prawdziwymi użytkownikami |
| AD-10 | Jednolite tło jako domyślny wariant pracy, wzór jako wybór urządzenia, osobno wybór ruchu | Przełączenie solid/pattern, montowanie/usunięcie canvas; bez twierdzenia o zmierzonym FPS/energii słabego GPU |
| AD-11 | Pointer capture, blokada osi, śledzenie 1:1, anulowanie, projekcja prędkości i przerywalna sprężyna | Ukośny gest bez zmiany, przesunięcie przed puszczeniem, cancel i faktyczne przejście do drugiego obrazu |
| AD-12 | Usunięte transition-transform podczas pracy suwaków crop; Cancel czyści wybór pliku | Prawdziwy crop projektu i brak czasu przejścia obrazu |
| AD-13 | Osobne loading/empty/error/retry; anulowane zapytanie nie zmienia nowszego stanu | HTTP 500 i udane ponowienie przez lokalny fixture; nie kontaktuje się z produkcją |
| AD-14 | tablist/tab/aria-selected/panel, roving tabindex i strzałki/Home/End | Przejście klawiaturą i wybrany panel |
| AD-15 | Aktywne „więcej” z pełną listą dnia; mobilna agenda, opcja miesiąca i auto | Sześć zadań dostępnych w dialogu dnia i mobilnej liście |
| AD-16 | Status live z nazwą, kolumną i pozycją po odpowiedzi; błąd i rollback; ostrożne przywrócenie fokusu | Udany move i błąd zapisu w jednorazowej bazie; czytnik urządzenia do osobnej oceny |
| AD-17 | Sekcje zamiast zagnieżdżonych main | Jeden main na My modules, builderze i zarządzaniu faktycznie zainstalowanym pakietem |
| AD-18 | IME/229 nie wysyła; Shift+Enter zachowany; szerokość panelu ograniczona, padding safe area | 375px, złożenie tekstu i odpowiedź lokalnego fixture AI |
| AD-19 | Wspólny asynchroniczny dialog dla dotychczasowych window.confirm oraz usuwania zadania; Close przetłumaczone w czterech językach | Anulowanie i zatwierdzenie usunięcia testowego zadania; brak systemowych confirm w źródłach TSX |

Dodatkowo AD-20: szuflady mają równy, krótszy rytm 200ms w obu kierunkach.
AD-21: daty kluczy API używają jawnego locale i UTC; profil nie powinien
przełączać tekstu między renderem serwera a hydratacją. Test zbiera błędy strony
także przy istniejących kluczach API i nie toleruje błędu #418.

## Weryfikacja

Końcowe wyniki i identyfikator przebiegu zostaną dopisane po zakończeniu regresji.
Kolektor audytu pozostaje historycznym dowodem stanu przed poprawkami, nie
potwierdzeniem jakości zmienionego kodu.

Testy używają wyłącznie własnej bazy i fikcyjnych użytkowników. REVOKE/GRANT
w scenariuszu błędu dotyczy tylko jednorazowej instancji PostgreSQL i jest
odwracany w finally. Odpowiedzi błędu wyszukiwania i AI są lokalnymi fixture;
nie wywołuje się płatnego modelu ani usług produkcyjnych.

Przegląd z użyciem wskazówek `security-audit` dotyczy źródeł zmian UI:
potwierdzenie nie zastępuje serwerowej autoryzacji, anulowanie nie wysyła mutacji,
RLS i walidacja OAuth pozostają granicami dostępu. Nie jest to nowy pełny audyt
bezpieczeństwa ani dowód penetracyjny środowiska Cloud.

## Main a wdrożenie

`vercel.json` zawiera `git.deploymentEnabled.main = false`, aby scalenie kodu
nie uruchamiało automatycznego wdrożenia tej gałęzi. Pozostałe gałęzie zachowują
ustawienie domyślne. Jest to udokumentowana opcja
[Vercela](https://vercel.com/docs/project-configuration/git-configuration).
Nie zmienia działającego wdrożenia ani schematu bazy.

Przed osobno zatwierdzonym wydaniem:

1. Zweryfikować staging według `staging-handoff.md`, w tym Supabase Auth,
   recovery i Stripe sandbox; dokończyć bramki release HOLD.
2. Sprawdzić historię migracji właściwego środowiska; zatwierdzić i wykonać
   wymagane migracje przed uruchomieniem nowego kodu.
3. Zatwierdzić konkretny commit do wdrożenia. Dopiero wtedy usunąć blokadę main
   lub wykonać świadome wdrożenie wybranego commita; nie robić tego przypadkiem
   w ramach scalenia dokumentacji/poprawek UI.
4. Wykonać smoke test i przygotować cofnięcie aplikacji bez usuwania danych.

Fizyczne urządzenia, VoiceOver/TalkBack/NVDA, badanie nawigacji z ludźmi i pomiar
GPU/energii wymagają osobnych dowodów. Karty pozostają Review z tymi ograniczeniami;
scalenie implementacji nie oznacza automatycznie zaliczenia ręcznych prób.
