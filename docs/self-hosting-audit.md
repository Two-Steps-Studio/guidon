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

### 1. Przeglądarka rozmawia bezpośrednio z PostgREST — blokada krytyczna

13 stron woła Supabase z przeglądarki. Architektura zakłada, że istnieje
**HTTP API zgodne z PostgREST, osiągalne z przeglądarki**, które tłumaczy
zapytania na SQL i egzekwuje RLS.

Na czystym PostgreSQL czegoś takiego nie ma.

To nie jest kwestia podmiany biblioteki. Dopóki dostęp do danych jest po
stronie klienta, self-hosting wymaga uruchomienia PostgREST + GoTrue — czyli
w praktyce całego self-hosted Supabase, wbrew §4 („nie zaszywaj zależności od
zarządzanego Supabase").

**Wniosek:** przeniesienie odczytów do Server Components i zapisów do Server
Actions nie jest opcjonalnym usprawnieniem — jest **warunkiem koniecznym**
self-hostingu na czystym Postgresie. To dokładnie Etap 1 zatwierdzonego już
planu. Oba cele zbiegają się w jednym zadaniu.

### 2. RLS opiera się na prymitywach Supabase

| Prymityw | Wystąpień |
|---|---|
| `auth.uid()` | 46 |
| `TO authenticated` | 97 |
| `auth.users` | 7 |
| `service_role` | 14 |
| `request.jwt.claims` | 1 |
| polityki RLS łącznie | 70 |

Na czystym Postgresie nie istnieje ani schemat `auth`, ani role `anon` /
`authenticated` / `service_role`, ani GUC `request.jwt.claims` (ustawia go
PostgREST).

**Nie oznacza to jednak konieczności przepisania 70 polityk.** Wszystkie te
elementy da się odtworzyć jako warstwę zgodności:

* role `anon`, `authenticated`, `service_role` — zwykłe `CREATE ROLE`
* `auth.uid()` — funkcja czytająca GUC ustawiany przez aplikację na transakcję
* `auth.users` — lokalna tabela użytkowników
* `request.jwt.claims` — `SET LOCAL` w opakowaniu dostępu do bazy

Warunkiem jest jednak punkt 1: GUC może ustawiać tylko kod serwerowy.

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
