# Logowanie przez Google i GitHub

Guidon obsługuje te logowania w kodzie. W trybie Supabase trzeba skonfigurować
klientów OAuth u dostawców, zapisać ich dane w Supabase i dopiero potem włączyć
przyciski w aplikacji. Nie wymaga to tworzenia drugiego projektu Supabase.

## Dwa różne adresy powrotne

| Etap | Adres |
|---|---|
| Google/GitHub -> Supabase | `https://<project-ref>.supabase.co/auth/v1/callback` |
| Supabase -> Guidon | `https://useguidon.com/auth/callback` |
| Supabase -> lokalny Guidon | `http://localhost:5803/auth/callback` |

Callback dostawcy skopiuj z **Authentication -> Sign In / Providers** w swoim
projekcie Supabase. Dla obecnego projektu Guidona jest to:

```text
https://thtzaeeatjwyitifdcxb.supabase.co/auth/v1/callback
```

Adres `/api/github/callback` obsługuje integrację repozytoriów. Nie zastępuj go
w istniejącej aplikacji GitHub używanej do tej integracji. Dla logowania utwórz
osobną aplikację OAuth, np. **Guidon Sign-in**.

## Google

1. Otwórz [Google Cloud](https://console.cloud.google.com/). Pierwsze użycie
   konta może wymagać osobistej decyzji o akceptacji warunków Google Cloud.
2. Wybierz projekt należący do operatora Guidona albo utwórz właściwy projekt.
3. W **Google Auth Platform** skonfiguruj nazwę aplikacji, adres wsparcia,
   domenę `useguidon.com`, regulamin i politykę prywatności oraz odbiorców.
   W trybie **Testing** dodaj konta testowe. Sam zapis klienta nie oznacza,
   że aplikacja jest opublikowana dla wszystkich użytkowników.
4. W **Clients** utwórz klienta typu **Web application**.
5. W **Authorized redirect URIs** wpisz dokładny callback Supabase z tabeli.
   Nie wpisuj tam `/auth/callback` Guidona ani adresu integracji GitHub.
6. **Client ID** i **Client secret** zapisz bezpośrednio w ustawieniach
   dostawcy **Google** w Supabase. Następnie włącz dostawcę i zapisz.

Wystarczą dane potrzebne do logowania: tożsamość, podstawowy profil i e-mail.
Dostęp do Dysku Google, poczty ani kalendarza nie jest potrzebny.

## GitHub

1. Otwórz [GitHub -> OAuth Apps](https://github.com/settings/developers).
   Sprawdź, kto jest właścicielem istniejących aplikacji i do czego służą.
2. Wybierz **New OAuth App** i przygotuj:
   - **Application name:** `Guidon Sign-in`;
   - **Homepage URL:** `https://useguidon.com`;
   - **Authorization callback URL / Redirect URI:** dokładny callback Supabase;
   - dopasowanie callbacku bez wildcardów; Device Flow nie jest potrzebny.
3. Zarejestruj aplikację i utwórz jej sekret. Sekret pokaże się tylko podczas
   tworzenia, więc zapisz go bezpośrednio w przeznaczonym do tego panelu.
4. W Supabase otwórz dostawcę **GitHub**, zapisz **Client ID** i **Client
   secret**, włącz dostawcę i zapisz.

Logowanie nie wymaga uprawnień do repozytoriów. Klucze integracji GitHub App
Guidona i klucze logowania przez GitHub to osobne konfiguracje.

## Supabase -> URL Configuration

W **Authentication -> URL Configuration** ustaw:

- **Site URL:** `https://useguidon.com`;
- **Redirect URLs:** callbacki Guidona potrzebne w danym środowisku, w tym
  `https://useguidon.com/auth/callback` i lokalnie
  `http://localhost:5803/auth/callback`.

Kod przekazuje bezpieczny wewnętrzny cel w parametrze `redirect` callbacku.
Przy weryfikacji sprawdź pełny adres `redirectTo`, łącznie z tym parametrem,
przeciwko regułom dopuszczonych URL-i. Na produkcji używaj dokładnych reguł
potrzebnych dla callbacku, zamiast wildcarda obejmującego całą domenę.

Używaj konsekwentnie `localhost` podczas lokalnego logowania. Przejście między
`localhost` i `127.0.0.1` zmienia pochodzenie strony i miejsce zapisu cookies.

## Przyciski w Guidonie

Po potwierdzeniu, że obaj dostawcy są skonfigurowani w Supabase, ustaw:

```env
NEXT_PUBLIC_AUTH_PROVIDERS=google,github
```

Lokalnie jest to `.env.local`. Uruchom ponownie serwer. W hostingu ustaw
zmienną dla właściwego środowiska i przygotuj nowy build. Wdrożenie produkcyjne
jest osobnym krokiem wymagającym zgody operatora.

Ta zmienna zawiera tylko nazwy dostawców. Samo jej ustawienie nie konfiguruje
Google ani GitHuba. Bez niej Guidon celowo pokazuje logowanie hasłem.
Obsługiwane są też `discord` i `gitlab`, po ich osobnym skonfigurowaniu.

Sekretów OAuth nie wpisuj do `NEXT_PUBLIC_*`, repozytorium, dokumentacji,
zgłoszeń ani czatu. W trybie Supabase przechowuje je Supabase, a nie frontend.

## Weryfikacja

Sprawdź osobno Google i GitHub, najpierw na koncie przeznaczonym do testów:

1. Dostawca jest włączony w Supabase i ma właściwy Client ID oraz sekret.
2. `/auth/login` oraz `/auth/signup` pokazują właściwy przycisk.
3. Kliknięcie prowadzi do właściwego dostawcy z callbackiem Supabase.
4. Po zgodzie użytkownika powrót do `/auth/callback` zapisuje sesję i prowadzi
   na żądaną stronę Guidona. Odświeżenie strony zachowuje sesję.
5. Odmowa zgody pokazuje błąd; nie tworzy pozornej zalogowanej sesji.
6. Wylogowanie zamyka sesję. Powtórne logowanie działa również lokalnie.
7. Inne konto nie otrzymuje dostępu do prywatnych projektów poprzedniego.

Zielone testy PKCE, state i callbacków nie zastępują konfiguracji klientów ani
potwierdzenia prawdziwego przebiegu u zewnętrznych dostawców.

## Tożsamości i istniejące konta

Supabase automatycznie łączy tożsamości o tym samym adresie e-mail zgodnie ze
swoimi regułami bezpieczeństwa. Nie trzeba włączać wymyślonego ustawienia
"Allow linking accounts with the same email". Różne adresy mogą oznaczać różne
konta. Sprawdź istniejące konto przy włączeniu drugiego dostawcy i zachowaj
weryfikację adresu e-mail.

## Self-hosted

Gdy ustawiono `DATABASE_URL`, Guidon korzysta z własnego klienta OAuth/OIDC,
a nie z Supabase Auth. Callback ma wtedy inną postać:

```text
<APP_URL>/auth/oauth/<google|github|discord|gitlab|oidc>/callback
```

Ustawienia serwerowe to `GOOGLE_CLIENT_ID/SECRET`,
`GITHUB_OAUTH_CLIENT_ID/SECRET`, `DISCORD_OAUTH_CLIENT_ID/SECRET`,
`GITLAB_CLIENT_ID/SECRET` oraz opcjonalnie `GITLAB_URL`. Dostawca OIDC używa
`OIDC_ISSUER`, `OIDC_CLIENT_ID/SECRET` i `OIDC_NAME`. Szczegóły są w
[configuration.md](configuration.md). Akceptowany jest tylko zweryfikowany
e-mail. Opcjonalny dostawca Two Steps Studio może korzystać z tego samego
mechanizmu OIDC; nie jest warunkiem działania własnej instalacji Guidona.

## Dokumentacja dostawców

- [Supabase: Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
- [Supabase: GitHub](https://supabase.com/docs/guides/auth/social-sign-in/auth-github)
- [Supabase: redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase: identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
