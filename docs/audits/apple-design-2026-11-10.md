# Guidon: audyt Apple Design, 2026-11-10

Baza: `b40a436` (main po PR #232). Audyt według apple-design:

- reakcja na wejście;
- manipulacja bezpośrednia i przerwanie gestu;
- spójność przestrzenna i materiały;
- typografia;
- dostępność;
- ochrona pracy (zasada „Agency”).

To nie jest certyfikacja Apple ani WCAG.

## Dowody i zakres

**Środowisko:** lokalny serwer deweloperski (`next dev`), PostgreSQL w Dockerze, fikcyjne konta z fixture, bez usług produkcyjnych.

**Skan przeglądarki:** Playwright (Chromium) + axe-core (WCAG 2.0/2.1/2.2 AA i best-practice, wpływ moderate i wyżej). Trzy konfiguracje:

- 1440×1000 w trybie jasnym;
- 375×812 w trybie ciemnym z dotykiem;
- 375×812 z ograniczonym ruchem.

Łącznie 22 strony publiczne i aplikacji: landing, porównania, start, logowanie, dokumenty prawne, pulpit, „Moje zadania”, przegląd projektu, tablica, pamięć, decyzje, roadmapa, kalendarz, whiteboard, brief, ustawienia, profil, organizacje, admin.

**Co mierzono na każdej stronie:**

- naruszenia axe;
- poziome przepełnienie;
- cele dotykowe poniżej 24 px (tekstowe linki w akapitach i listach pominięte, zgodnie z wyjątkiem WCAG 2.5.8);
- przejścia dłuższe niż 500 ms;
- nieskończone animacje;
- błędy konsoli.

**Przegląd kodu:**

- wspólne przyciski, arkusze i dialogi;
- tokeny ruchu;
- reguły `prefers-reduced-motion` / `-transparency` / `prefers-contrast`;
- przeciąganie kart;
- sztuczne opóźnienia (`setTimeout`, debounce) na drodze wejścia;
- zapis whiteboardu.

**Nie obejmuje:**

- VoiceOver i TalkBack na urządzeniu;
- fizycznego telefonu;
- Firefoksa i WebKit (poprzedni audyt);
- aplikacji Expo (poprzedni audyt).

Pojedyncze timeouty i błąd 500 w trakcie skanu pochodziły z przeciążonej lokalnej bazy (logi: `Connection terminated due to connection timeout`), a 404 z awatara pozostałego po teście S3. Nie są to błędy aplikacji.

## Stan ustaleń z 2026-10-31

| Ustalenie | Stan |
| --- | --- |
| P2: edytor limitu i planu w adminie bez nazwy | Zamknięte (`aria-label` z nazwą organizacji) |
| P2: ukryty input obrazu organizacji bez nazwy | Zamknięte (`ImageCropInput` przekazuje `aria-label`) |
| P3: drobne kontrolki desktopowe < 44 px | Częściowo, patrz AD3-07 |
| P1: utrata szkicu w WebKit | Bez zmian, poza zakresem tego audytu |

## Ustalenia i poprawki

| ID | Priorytet | Ustalenie | Poprawka |
| --- | --- | --- | --- |
| AD3-01 | P1 | **Whiteboard gubił ostatnią zmianę.** Zapis jest opóźniony o 1 s (`useDebounce`), a licznik jest kasowany przy odmontowaniu. Notatka dodana lub przesunięta tuż przed przejściem do innej zakładki projektu nie trafiała do bazy. | `persist()` zapisuje zmienione elementy także przy odmontowaniu i przy ukryciu karty (`visibilitychange`). Oznaczanie jako zapisane jest optymistyczne, a przy błędzie cofane, więc nie ma podwójnych wysyłek. **Odtworzone:** przed poprawką 5 → 5 elementów (zmiana utracona), po poprawce 5 → 6. |
| AD3-02 | P2 | **Przyciski w kolorze projektu miały nieczytelny tekst.** Tło brało kolor projektu, a tekst kolor motywu. W trybie ciemnym dawało to granatowy tekst na niebieskim tle (2.75:1) w 7 przyciskach („Dodaj decyzję”, „Dodaj fazę”, „Nowe zadanie”, pliki, członkowie, źródła wiedzy). Jasny kolor projektu psuł też tryb jasny. | `projectColorFill()` (`src/lib/brand-colors.ts`) dobiera biały albo granatowy tekst według kontrastu WCAG. |
| AD3-03 | P2 | **Kolory statusów w trybie jasnym** (zielony `#059669`, pomarańczowy `#d97706`) miały 3.1–3.8:1 jako tekst. Na odznakach z tłem 15% było to 2.7–3.1:1. | `#04704f` i `#a14a07` przechodzą 4.5:1 na białym tle i na odznakach z tłem 15%. Warianty hover zostały przyciemnione tak samo. Tryb ciemny bez zmian, bo już był czytelny. |
| AD3-04 | P2 | **Szary tekst pomocniczy** `#64748b` miał 4.23–4.43:1 na przyciemnionych tłach (odznaki, ciepłe tło profilu). | `#596a7e`: co najmniej 4.5:1 na wszystkich jasnych tłach aplikacji. |
| AD3-05 | P2 | **Boczny pasek nie był punktem orientacyjnym.** Logo, nawigacja i stopka paska leżały poza punktami orientacyjnymi strony, więc czytnik nie mógł do nich przeskoczyć (axe `region`, 12–32 elementów na stronę). Mobilny arkusz miał nieprzetłumaczony tytuł „Sidebar”. | `Sidebar` renderuje `<nav aria-label>` z przetłumaczoną nazwą (`nav.sidebarLabel`) na desktopie i w arkuszu. |
| AD3-06 | P2 | **Struktura nagłówków.** `CardTitle` zawsze dawał `h3`, także bezpośrednio pod `h1` (przeskok poziomu na 12 stronach). Logowanie, rejestracja, reset hasła, whiteboard i admin nie miały `h1`, a `/start` nie miał `<main>`. | `CardTitle` domyślnie daje `h2` i ma prop `as`: cennik zostaje przy `h3`, formularze logowania dostają `h1`. Whiteboard i admin mają `h1` tylko dla czytnika. `EmptyState` daje `h2`. Strefa usuwania projektu ma `h3`. `/start` ma `<main>`. |
| AD3-07 | P3 | **Cele dotykowe około 20 px na telefonie:** „Back to home”, nawigacja dokumentów prawnych, „See all” na pulpicie, menu sekcji profilu i ustawień projektu, link „About” w stopce. | Istniejąca klasa `touch-target`, czyli 44 px tylko przy `pointer: coarse`, bez zmian na desktopie. Stopka dostała 44 px w media query mobilnym. |
| AD3-08 | P3 | **Puste notatki whiteboardu nie miały nazwy** (axe `aria-command-name`). | `ariaLabel` węzła: „Karteczka: tekst” albo sam rodzaj, gdy notatka jest pusta. Tłumaczenia w 4 językach. |
| AD3-09 | P3 | **Przewijany blok kodu widżetu zgłoszeń** w ustawieniach był nieosiągalny klawiaturą. | `tabIndex={0}`, jak w `MarkdownPage`. |
| AD3-10 | P3 | **Logo na stronie EULA znikało w trybie ciemnym.** | `dark:invert`, jak na pozostałych stronach prawnych. |

**Po poprawkach:** ponowny skan zmienionych stron w obu konfiguracjach nie zgłasza żadnych naruszeń axe na pulpicie, „Moich zadaniach”, przeglądzie projektu, pamięci, decyzjach, roadmapie, whiteboardzie, ustawieniach, profilu, adminie, `/start`, logowaniu i dokumentach prawnych. Nie ma poziomego przepełnienia, przejść dłuższych niż 500 ms ani nieskończonych animacji.

## Otwarte (świadomie bez zmian)

- **Natywne checkboxy, radio i przełączniki (13–36 px)** w ustawieniach i profilu. Etykiety są klikalne, więc faktyczny cel jest większy. Powiększenie samej kontrolki zmieniłoby gęste układy formularzy. Do sprawdzenia na telefonie.
- **Przycisk tytułu na karcie zadania (19 px).** Cała karta otwiera zadanie po dotknięciu, a przycisk służy klawiaturze i czytnikowi. To nie jest problem dotyku.
- **Link „React Flow”** to atrybucja biblioteki na whiteboardzie. Zostaje.
- **Linki w treści** (e-mail w dokumentach prawnych, „Sign up” w zdaniu) objęte są wyjątkiem WCAG 2.5.8 dla linków w tekście.

## Zachowania zachowane

**Reakcja:**
- przyciski reagują przy wciśnięciu (`active:scale-[0.97]`, 100 ms);
- sztuczne opóźnienia dotyczą tylko zapisu i resetu stanu „skopiowano”, nigdy reakcji na wejście.

**Przeciąganie kart:**
- duch karty trzyma się miejsca chwytu (`grabOffsetX/Y`);
- tablica przewija się przy krawędziach;
- Escape anuluje przeciąganie;
- jest alternatywa bez przeciągania dla dotyku.

**Arkusze i menu:**
- arkusze wchodzą i wychodzą tą samą drogą;
- menu i popovery rosną od wyzwalacza (`--radix-*-transform-origin`).

**Preferencje systemowe:**
- `prefers-reduced-motion`: przenikanie zamiast slajdów, a JS czyta tę samą preferencję (`useReducedMotionPreference`);
- `prefers-reduced-transparency` i `prefers-contrast: more`: pełne tła bez rozmycia;
- `forced-colors` jest obsługiwane.

**Typografia:**
- zawężony tracking i interlinia nagłówków;
- `text-wrap: balance` i `pretty`;
- liczby o stałej szerokości w liczbach i raportach.

## Odtworzenie

Skrypty skanu (Playwright + axe) i testu zapisu whiteboardu uruchamiano lokalnie przeciw `next dev`. Nie są częścią repozytorium. Pełny, izolowany odpowiednik to `node tests/e2e/run.mjs --design-audit` z poprzednich audytów.
