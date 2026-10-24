# Wydanie produkcyjne i porządkowanie Guidona — 2026-10-24

## Stan wydania

Właściciel zatwierdził wdrożenie produkcyjne w tej rozmowie. Kod na main:
`ce37c6b6`, PR #64 i #65. Końcowe CI #65: trzy przeglądarki, 110 kontroli
REST/MCP, 606 kontroli bazy i pozostałe bramki workflow — zaliczone.
[Dowód aplikacji](https://github.com/Two-Steps-Studio/guidon/actions/runs/40123162260),
[dowód modułów](https://github.com/Two-Steps-Studio/guidon/actions/runs/40122427965).

**Wdrożenie nie zostało wykonane.** Pozostaje konkretny brak konfiguracji bazy:

- Lokalnie wskazany Supabase: `thtzaeeatjwyitifdcxb`; właściciel ma potwierdzić,
  że jest to baza produkcyjna useguidon.com.
- Odczyt metadanych przez REST z `limit=0`: `feedback.rating` nie istnieje
  (SQLSTATE 42703). Zapis ocen wymaga migracji `084_feedback_rating.sql`.
- Historia `guidon_migrations` kończy się na `055_project_modules.sql`, lecz
  tabele `project_module_packages`, `module_catalog_entries`,
  `project_module_drafts` i `oauth_client_assertions` już istnieją. To nie dowodzi
  braku wszystkich późniejszych migracji; nie wolno odtwarzać ich w ciemno.
- Próba połączenia z bezpośrednim hostem PostgreSQL zakończyła się błędem DNS
  ENOTFOUND. Potrzebny adres z Supabase → Connect, najlepiej właściwy pooler.
- Właściciel otrzymał prośbę o lokalne skonfigurowanie DATABASE_URL. Adresów
  połączeń i sekretów nie należy umieszczać w PR, raporcie ani czacie.

Zapytania dotyczyły wyłącznie schematu i historii migracji; nie odczytano rekordów
klientów ani nie zmodyfikowano bazy. Nie uruchomiono automatycznych testów na
produkcji. Samo istnienie tabel nie potwierdza poprawności RLS.

## Kolejność po uzyskaniu konfiguracji

1. Potwierdzić środowisko i połączenie TLS; odczytać katalog schematu oraz pełną
   historię i sumy migracji. Porównać rzeczywisty schemat z main, uwzględniając
   wcześniejsze zmiany ręczne.
2. Potwierdzić dostępny backup/rollback. Przygotować konkretną listę koniecznych
   zmian. Migracja 084 jest rozszerzająca, zachowuje NULL dla starych rekordów
   i ogranicza nowe oceny do 1–5. Nie usuwać danych ani nie resetować bazy.
3. Wykonać wymagane zmiany schematu przed wdrożeniem writerów i zweryfikować
   ich strukturę. Odnotować rzeczywisty wynik, zamiast dopisywać historię
   niewykonanych migracji.
4. Wdrożyć zatwierdzony commit przez istniejący projekt Vercela. CLI jest
   wylogowane, a kontrola przeglądarki jest niedostępna w tej sesji; istniejąca
   integracja GitHub/Vercel jest alternatywą po usunięciu blokady main na czas
   zatwierdzonego wydania. Nie tworzyć zastępczego projektu ani domeny.
5. Zapisać identyfikator gotowego wdrożenia, URL i poprzednie wdrożenie do
   cofnięcia. Zachować osobną decyzję o automatycznym wydawaniu kolejnych zmian.

Do tego czasu `git.deploymentEnabled.main = false` pozostaje na main.

## Inwentaryzacja tablicy

Stan pobrany przed rozpoczęciem tej partii: **231 kart** — 132 Review, 24 Todo,
25 Backlog i 50 Done. W Review: 8 critical, 29 high, 91 medium, 4 low.
Poprzednia karta triage mówiła o 94 Review; liczba jest już nieaktualna.
[Pełna lista 132 kart](./review-inventory-2026-10-24.csv) jest inwentaryzacją,
nie protokołem ich zaakceptowania. Nie zamknięto masowo żadnych kart.

### Pierwszy przegląd wszystkich 8 kart critical w Review

| Karta | Ustalony dowód | Pozostała kontrola / decyzja |
|---|---|---|
| Paczka standalone (7acbf37e) | PR #58, guard paczki i canary w zielonym CI #65; źródła i raport przeczytane | Review: dowód dotyczy standalone, nie inspekcji zdalnej paczki Vercela |
| Podatne zależności (dec8686b) | PR #57, przypięte poprawione wersje, audit/dependency/Monaco gates w CI; raport przeczytany | Review: wynik advisory jest datowany; nie zastępuje audytu całej aplikacji |
| Izolacja API/MCP (f76a9572) | PR #60, 110 rzeczywistych kontroli HTTP na izolowanym PostgreSQL, ponowione w CI #65 | Review: brak pełnej macierzy Cloud JWT/PostgREST, plików, eksportu i cofnięcia członkostwa |
| Auth E2E (faf1537d) | PR #59, rejestracja, sesje, role i bezpieczny redirect na trzech przeglądarkach; PR #65 stabilizuje fixture | Review: Cloud confirmation/reset/ponowne użycie tokenu oraz zewnętrzny OAuth wymagają stagingu |
| Infrastruktura E2E (ab507a10) | PR #56 i #65, świeży build, fikcyjne konta, trzy przeglądarki, ślady i cleanup | Review: implementacja kryteriów infrastruktury udokumentowana; akceptacja właściciela |
| Fix — wystający przycisk (b1c937b4) | Poprzednia poprawka nagłówka projektu i edit-project-dialog; odczytano kontekst próby | Review: sprawdzić wskazany widok i zrzut na urządzeniu, nie utożsamiać z samym testem tablicy |
| Niebezpieczne — cudze projekty (121c8707) | Kod korzysta z sesji/RLS; migracje 064/067 zmieniają project_access; izolacja lokalna w CI | Review: brak dowodu rzeczywistych polityk Cloud. Nie używać service-role do dowodzenia izolacji użytkowników i nie testować cudzych danych produkcyjnych |
| Błąd — Unity 403 (e12afb78) | Kontekst zawiera poprawkę human_client w migracji 039 i trasach z uprzednim E2E | Review: historyczny SUCCEEDED nie zastępuje próby aktualnej wtyczki z właściwą rolą i kluczem |

To pierwszy przebieg triage ośmiu kart krytycznych. Pozostałe 124 Review nie
otrzymały w tej partii ponownej walidacji kodu i stagingu. Kolejność: 29 high,
potem medium/low; duplikaty rozstrzygać po opisach i dowodach, nie samym tytule.
Dotyczy to szczególnie licznych kart „Moduły”, „Ikony”, „AI” i „Sidebar”.

## Bieżąca partia małych zadań

- Favicon (52c882bb): większy oficjalny niebieski symbol bez tła; ICO zawiera
  16/32/48/64/256px i przezroczyste narożniki. Osobny tryb generatora nie
  przepisuje ikon aplikacji instalowanych ani grafik społecznościowych.
- Uporządkowanie sidebara (ea3622d9): porównać z wdrożoną w kodzie AD-09
  (grupa rozszerzeń, odrębne ikony, zwijane sekcje); zachować ręczną ocenę UX.
- Moduły (94dbb45e): osobne zakładki dla dodanych modułów to konkretne wymaganie.
  Nie uznawać go za zakończone tylko dlatego, że istnieje zbiorczy link „Moduły”.

Źródła potwierdzeń oraz granice pokrycia:
[Apple Design](./apple-design-fixes-and-main-2026-10-24.md),
[Auth](./authentication-coverage-2026-10-24.md),
[API/MCP](./api-mcp-isolation-2026-10-24.md),
[staging](./staging-handoff.md).
