# Konta do publikacji SDK i CLI

## Jednorazowa konfiguracja właściciela

1. Załóż [konto npm](https://www.npmjs.com/signup) oraz [konto PyPI](https://pypi.org/account/register/). Użyj adresu e-mail, do którego masz stały dostęp. Osoba zakładająca konto musi być uprawniona do prowadzenia go i przyjęcia warunków usługi.
2. Potwierdź oba adresy e-mail. Włącz uwierzytelnianie dwuskładnikowe zgodnie z instrukcjami usług. Zapisz kody odzyskiwania w swoim menedżerze haseł. Haseł, tokenów i kodów odzyskiwania nie wysyłaj w czacie ani nie dodawaj do repozytorium.
3. Na npm sprawdź możliwość utworzenia lub uzyskania dostępu do organizacji `guidon`. Jest niezależna od organizacji GitHub. Potrzebujemy uprawnień do `@guidon/sdk` oraz `guidon-cli`. Nie zmieniaj nazw paczek i nie wykupuj planu automatycznie, jeśli nazwa lub uprawnienia okażą się niedostępne.
4. Na PyPI przygotuj zaufanego wydawcę dla projektu `guidon-sdk` zgodnie z instrukcją poniżej. Nazwa projektu może być zajęta mimo wcześniejszej odpowiedzi 404 - dopiero rejestr potwierdza możliwość publikacji.

## Co potem przekazać

Wystarczą nazwy kont npm i PyPI oraz informacja, czy masz uprawnienia do organizacji npm `guidon`. Nie przekazuj danych logowania. Pełna instrukcja ustawień GitHub, pierwszej publikacji npm i zaufanego wydawcy PyPI jest w [package-publishing.md](../package-publishing.md).

Pakiety są przygotowane: `@guidon/sdk@0.1.0`, `guidon-cli@0.1.0`, `guidon-sdk==0.1.0`. Wszystkie trzy używają MIT. CLI wymaga wcześniejszej publikacji SDK JavaScript. Sama konfiguracja konta ani połączenie PR nie publikuje pakietów; wydanie uruchamia się osobno z `main`, po przejściu walidacji archiwów.

Przy tworzeniu pierwszych kont trzeba samodzielnie wykonać kroki wymagające hasła, weryfikacji e-maila, ewentualnego CAPTCHA i 2FA. Nie twórz kont na przypadkowych adresach i nie używaj danych innej osoby bez uprawnienia.
