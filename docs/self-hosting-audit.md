# Guidon — audyt architektury pod kątem self-hostingu

**Faza 1 wg TODO.md §29.** Ocena, nie implementacja. Wszystkie liczby pochodzą
z pomiaru repozytorium i żywej bazy, nie z założeń.

---

## Current architecture

| | |
|---|---|
| Framework | Next.js 16.3.0, App Router, React 19 |
| Baza | Supabase PostgreSQL (projekt `thtzae…`, osobny od TSS) |
| Auth | Supabase Auth przez `@supabase/ssr` 0.5.2 |
| Storage | Supabase Storage, 3 buckety |
| Strony | 19, z czego **17 to `'use client'`** |
| Server Actions | **0** |
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

**Weryfikacja:** `npm run test:db` — 44 asercje na PostgreSQL 18 (PGlite), bez
Dockera i bez Supabase: pełny łańcuch migracji na pustej bazie, izolacja między
użytkownikami, brak śladu tożsamości na połączeniu, zachowanie `service_role`.

Uruchomienie tego łańcucha ujawniło błąd, którego sam SQL nie pokazywał:
`INSERT ... RETURNING` na `organizations` i `projects` był odrzucany przez RLS,
bo polityka SELECT jest stosowana do zwracanego wiersza, zanim trigger AFTER
utworzy członkostwo. Dotyczy to również Supabase — naprawia migracja `009`.

Warunek z blokera 1 — GUC może ustawiać wyłącznie kod serwerowy — jest teraz
spełniony: strony pod `/projects` i `/organizations` przeszły na Server
Components/Actions, więc ta ścieżka faktycznie obsługuje ich zapytania.

### 3. Brak jakiejkolwiek infrastruktury wdrożeniowej

`Dockerfile`, `docker-compose.yml`, `.dockerignore` — **żaden nie istnieje**.
`.env.example` istnieje, ale opisuje wyłącznie Supabase.

### 4. Brak migracji uruchamialnych automatycznie

§13 wymaga determinizmu. Obecnie migracje `001`–`007` to pliki SQL wklejane
ręcznie do edytora Supabase. Nie ma runnera, tabeli wersji ani `000_baseline`
— **repozytorium nie odtworzy bazy od zera**.

---

## Supabase coupling

Dobra wiadomość: sprzężenie jest **skoncentrowane, nie rozlane**.

* tylko **6 z 73** plików importuje `@supabase/*`
* łącznie 5 instrukcji importu (3 × `@supabase/ssr`, 2 × `@supabase/supabase-js`)
* tworzenie klienta w 2 plikach: `lib/supabase.ts`, `lib/supabase-server.ts`

```
contexts/auth-context.tsx        (martwy kod)
lib/auth/auth-helpers.ts
lib/context/project-relations.ts
lib/supabase-server.ts
lib/supabase.ts
proxy.ts
```

To są gotowe punkty zaczepienia dla adapterów. Rozproszone jest natomiast
**użycie** klienta — `.auth.getUser()` w ~10 stronach.

---

## Storage coupling

**Najsłabsze sprzężenie w całym projekcie.** Wszystkie 3 wywołania
`.storage.` żyją w jednym pliku: `lib/storage/storage.ts`.

Publiczny interfejs (16 funkcji: `uploadProjectFile`, `deleteFile`,
`getSignedUrl`, kwoty, walidacja) jest już zorientowany domenowo, nie
providerowo. Wystarczy podmienić wnętrze na `StorageProvider` z §5
(`LocalFilesystem` / `S3` / `Supabase`) — **bez zmian w kodzie wołającym**.

To najtańszy punkt do zrealizowania i dobry pierwszy krok Fazy 4.

---

## Auth coupling

Powierzchnia jest mała — **7 metod**:

| Metoda | Gdzie |
|---|---|
| `signInWithPassword` | `auth/login` |
| `signUp` | `auth/signup` |
| `signOut` | `auth/logout`, `auth-context` |
| `getUser` | ~10 stron + `proxy.ts` + `auth-helpers` |
| `getSession` | `auth-context` (martwy) |
| `onAuthStateChange` | `auth-context` (martwy) |
| `refreshSession` | `auth-context` (martwy) |

Trzy ostatnie są w niezamontowanym kontekście, więc realnie do zaadaptowania
są **cztery**. To mieści się w interfejsie `AuthProvider` z §24.

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

* brak Dockerfile i docker-compose (§2, §3)
* brak health checka `/api/health` (§12)
* brak runnera migracji (§13)
* `.env.example` opisuje tylko Supabase — brak `DATABASE_URL`,
  `STORAGE_PROVIDER`, `AI_PROVIDER` (§11)
* Next.js nie ma `output: 'standalone'`, co jest praktycznie wymagane
  dla sensownego obrazu produkcyjnego

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

* brak bramkowania UI po uprawnieniach na 15 z 19 stron — RLS rzuca surowym
  błędem Postgresa zamiast czytelnego stanu (łamie §38)
* brak rate limitingu (§10)
* walidacja uploadów istnieje, ale nie ma ochrony przed path traversal przy
  storage lokalnym — dziś nieistotne, przy `LocalFilesystem` **krytyczne**

---

## Migration risks

| Ryzyko | Waga | Uwagi |
|---|---|---|
| Przeniesienie dostępu do danych na serwer dotyka 17 stron | **wysokie** | robić stopniowo, strona po stronie; RLS zostaje siatką bezpieczeństwa |
| Warstwa zgodności `auth.uid()` musi być 1:1 | **wysokie** | rozjazd = ciche obejście autoryzacji |
| Brak `000_baseline` | średnie | do napisania przed czymkolwiek dockerowym |
| Rozjazd repo ↔ baza | średnie | precedens: `set_organization_creator` istniał tylko w bazie |
| Storage lokalny bez sanityzacji ścieżek | średnie | wprowadzić razem z adapterem, nie po |
| Electron dzieli `package.json` ze stroną | niskie | dotyczy `tss-website`, nie Guidona |

---

## Wniosek Fazy 1

Sprzężenie z Supabase jest **płytsze, niż wygląda** — 6 plików, 5 importów,
storage w jednym miejscu, AI w ogóle nie istnieje. Adaptery z §24 są tanie.

Prawdziwym blokerem jest **kierunek przepływu danych**: przeglądarka →
PostgREST. Dopóki to się nie zmieni, self-hosting oznacza uruchomienie
całego Supabase, a nie „własnego PostgreSQL".

Dlatego kolejność z §29 wymaga jednej korekty: **Faza 3 (Docker) nie ma sensu
przed przeniesieniem dostępu do danych na serwer.** Zbudowanie
docker-compose wokół obecnej architektury utrwaliłoby zależność od
PostgREST — czyli dokładnie to, czemu §4 ma zapobiegać.

Proponowana kolejność:

1. **Etap 1 z zatwierdzonego planu** — Server Components + Server Actions
   (i tak zaplanowane, teraz okazuje się warunkiem koniecznym)
2. `StorageProvider` — najtańszy, całkowicie izolowany
3. `000_baseline` + runner migracji
4. `AIProvider` — zielone pole
5. Docker Compose + health check — dopiero gdy 1–3 są gotowe
