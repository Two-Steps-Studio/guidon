# Środowisko testowe do zamknięcia bramek premiery

To instrukcja przygotowania, nie potwierdzenie wykonanych testów ani zgoda na
wdrożenie. Dotyczy pozostałych kart QA Auth, API/MCP, Stripe i release gate.

## Szybka ścieżka dla właściciela

Nie masz jeszcze stagingu. Poniższe kroki opisują jego przygotowanie; nic nie
zostało utworzone ani wdrożone. Przed utworzeniem projektu sprawdź koszt wybranego
planu. Używaj wyłącznie fikcyjnych kont, plików i organizacji.

### A. Supabase

1. W panelu Supabase wybierz **New project**, nazwij go `guidon-staging` i wybierz
   region odpowiedni dla testowej aplikacji. Zapisz project ref i właściciela.
   Hasło bazy zachowaj w menedżerze haseł. Nie kopiuj danych produkcyjnych.
2. Z ustawień projektu skopiuj do magazynu sekretów stagingu URL projektu,
   klucz publiczny i klucz serwerowy. Guidon używa nazw podanych w tabeli niżej.
   Klucz serwerowy nigdy nie może mieć prefiksu `NEXT_PUBLIC_`.
3. Z **Connect** pobierz adres połączenia PostgreSQL dla osobnego procesu
   migracji. Uruchom najpierw `node scripts/migrate.mjs --status`, potem
   `node scripts/migrate.mjs --dry-run`, z `DATABASE_URL` wskazującym staging.
   Dopiero po sprawdzeniu hosta i listy wykonaj `node scripts/migrate.mjs`.
   Ponowny `--status` ma pokazać zastosowane migracje bez błędów sum kontrolnych.
   Repo używa historii `guidon_migrations`; sam widok migracji Supabase CLI
   nie zastępuje tej historii. Nie używaj resetu bazy ani ręcznego oznaczania
   niewykonanych migracji jako zastosowanych.
4. W **Authentication → URL Configuration** ustaw Site URL na finalny adres
   HTTPS stagingu i dodaj dokładny adres `<staging-origin>/auth/callback`.
   Sprawdź również recovery `/auth/reset-password/verify` i dozwolone adresy
   używane przez providerów. Nie dodawaj produkcyjnego origin ani szerokich
   wildcardów. Potwierdzanie e-maili pozostaw w trybie docelowym dla premiery.
5. W **Authentication → Signing Keys** sprawdź zgodność kluczy z aplikacją.
   Obecne API Guidon Cloud samodzielnie podpisuje krótki JWT przez HS256
   (`src/lib/api/api-key-auth.ts`, `SUPABASE_JWT_SECRET`). Nie zakładaj, że nowy
   projekt z kluczami asymetrycznymi przyjmie taki token. Nie cofaj ustawień
   bezpieczeństwa ani nie używaj service role zamiast uprawnień użytkownika.
   Zgodność PostgREST/RLS jest osobną bramką przed testami API/MCP; w razie
   braku zgodności trzeba dostosować implementację podpisywania.

