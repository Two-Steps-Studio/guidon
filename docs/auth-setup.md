# Logowanie przez Google i Discord — konfiguracja

Kod jest gotowy w obu aplikacjach. Poniższe kroki trzeba wykonać **poza
repozytorium**: klucze powstają w Google Cloud, Discordzie i panelu Supabase.

Dwa osobne projekty Supabase = dwie osobne konfiguracje:

| Aplikacja | Projekt Supabase | Adres produkcyjny |
|---|---|---|
| tss-website | `zkwkfh…` | (domena TSS) |
| Guidon | `thtzae…` | (domena Guidona) |

Jedną aplikację Google/Discord można współdzielić — wystarczy dopisać oba
adresy przekierowania.

---

## 1. Adres przekierowania Supabase

Dla każdego projektu Supabase adres callbacku ma postać:

```
https://<ref>.supabase.co/auth/v1/callback
```

czyli konkretnie:

```
https://zkwkfhdyqwotijjhsegj.supabase.co/auth/v1/callback     # TSS
https://thtzaeeatjwyitifdcxb.supabase.co/auth/v1/callback     # Guidon
```

To ten adres wpisuje się u Google i Discorda — **nie** adres aplikacji.
Supabase dopiero potem odsyła użytkownika na `/auth/callback` w aplikacji.

---

## 2. Google

1. [Google Cloud Console](https://console.cloud.google.com/) → utwórz projekt
   (albo użyj istniejącego).
2. **APIs & Services → OAuth consent screen** — typ *External*, uzupełnij
   nazwę aplikacji, e-mail kontaktowy i domenę.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: oba adresy z punktu 1
4. Skopiuj **Client ID** i **Client secret**.
5. Supabase → **Authentication → Providers → Google** → włącz, wklej klucze,
   zapisz. Powtórz w drugim projekcie.

---

## 3. Discord

1. [Discord Developer Portal](https://discord.com/developers/applications) →
   **New Application**.
2. **OAuth2 → Redirects** → dodaj oba adresy z punktu 1.
3. Skopiuj **Client ID** i **Client Secret** (zakładka OAuth2).
4. Supabase → **Authentication → Providers → Discord** → włącz, wklej klucze,
   zapisz. Powtórz w drugim projekcie.

---

## 4. Adresy powrotne aplikacji

Supabase → **Authentication → URL Configuration**:

- **Site URL** — adres produkcyjny aplikacji
- **Redirect URLs** — dopisz oba:
  ```
  http://localhost:3000/auth/callback
  https://<domena-produkcyjna>/auth/callback
  ```

Bez wpisu dla `localhost` logowanie nie zadziała w trakcie developmentu.

---

## 5. Włączenie przycisków

Dopiero **po** skonfigurowaniu providerów w Supabase dopisz w `.env.local`:

```env
NEXT_PUBLIC_AUTH_PROVIDERS=google,discord
```

Przyciski pojawiają się wyłącznie dla wymienionych providerów. Instalacja
bez tej zmiennej zostaje przy logowaniu hasłem — celowo, żeby nie pokazywać
przycisku, który po kliknięciu zwróci błąd.

---

## 6. Weryfikacja

1. `npm run dev`
2. `/auth/login` — przyciski Google i Discord widoczne
3. Kliknięcie przenosi do providera, zgoda wraca na `/auth/callback`,
   a stamtąd na `/dashboard`
4. W Supabase → **Authentication → Users** pojawia się konto z odpowiednim
   providerem

Gdy coś pójdzie nie tak, błąd wraca na `/auth/login?error=…` zamiast pustego
ekranu — komunikat providera jest przekazywany wprost.

---

## Uwaga o kontach

Google i Discord to w Supabase **osobne tożsamości**. Zalogowanie się raz
Google'em, a raz Discordem na ten sam adres e-mail utworzy dwa konta, chyba
że w Supabase włączysz **Authentication → Providers → Allow linking accounts
with the same email**. Warto to rozważyć przed uruchomieniem produkcyjnym —
później scalanie kont jest znacznie trudniejsze.

---

## „Zaloguj przez Two Steps Studio"

To **nie** jest provider Supabase, tylko własny przepływ Guidona. Nie jest
jeszcze zaimplementowany — `tss` na liście providerów kieruje na
`/auth/tss`, której na razie nie ma.

Wymaga zbudowania w tss-website punktu autoryzacji, który wystawi Guidonowi
podpisany token tożsamości. Projekt tego przepływu jest osobnym krokiem;
patrz `docs/self-hosting-audit.md` i TODO.md §1 — self-hosted Guidon nie może
od TSS zależeć, więc ta metoda zawsze musi być jedną z kilku, nigdy jedyną.
