# Środowisko testowe do zamknięcia bramek premiery

To instrukcja przygotowania, nie potwierdzenie wykonanych testów ani zgoda na
wdrożenie. Dotyczy pozostałych kart QA Auth, API/MCP, Stripe i release gate.

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