Supabase opisuje nowe klucze podpisujące i starszy współdzielony sekret w
[JWT Signing Keys](https://supabase.com/docs/guides/auth/signing-keys).

### B. Konfiguracja aplikacji

Przygotuj osobny projekt wdrożenia lub izolowane środowisko z konfiguracją
przypisaną wyłącznie do stagingu. Na Vercel sprawdź zakres każdej zmiennej
(Preview / właściwa gałąź); nie nadpisuj Production. Samo przygotowanie
konfiguracji nie jest zgodą na wdrożenie.

| Ustawienie | Wartość dla stagingu |
|---|---|
| `APP_URL`, `NEXT_PUBLIC_APP_URL` | Ten sam stały origin HTTPS stagingu, bez ścieżki; bez przekierowania na produkcję |
| `NEXT_PUBLIC_SUPABASE_URL` | URL nowego projektu staging |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publiczny klucz wyłącznie stagingu, zgodny z używanym klientem Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Serwerowy klucz stagingu; nigdy w przeglądarce |
| `SUPABASE_JWT_SECRET` | Tylko jeśli zweryfikowano zgodność obecnego mechanizmu API/RLS z projektem; nie jest to API key ani klucz Stripe |
| `AUTH_SECRET` | Nowy, losowy sekret stagingu, inny niż produkcyjny |
| `STORAGE_PROVIDER` | `supabase`; buckety i polityki z konfiguracji repo, wyłącznie testowe pliki |
| `ADMIN_EMAILS` | Wyłącznie wskazane konta testerów stagingu |
| `NEXT_PUBLIC_AUTH_PROVIDERS` | Tylko providery skonfigurowane w testowym Supabase i ich testowych aplikacjach |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Osobny transport/nadawca ograniczony do kontrolowanych skrzynek testerów |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Wyłącznie klucz i podpis endpointu z wybranego sandboxu |
| `DATABASE_URL` w aplikacji Cloud | **Nie ustawiaj**; używaj jedynie w osobnym procesie migracji |

Pełne znaczenie zmiennych: [konfiguracja](../configuration.md). Zmienne
`NEXT_PUBLIC_*` są wbudowywane w klienta, więc ich zmiana wymaga nowego buildu.
Nie kopiuj produkcyjnych integracji GitHub, webhooków, AI i monitoringu;
pozostaw je wyłączone albo użyj odrębnych zasobów testowych.

Reset hasła używa Resend REST. Do czasu przygotowania bezpiecznego odbioru
wiadomości testy wysyłki pozostają zablokowane. SMTP ustawiony w Supabase
dotyczy jego własnych wiadomości i nie przechwytuje resetu wysyłanego przez Guidon.

### C. Stripe

1. W selektorze konta Stripe otwórz **Sandboxes**, utwórz osobny sandbox
   `Guidon staging` i upewnij się, że jesteś w nim przed każdą zmianą.
   [Stripe opisuje izolację sandboxów](https://docs.stripe.com/sandboxes).
2. W tym sandboxie utwórz produkty i cykliczne ceny dla Pro, Team i Business.
   Dopasuj walutę oraz okres do aplikacji. Enterprise pozostaje ofertą kontaktową.
3. Wpisz identyfikatory `price_...` wyłącznie do tabel stagingu: miesięczne
   do `plans.stripe_price_id`, dodatkowe okresy do `plan_prices` zgodnie z
   [konfiguracją billing](../configuration.md#billing-guidon-cloud-only).
   Nie przenoś identyfikatorów cen między sandboxem a produkcją.
4. Dodaj endpoint zdarzeń `<staging-origin>/api/stripe/webhook` dla
   `customer.subscription.created`, `customer.subscription.updated` i
   `customer.subscription.deleted`. Jego sekret podpisu wpisz jako
   `STRIPE_WEBHOOK_SECRET`; nie pomyl go z kluczem API.
5. Skonfiguruj testowy Customer Portal i sprawdź powrót na staging.
   Checkout uruchamiaj z aplikacji jako właściciel testowej organizacji.
   Korzystaj wyłącznie z [kart testowych Stripe](https://docs.stripe.com/testing).

### D. Co zapisać po przygotowaniu

- URL stagingu, project ref Supabase, nazwa sandboxu Stripe i commit aplikacji.
- Wynik statusu migracji oraz datę konfiguracji; bez connection stringów i kluczy.
- Adresy kontrolowanych skrzynek testerów i osobę odbierającą alerty.
- Wyniki scenariuszy poniżej. Samo utworzenie zasobów nie zamyka QA.

Nie wklejaj sekretów do czatu. Po przygotowaniu wystarczą nazwy środowisk
i URL stagingu, aby zaplanować weryfikację. Produkcja pozostaje oddzielną decyzją.

## 1. Oddzielne dane i konfiguracja

- Wskaż osobny projekt Supabase lub odizolowaną gałąź testową, bez danych
  klientów i kluczy produkcyjnych. Zapisz identyfikator, właściciela i adres
  testowej aplikacji. Oddzielenie środowisk opisuje
  [dokumentacja Supabase](https://supabase.com/docs/guides/deployment/managing-environments).
- Najpierw sprawdź historię i sumy migracji istniejącym runnerem:
  `node scripts/migrate.mjs --status`. Połączenie ma wskazywać wyłącznie testową
  bazę. Samo obejrzenie statusu nie nakłada migracji; ich wykonanie wymaga osobnej
  decyzji dla wskazanego środowiska. Nie resetuj istniejącej bazy.
- `DATABASE_URL` służy runnerowi w osobnym procesie. **Nie ustawiaj go w procesie
  aplikacji testującej Cloud**, bo Guidon przełączy wtedy Auth i dane na tryb
  bezpośredniego PostgreSQL. Taki test nie sprawdzi Supabase Auth/PostgREST.
- Cloud potrzebuje testowych `NEXT_PUBLIC_SUPABASE_URL`, publicznego klucza oraz
  serwerowych kluczy zgodnych z `.env.example`. Sekrety dodaje się w bezpiecznym
  magazynie konfiguracji; nie w komentarzu zadania, logu ani publicznym bundlu.
- `APP_URL` i `NEXT_PUBLIC_APP_URL` mają wskazywać właściwe testowe origin HTTPS.
  Discovery OAuth i odpowiedzi autoryzacji muszą używać tego samego issuer.
  Skonfiguruj dokładne callbacki w testowych providerach; zachowaj walidację
  issuer, state, nonce i PKCE.

## 2. Auth i wiadomości

- Ustal tryb potwierdzania adresów oraz Site URL / Redirect URLs w testowym
  projekcie. [Supabase opisuje oba warianty rejestracji i redirectów](https://supabase.com/docs/guides/auth/passwords).
- Przygotuj skrzynkę przechwytującą lub bezpieczny fixture transportu wiadomości.
  Obecny reset Guidona generuje link przez Supabase i wysyła go przez Resend;
  sam lokalny SMTP nie przechwyci automatycznie tego wywołania REST.
- Dopiero po odizolowaniu transportu: poprawne/błędne logowanie, potwierdzenie
  konta, reset, wygasły i ponownie użyty link, logout, role i drugi tenant.
  Linki recovery i tokeny nie powinny trafiać do publicznych artefaktów testów.

## 3. Stripe i operacje

- Osobny Stripe sandbox, klucze testowe, ceny i endpoint webhooka dla testowej
  aplikacji. Żadnych prawdziwych kart ani opłat. Takie środowiska i wartości
  testowe opisuje [Stripe](https://docs.stripe.com/testing).
- Sprawdź checkout, odrzucenie/SCA, subskrypcję, anulowanie, trial, ponowienie
  i zmianę kolejności webhooków. Zachowaj identyfikatory testowych zdarzeń,
  oczekiwany wynik w bazie i dowód poprawnej weryfikacji podpisu.
- Wykonaj odtworzenie testowej kopii do oddzielnej bazy oraz odczyt aplikacją.
  Zapisz czas i wynik, zgodność migracji, procedurę cofnięcia i odbiór alertu.

## 4. Dowód i decyzja

W kartach zapisz commit, środowisko bez sekretów, wynik każdego scenariusza,
zredagowane artefakty, wykryte błędy i ponowny test po poprawce. Zielone lokalne
E2E są odrębnym dowodem. Produkcja wymaga zamkniętych krytycznych usterek,
aktualnej decyzji go/no-go i zgody właściciela na wdrożenie.

Przegląd źródeł: 2026-10-24. Bieżący
[changelog Supabase](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)
zapowiada usunięcie części starszych szyfrów CBC TLS 1.2 najwcześniej 2026-11-10;
przy testach starszych klientów wtyczek sprawdź obsługę aktualnego TLS, zamiast
osłabiać konfigurację serwera. Nie dotyczy to bezpośrednich połączeń PostgreSQL.
