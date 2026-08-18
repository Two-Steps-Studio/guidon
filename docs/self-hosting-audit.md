# Guidon — audyt architektury pod kątem self-hostingu

**Faza 1 wg TODO.md §29.** Ocena, nie implementacja. Wszystkie liczby pochodzą
z pomiaru repozytorium i żywej bazy, nie z założeń.

---

## Current architecture (stan pomiaru — Faza 1, przed Etapem 1)

Tabela poniżej to zdjęcie repozytorium z chwili audytu, **zanim** zaczęła się
migracja na Server Components/Actions opisana w bloku 1. Liczby stron,
Server Actions i tras API poniżej są dziś nieaktualne — patrz blok 1 (0 → 1
Server Action stał się kilkanaście, 17 stron klienckich → 3) i sekcja
„Deployment problems" niżej. Wiersze o RLS/Supabase w bazie nadal są
aktualne, opisuje je blok 2.

| | |
|---|---|
| Framework | Next.js 16.3.0, App Router, React 19 |
| Baza | Supabase PostgreSQL (projekt `thtzae…`, osobny od TSS) |
| Auth | Supabase Auth przez `@supabase/ssr` 0.5.2 |
| Storage | Supabase Storage, 3 buckety |
| Strony | 19, z czego **17 to `'use client'`** *(stan przed blokiem 1 — dziś: 3)* |
| Server Actions | **0** *(stan przed blokiem 1 — dziś: kilkanaście, w `actions.ts` pod `/organizations` i `/projects/[id]`)* |
| Trasy API | 16 pod `/api/v1`, UI używa jednej |
| Autoryzacja | wyłącznie RLS — 70 polityk |

---

## Self-hosting blockers

Uporządkowane wg trudności. Pierwszy jest strukturalny, reszta to praca do wykonania.

### 1. Przeglądarka rozmawia bezpośrednio z PostgREST — ROZWIĄZANE

Było: 13 stron (18 licząc komponenty poza `page.tsx`) wołało Supabase
bezpośrednio z przeglądarki. Architektura zakładała **HTTP API zgodne z
PostgREST, osiągalne z przeglądarki**, którego na czystym PostgreSQL nie ma —
self-hosting wymagałby uruchomienia PostgREST + GoTrue, czyli w praktyce
całego self-hosted Supabase, wbrew §4.

Wszystkie strony odczytujące dane pod `/projects/[id]` i `/organizations`
przeszły na Server Components; każdy zapis przeszedł na Server Actions
(pierwsza w repo — `src/app/projects/[id]/actions.ts`). Ostały się wyłącznie
trzy strony, które **muszą** zostać po stronie klienta z definicji: logowanie,
rejestracja i wylogowanie ustanawiają sesję w przeglądarce, a OAuth wymaga
przekierowania przeglądarki do dostawcy.

```bash
grep -rl "'use client'" src/app --include=*.tsx | \
  xargs grep -l "from '@/lib/supabase'" 2>/dev/null
# → tylko auth/login, auth/logout, auth/signup
```

Efekty uboczne warte odnotowania:

* **Trzy błędy CHECK constraint znalezione i naprawione.** Dialog decyzji na
  starej stronie `/context` oferował `accepted`/`superseded`, których baza
  nigdy nie akceptowała (`proposed/approved/rejected/deprecated`); dialog
  źródeł oferował `url`/`note`/`code`, żaden z nich nie istnieje w
  `SourceType` (`document/comment/commit/pull_request/issue/external_url/
  meeting/file/other`). Każda próba zapisania takiej wartości kończyła się
  odrzuceniem przez CHECK. Wybór typu decyzji na `/decisions` nie miał opcji
  `product`, mimo że schemat i UI kolorów już ją znały.
* **Dwa liczniki zawsze pokazywały 0.** `completed_tasks` na przeglądzie
  projektu i na dashboardzie porównywały `status === 'completed'`, a
  migracja 002 dawno zmieniła słownik na `'done'`.
