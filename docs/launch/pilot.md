# Pilot z 3–5 testerami

Guidon task `616a71da`. Cel: przed publikacją (`docs/launch/launch-plan.md`)
sprawdzić na ludziach jedną rzecz: **czy nowa osoba sama dojdzie od strony
głównej do pierwszego zadania, które jej agent oddał do Review**. Jeśli nie
dojdzie, poprawiamy onboarding, a nie dokładamy funkcji.

## Kogo zaprosić

- 3–5 osób, które **już pracują z Claude Code, Codex albo Cursor** i mają
  własne repozytorium (może być małe).
- Najlepiej osoby, które znasz: znajomi programiści, ktoś ze szkoły lub koła
  informatycznego, ktoś z Discorda, z kim już rozmawiałeś.
- Nikt, kto widział Guidona wcześniej. On już wie, gdzie co jest, więc nie
  sprawdzi onboardingu.

**Bezpieczeństwo:** sesja odbywa się zdalnie (rozmowa głosowa z
udostępnianiem ekranu) albo na żywo w znanym miejscu. Nie zbieramy danych
osobowych poza tym, co tester sam wpisze przy rejestracji. Nagrywamy ekran
tylko za wyraźną zgodą testera. Konto testowe można potem usunąć
(Profil → Delete account).

### Zaproszenie (do wklejenia)

> Hej, robię narzędzie, w którym agent AI (Claude Code / Codex / Cursor) sam
> bierze zadania z tablicy i zna kontekst projektu. Szukam 3–5 osób na 30
> minut: zakładasz konto, podłączasz swojego agenta i dajesz mu jedno
> zadanie, a ja patrzę, gdzie się gubisz. Twoje repo, Twój agent, nic nie
> instaluję u Ciebie poza konfiguracją MCP, którą potem możesz usunąć.
> Masz czas w tym tygodniu?

## Przebieg sesji (ok. 30 min)

Prowadzący **nic nie podpowiada**. Jeśli tester utknie na dłużej niż 2
minuty, zapisz gdzie i dopiero wtedy pomóż. Notuj czasy od startu sesji.

| # | Zadanie dla testera (powiedz dokładnie tak) | Sukces, gdy | Zapisz |
|---|---|---|---|
| 1 | „Otwórz useguidon.com. Masz 10 sekund. Co to jest i dla kogo?” | Mówi własnymi słowami coś w stylu „tablica zadań dla zespołu, do której można podpiąć AI” | Dokładne słowa testera |
| 2 | „Załóż konto i projekt, w którym chciałbyś, żeby Twój agent coś zrobił.” | Jest na tablicy projektu | Czas; gdzie się zatrzymał |
| 3 | „Podłącz swojego agenta.” | Okno pokazuje „Connected” | Czas; którą aplikację wybrał; czy instrukcja zadziałała za pierwszym razem |
| 4 | „Daj agentowi pierwsze zadanie i poczekaj, aż skończy.” | Zadanie jest w Review z komentarzem agenta | Czas od rejestracji; czy użył zadań startowych; czy agent zajrzał do kontekstu |
| 5 | „Sprawdź, co agent zrobił, i zdecyduj, czy jest gotowe.” | Otwiera zadanie, czyta komentarz i próbę, przenosi do Done albo z powrotem | Czy zrozumiał, co widzi |
| 6 | „Odbierz agentowi dostęp.” | Klucz unieważniony (Profil → API keys albo okno Connect) | Czas; czy znalazł sam |
| 7 | Na telefonie: „Zaloguj się i sprawdź, co jest w Review.” | Widzi zadanie i komentarz | Co było niewygodne |

## Pytania na koniec (5 min)

1. Co było najbardziej mylące?
2. Jedno słowo albo zdanie: jak opisałbyś Guidona koledze?
3. Czy użyłbyś tego jutro w swoim projekcie? Dlaczego tak lub nie?
4. Czego zabrakło, żeby agent zrobił zadanie lepiej?

Odpowiedź na pytanie 4 to pomysł: zapisujemy go do Backlogu, nie
implementujemy od razu (zasada fokusu).

## Wyniki

Zapisuj w Guidonie: jeden komentarz w zadaniu `616a71da` na testera, w tym
formacie.

```
Tester: A (Claude Code), sesja 2026-11-xx
1. Landing (10 s): "..."                      ok / nie
2. Konto + projekt: 3:10                      ok
3. Connect: 7:45, Claude Code, za 1. razem    ok
4. Pierwsze zadanie w Review: 14:20           ok  (zadania startowe: tak)
5. Review: zrozumiał                          ok
6. Revoke: 1:30, znalazł sam                  ok
7. Telefon: ...                               ok
Najbardziej mylące: ...
Opis własnymi słowami: ...
Użyłby jutro: tak/nie, bo ...
Pomysły: ... (→ Backlog)
```

## Decyzja go / no-go

Publikujemy (`5020258d`) tylko wtedy, gdy:
- **co najmniej 3 z 5** testerów doszło do kroku 4 samodzielnie (najwyżej
  jedna podpowiedź) w **mniej niż 15 minut** od rejestracji;
- **co najmniej 3 z 5** opisało Guidona po 10 sekundach zgodnie z obietnicą;
- nikt nie miał problemu z bezpieczeństwem (np. klucz widoczny tam, gdzie
  nie powinien, albo nie dało się odebrać dostępu).

Wszystko, co zatrzymało więcej niż jedną osobę, to zadanie **P0** w Todo
przed publikacją. Pojedyncze potknięcia to P1. Pomysły idą do Backlogu.

## Co już sprawdzają automaty (nie powtarzamy w pilocie)

- Rejestracja, logowanie, onboarding, tablica, telefon i dostępność: E2E w
  3 przeglądarkach na każdym PR.
- Connect → prawdziwe wywołanie MCP → „Connected” → revoke → 401:
  `tests/e2e/agent-onboarding.mjs`.
- Pętla agenta: kontekst, próba, linki, review, pamięć i panel „Why”:
  `tests/e2e/agent-loop.mjs`.

Pilot sprawdza to, czego automat nie umie: **czy człowiek rozumie, co
widzi, i czy chce tego używać.**