* **`ContextLayerProvider`, `AuthProvider`, `ProjectProvider` usunięte.**
  Były martwe od początku (§C techdebt, zero montowań). Czwarty —
  `ProjectAccessProvider` — stał się martwy w trakcie tej migracji: skoro
  każda strona i tak woła `requireProjectAccess()` bezpośrednio (owinięte w
  `cache()`, więc bez dodatkowego zapytania), Kontekst kliencki przestał mieć
  konsumentów. Usunięty razem z resztą zamiast zostać jako martwy kod.
* **Upload plików przechodzi teraz przez `StorageProvider`.** Wcześniej strona
  wołała `supabase.storage` wprost, ignorując całą warstwę z §5 — na
  self-hosted z lokalnym storage nigdy by to nie zadziałało, bo przeglądarka
  nie ma dostępu do dysku serwera.

**Pozostaje:** trasy `/api/v1/*` nadal istnieją równolegle (nieużywane przez
UI, wspomniane w §C jako martwy kod do wyczyszczenia — poza zakresem tej
migracji).

### 2. RLS opiera się na prymitywach Supabase — ROZWIĄZANE

| Prymityw | Wystąpień | Stan |
|---|---|---|
| `auth.uid()` | 47 | odtworzone |
| `TO authenticated` | 97 | rola utworzona |
| `auth.users` | 9 | tabela utworzona |
| `service_role` | 14 | rola + BYPASSRLS + uprawnienia |
| `request.jwt.claims` | 1 | ustawiane per transakcja |
| polityki RLS łącznie | 70 | **bez zmian** |

Warstwa zgodności `src/db/bootstrap/000_auth_compat.sql` odtwarza te prymitywy
jako zwykłe obiekty PostgreSQL. Żadna z 70 polityk nie została przepisana —
istnieje jedna definicja zabezpieczeń dla obu baz, a nie dwie rozjeżdżające się.

Druga połowa to `src/lib/db/session.ts`: otwiera transakcję, ustawia
`request.jwt.claims` przez `set_config(..., true)` i schodzi do roli przez
`SET LOCAL ROLE`. Oba są lokalne dla transakcji, więc pula połączeń nie przenosi
tożsamości między żądaniami — sprawdzone testem, także po ROLLBACK.

Runner stosuje warstwę tylko wtedy, gdy w bazie brak `auth.uid()`. Na Supabase
plik nie jest w ogóle czytany.

**Weryfikacja:** `npm run test:db` — 49 asercji na PostgreSQL 18 (PGlite), bez
Dockera i bez Supabase: pełny łańcuch migracji na pustej bazie, izolacja między
użytkownikami, brak śladu tożsamości na połączeniu, zachowanie `service_role`.

Uruchomienie tego łańcucha ujawniło błąd, którego sam SQL nie pokazywał:
`INSERT ... RETURNING` na `organizations` i `projects` był odrzucany przez RLS,
bo polityka SELECT jest stosowana do zwracanego wiersza, zanim trigger AFTER
utworzy członkostwo. Dotyczy to również Supabase — naprawia migracja `009`.

Warunek z blokera 1 — GUC może ustawiać wyłącznie kod serwerowy — jest teraz
spełniony: strony pod `/projects` i `/organizations` przeszły na Server
Components/Actions, więc ta ścieżka faktycznie obsługuje ich zapytania.

### 3. Brak jakiejkolwiek infrastruktury wdrożeniowej — ROZWIĄZANE

Było: żaden z `Dockerfile`, `docker-compose.yml`, `.dockerignore` nie istniał;
`.env.example` opisywał wyłącznie Supabase.

Wszystkie trzy pliki istnieją. `Dockerfile` jest wieloetapowy
(deps → builder → runtime, `node:22-alpine`), instaluje zależności z
`--ignore-scripts`, przyjmuje zmienne `NEXT_PUBLIC_*` jako build args (bo
wkompilowują się w bundle klienta) i kopiuje do runtime'u wyłącznie
`.next/standalone` — możliwe dzięki `output: "standalone"`, dodanemu do
`next.config.ts`. `docker-compose.yml` (100 linii) definiuje trzy usługi: `db`
(Postgres 17, wolumen nazwany, `healthcheck` przez `pg_isready`, port
niepublikowany), `migrate` (jednorazowa, `node scripts/migrate.mjs`,
`depends_on: db.condition: service_healthy`) i `app` (startuje dopiero po
`migrate.condition: service_completed_successfully`). `.env.example` (4 KB)
opisuje teraz sekcje `DATABASE`, `SELF-HOSTED POSTGRESQL`, `STORAGE` i `AI`
obok Supabase.

**Uwaga:** komentarz w samym `docker-compose.yml` ("UWAGA O STANIE
FAKTYCZNYM") wciąż twierdzi, że aplikacja "nadal uwierzytelnia się przez
Supabase Auth i przez jego klienta czyta większość danych" i odsyła do
bloku 2 tego audytu jako nierozwiązanego. To jest nieaktualne od czasu, gdy
blok 2 (poniżej) i cała migracja stron `/projects` i `/organizations` na
Server Components/Actions zostały domknięte — ale ten plik nie jest w
zakresie tej sesji (kod, nie `.md`), więc nie został poprawiony tutaj i
zasługuje na osobną poprawkę.

### 4. Brak migracji uruchamialnych automatycznie — ROZWIĄZANE

Było: migracje `001`–`007` to pliki SQL wklejane ręcznie do edytora Supabase,
bez runnera, tabeli wersji ani `000_baseline`.

`scripts/migrate.mjs` (245 linii) istnieje: `npm run migrate` /
`npm run migrate:status` / `--dry-run`. Stosuje migracje w kolejności nazw
pliku, każdą w osobnej transakcji, i zapisuje checksumę w
`guidon_migrations` — plik zmieniony po zastosowaniu jest twardym błędem, nie
cichym pominięciem. `000_baseline_schema.sql` odtwarza schemat sprzed
migracji `002`, więc cały łańcuch stosuje się na pustej bazie. Runner
dodatkowo wykrywa brak `auth.uid()` i wtedy sam stosuje
`src/db/bootstrap/000_auth_compat.sql` przed czymkolwiek innym (patrz blok 2).
Zweryfikowane: `npm run test:db` uruchamia cały łańcuch (compat + 000–009) na
realnym PostgreSQL 18 (PGlite) i przechodzi w kilka sekund, bez Dockera.

---

## Supabase coupling

Dobra wiadomość: sprzężenie jest **skoncentrowane, nie rozlane** — i skurczyło
się dalej od chwili audytu.

* dziś **5 z 120** plików (`src/**/*.ts(x)`) importuje `@supabase/*` — repo
  urosło (73 → 120 plików, głównie `actions.ts` i strony Server Component z
  bloku 1), a lista importerów Supabase zmalała
* tworzenie klienta w 2 plikach: `lib/supabase.ts`, `lib/supabase-server.ts`

```
lib/auth/auth-helpers.ts
lib/context/project-relations.ts
lib/supabase-server.ts
lib/supabase.ts
proxy.ts
```

`contexts/auth-context.tsx`, wcześniej wymieniony tu jako martwy kod, nie
istnieje — cały `src/contexts/` (`AuthProvider`, `ProjectProvider`,
`ContextLayerProvider`, `ProjectAccessProvider`) został usunięty, patrz blok 1.

To są gotowe punkty zaczepienia dla adapterów. Rozproszone jest natomiast
**użycie** klienta — `.auth.getUser()` w ~10 stronach.

---

## Storage coupling — ROZWIĄZANE

Stan z chwili audytu: wszystkie wywołania `.storage.` żyły w jednym pliku,
`lib/storage/storage.ts`, którego publiczny interfejs (`uploadProjectFile`,
`deleteFile`, `getSignedUrl`, kwoty, walidacja) był już zorientowany
domenowo, nie providerowo — więc podmiana wnętrza na `StorageProvider` z §5
nie wymagałaby zmian w kodzie wołającym. Dokładnie to się stało.

`src/lib/storage/provider.ts` definiuje interfejs `StorageProvider` i wybiera
implementację na podstawie `STORAGE_PROVIDER` (`supabase` domyślnie, `local`,
`s3` — zarezerwowany, rzuca „not implemented"). Wywołania `.storage.`
(Supabase SDK) żyją teraz w `src/lib/storage/providers/supabase.ts`, obok
`providers/local.ts` (filesystem pod `STORAGE_PATH`, serwowany przez
`/api/storage`). `storage.ts` sam nie zawiera już żadnego `.storage.` —
woła wyłącznie `getStorageProvider()`.

Efekt uboczny: upload plików przeszedł z bezpośredniego wywołania w
przeglądarce na Server Action (`src/app/projects/[id]/files/actions.ts`),
bo `local` wymaga zapisu na dysku serwera, do którego przeglądarka nie ma
dostępu — patrz blok 1.

---

## Auth coupling — powierzchnia zmalała

Stan z chwili audytu: **7 metod**, z czego trzy (`getSession`,
`onAuthStateChange`, `refreshSession`) żyły wyłącznie w niezamontowanym
`auth-context.tsx`, więc realnie do zaadaptowania było cztery.

Dziś, po usunięciu `src/contexts/` (blok 1), te trzy metody **nie
występują nigdzie w kodzie** — usunięte razem z kontekstem, nie
przeniesione. Powierzchnia to więc już tylko cztery metody:

| Metoda | Gdzie |
|---|---|
| `signInWithPassword` | `auth/login` |
| `signUp` | `auth/signup` |
| `signOut` | `auth/logout` |
| `getUser` | 6 plików: `proxy.ts`, `lib/auth/auth-helpers.ts`, `lib/data/current-user.ts`, `lib/data/org-access.ts`, `lib/data/project-access.ts`, `organizations/actions.ts` — skoncentrowane w warstwie danych/serwerowej, nie rozsiane po stronach |

To mieści się w interfejsie `AuthProvider` z §24 bez zmian w samym
interfejsie — zmalała tylko liczba wywołań do zaadaptowania.

Głębszy problem nie leży w API, tylko w tym, że tożsamość użytkownika
przenosi **JWT Supabase**, który PostgREST tłumaczy na `auth.uid()`. Zamiennik
musi wystawić ten sam kontrakt do bazy (patrz blocker 2).

---

## AI coupling

**Nie istnieje.** Zero kodu AI — jedyne trafienie w wyszukiwaniu to string
`"ai"` jako kategoria technologii.

To jest zaleta: `AIProvider` z §6 można zaprojektować od zera, bez długu
i bez wyrywania zaszytego providera. Żadnego sprzężenia do rozplątania.

---

## Deployment problems

Stan z chwili audytu (Fazy 1) — wszystkie poniższe zostały od tego czasu
zaadresowane, patrz blokery 3 i 4 wyżej:

* ~~brak Dockerfile i docker-compose (§2, §3)~~ — istnieją
* ~~brak health checka `/api/health` (§12)~~ — istnieje, sprawdza
  database/storage/auth/ai, nie ujawnia sekretów
* ~~brak runnera migracji (§13)~~ — `scripts/migrate.mjs` istnieje
* ~~`.env.example` opisuje tylko Supabase~~ — opisuje teraz `DATABASE_URL`,
  `STORAGE_PROVIDER`, `AI_PROVIDER` (§11)
* ~~Next.js nie ma `output: 'standalone'`~~ — ustawione w `next.config.ts`

Pozostaje: `AIProvider` (§6/§7) nie istnieje — `/api/health` zgłasza `ai` jako
`not_configured` bez względu na zmienne środowiskowe, uczciwie.

---

## Security problems

Sprawdzone, **wypada dobrze**:

* `SUPABASE_SERVICE_ROLE_KEY` używany w dokładnie jednym pliku, serwerowym —
  bez wycieku do klienta
* do przeglądarki trafiają tylko `NEXT_PUBLIC_SUPABASE_URL` i `ANON_KEY`,
  co jest zgodne z modelem Supabase
* izolacja tenantów wymuszona w bazie (RLS), nie w UI — zgodnie z §9
* `anon` ma odebrane uprawnienia do wszystkich tabel (migracja `003`)

Do poprawy:

* brak bramkowania UI po uprawnieniach — stan sprzed migracji na Server
  Components; wymaga ponownego sprawdzenia teraz, gdy większość stron czyta
  dane po stronie serwera (blok 1) zamiast liczyć na to, że RLS przechwyci
  błędny dostęp w przeglądarce
* brak rate limitingu (§10)
* ~~walidacja uploadów istnieje, ale nie ma ochrony przed path traversal przy
  storage lokalnym~~ — **naprawione**: `src/lib/storage/providers/local.ts`
  odrzuca `..` przez `assertSafeStoragePath`/`assertSafeBucket` i osobno
  weryfikuje, że ścieżka po `path.resolve()` zostaje wewnątrz roota bucketa
  (`prefix` check) — druga warstwa istnieje właśnie dlatego, że symlinki i
  normalizacja unicode potrafią ominąć samą kontrolę stringów

---

## Migration risks

| Ryzyko | Waga | Uwagi |
|---|---|---|
| Przeniesienie dostępu do danych na serwer dotyka 17 stron | ~~**wysokie**~~ zrobione | wykonane stopniowo, strona po stronie (blok 1); RLS zostało siatką bezpieczeństwa przez całą migrację |
| Warstwa zgodności `auth.uid()` musi być 1:1 | ~~**wysokie**~~ zrobione | `000_auth_compat.sql` + `npm run test:db` (49 asercji), błąd RETURNING wykryty i naprawiony migracją 009 |
| Brak `000_baseline` | ~~średnie~~ zrobione | `000_baseline_schema.sql` istnieje |
| Rozjazd repo ↔ baza | średnie | precedens: `set_organization_creator` istniał tylko w bazie; dalej aktualne jako ryzyko procesowe |
| Storage lokalny bez sanityzacji ścieżek | ~~średnie~~ zrobione | wprowadzone razem z adapterem (`assertSafeStoragePath`/`assertSafeBucket` w `providers/local.ts`) |
| Electron dzieli `package.json` ze stroną | niskie | dotyczy `tss-website`, nie Guidona |

---

## Wniosek Fazy 1

Sprzężenie z Supabase jest **płytsze, niż wygląda** — 6 plików, 5 importów w
chwili audytu (dziś: 5 plików, patrz „Supabase coupling" wyżej), storage w
jednym miejscu, AI w ogóle nie istnieje. Adaptery z §24 są tanie.

Prawdziwym blokerem jest **kierunek przepływu danych**: przeglądarka →
PostgREST. Dopóki to się nie zmieni, self-hosting oznacza uruchomienie
całego Supabase, a nie „własnego PostgreSQL".

Dlatego kolejność z §29 wymaga jednej korekty: **Faza 3 (Docker) nie ma sensu
przed przeniesieniem dostępu do danych na serwer.** Zbudowanie
docker-compose wokół obecnej architektury utrwaliłoby zależność od
PostgREST — czyli dokładnie to, czemu §4 ma zapobiegać.

Proponowana kolejność:

1. ✅ **Etap 1 z zatwierdzonego planu** — Server Components + Server Actions
   (i tak zaplanowane, teraz okazuje się warunkiem koniecznym)
2. ✅ `StorageProvider` — najtańszy, całkowicie izolowany
3. ✅ `000_baseline` + runner migracji, oraz warstwa zgodności `auth.uid()`
   (blok 2)
4. ⬜ `AIProvider` — zielone pole, wciąż nie istnieje
5. ✅ Docker Compose + health check

Cztery z pięciu kroków są zrobione i zweryfikowane (`npm run test:db`, 49
asercji; `grep` na `'use client'` + `@/lib/supabase` zwraca tylko trzy strony
auth). Jedyny pozostały punkt tej listy to `AIProvider` — poza tym
self-hosting bez PostgREST/GoTrue jest dziś realny, nie tylko teoretyczny.
