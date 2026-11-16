# Onboarding: wytyczne dla aplikacji mobilnej

Wersja 1, 2026-11-16. Metoda pochodzi z poradnika „Your onboarding, screen by
screen” (@app.launchpad / buildercult). Z poradnika bierzemy tylko metodę:
arkusz i cztery zasady. Produkty z niego nie są nam potrzebne.

Większość nowych osób nie wraca następnego dnia. Onboarding to więc często
wszystko, co ktoś zobaczy w Guidonie. Każdy ekran przed pierwszym efektem
musi na siebie zarobić.

**Pierwszy efekt w Guidonie** (z `docs/strategy/ideal-customer-profile.md`):
ktoś bierze zadanie i od razu widzi przy nim kontekst, czyli opis, decyzję i
wcześniejsze próby. Ewentualnie agent bierze zadanie z tym samym kontekstem.

## 1. Arkusz: co dostali?

Załóż nowe konto. Przejdź każdy ekran, aż aplikacja naprawdę coś dla Ciebie
zrobi. Pod każdym ekranem zapisz, co użytkownik dostał, a o co go prosimy.
Każdy ekran wysyła **jedno zdarzenie**. W danych szukamy największego spadku
i poprawiamy tylko ten ekran. Ekran, przy którym w kolumnie „Dostaje” stoi
„nic”, przesuwamy później albo usuwamy.

### Stan obecny aplikacji mobilnej

| # | Ekran | Dostaje | Prosimy o | Zdarzenie |
|---|---|---|---|---|
| 1 | Logowanie (`app/sign-in.tsx`): hasło i przycisk „Zaloguj” | nic | konto, przeglądarkę systemową | `mobile_onboarding_step_viewed {step: "sign_in"}` |
| 2 | Logowanie w przeglądarce (PKCE, `/auth/mobile-login`) | nic | hasło albo OAuth, potem „Zezwól” | `mobile_sign_in_completed` |
| 3 | Lista projektów (`app/index.tsx`) | swoje projekty, **o ile już je ma** | nic | `mobile_onboarding_step_viewed {step: "projects"}` |
| 3a | Pusty stan „Brak projektów” | nic | nic, ale też nic nie proponuje | ten sam, z `empty: true` |
| 4 | Tablica projektu | swoje zadania | nic | `mobile_onboarding_step_viewed {step: "board"}` |
| 5 | Szczegóły zadania | **pierwszy efekt:** opis, komentarze, kontekst | nic | `mobile_first_value {via: "task_opened"}` |

Największe ryzyko to ekran 3a. Nowa osoba, która zaczyna od telefonu, loguje
się i trafia na pusty ekran bez żadnej propozycji.

### Dla porównania: strona (stan po zmianach z 2026-11-16)

| # | Ekran | Dostaje | Prosimy o | Zdarzenie (PostHog, tylko za zgodą) |
|---|---|---|---|---|
| 1 | Strona główna: „Weź każde zadanie bez dopytywania.” | obietnicę efektu | kliknięcie | licznik CTA (`/api/funnel/cta`) |
| 2 | `/start`: nazwa projektu | nic | nazwę (studio opcjonalnie) | `onboarding_step_viewed {step: "name"}` |
| 3 | Typ projektu | **zmienia** szablon: sekcje i etykiety | 1 kliknięcie (można pominąć) | `… {step: "type"}` |
| 4 | Sposób pracy | **zmienia** moduły | 1 kliknięcie (można pominąć) | `… {step: "workflow"}` |
| 5 | Zespół | **zmienia** panel powitalny: solo zaczyna od agenta, zespół od zaproszeń | 1 kliknięcie (można pominąć) | `… {step: "team"}` |
| 6 | Konto | podsumowanie | konto | `… {step: "account"}` |
| 7 | Tablica z panelem powitalnym | gotowy projekt i pierwszy krok dopasowany do odpowiedzi | nic | `onboarding_completed`, `onboarding_step_viewed {step: "welcome"}`, `onboarding_welcome_action {action}` |

Ze strony usunięto pytanie o styl tablicy (scrum), bo zmieniało tylko plakietkę.
Odpowiedź o zespole wcześniej nic nie zmieniała, teraz ustawia panel powitalny.

## 2. Cztery zasady na każdym ekranie

### Zasada 1: pierwszy ekran sprzedaje efekt
Nie pisz „Witaj w Guidonie”. Pokaż, jak wygląda praca po: bierzesz zadanie i
od razu wiesz, co już ustalono i co nie zadziałało.
- **Teraz:** ekran logowania ma hasło „Zadania i tablice dla zespołów
  tworzących gry i oprogramowanie”. To opis produktu, a nie efekt.
- **Do zrobienia:** nad przyciskiem logowania daj ten sam komunikat co na
  stronie, „Weź każde zadanie bez dopytywania.”, oraz jeden obrazek: karta
  zadania z decyzją i wcześniejszą próbą. Bez karuzeli trzech ekranów.

### Zasada 2: najpierw daj, potem proś
Duolingo prosi o konto dopiero po około 16 ekranach. Granola zadaje 2 pytania.
Oba podejścia działają, bo zanim padnie prośba, użytkownik już coś dostał.
- **Teraz:** aplikacja prosi o konto na pierwszym ekranie, zanim cokolwiek pokaże.
- **Do zrobienia (do wyboru, od najtańszego):**
  1. Link „Zobacz przykład” na ekranie logowania otwiera tylko do odczytu
     tablicę przykładową, tę samą, co `/sandbox` na stronie, bez konta.
  2. Pusty stan (3a) daje coś od razu: przycisk „Utwórz pierwszy projekt”
     (to samo co `/start`, ale w aplikacji: nazwa i typ, reszta domyślnie)
     albo „Dołącz kodem zaproszenia”.
- **Uprawnienia systemowe** (powiadomienia, aparat) **nigdy na starcie.**
  O powiadomienia pytaj dopiero wtedy, gdy mają sens. Na przykład po tym,
  jak ktoś przypisze komuś pierwsze zadanie: „Dać znać, gdy ktoś Ci przypisze
  zadanie?”. W przykładzie z poradnika samo pytanie o powiadomienia zabrało
  9 osób na 100.

### Zasada 3: każde pytanie coś zmienia
Jeśli zadasz 6 pytań, a każdy i tak dostanie ten sam ekran główny, zmarnowałeś
ich czas.
- Na telefonie zadawaj **najwyżej 2 pytania**: nazwa projektu i typ (typ
  ustawia szablon). Wszystko inne bierz z ustawień domyślnych, tak jak na
  stronie robi przycisk „Pomiń - ustawię później”.
- Zanim dodasz pytanie, zapisz w PR, **co konkretnie zmienia odpowiedź**. Jeśli
  nic, pytania nie dodajemy.
- Jeśli ktoś przeszedł `/start` na stronie, aplikacja **nie pyta drugi raz**,
  bo projekt już istnieje.

### Zasada 4: płatność zaraz po pierwszym sukcesie
Nie wcześniej, zanim ktoś cokolwiek poczuł, i nie 3 dni później.
- **Teraz:** płatności nie są jeszcze uruchomione, a aplikacja mobilna nie
  pokazuje cen. Tak zostaje, dopóki nie zapadnie decyzja o płatnościach
  (z rodzicem: Stripe, Whop albo zakupy w aplikacji).
- **Na później:** Apple i Google mają własne zasady dla subskrypcji kupowanych
  w aplikacji. Przed dodaniem jakiejkolwiek ceny w aplikacji trzeba je
  sprawdzić w aktualnych wytycznych sklepów. Płatność pojawia się dopiero po
  pierwszym efekcie, czyli po pierwszym zadaniu wziętym z kontekstem.

## 3. Zasady techniczne dla aplikacji mobilnej

- **Zdarzenia:** jedno na ekran onboardingu, z prefiksem `mobile_`, żeby dało
  się je porównać ze stroną. Bez nazw projektów, e-maili i treści zadań, tylko
  kroki i wybory (np. `project_type`). Wysyłamy je dopiero po zgodzie na
  analitykę, tak jak na stronie (`src/lib/analytics-consent.ts`).
- **Ciągłość:** odpowiedzi zapamiętujemy w trakcie (SecureStore albo
  AsyncStorage), żeby powrót z przeglądarki logowania niczego nie zgubił. Na
  stronie robi to `localStorage` w `src/lib/onboarding.ts`.
- **Logowanie** zostaje w przeglądarce systemowej (PKCE). Nie budujemy
  własnego formularza hasła w aplikacji.
- **Agent:** na telefonie nie podłączamy agenta (to robi się z komputera), ale
  w zadaniu pokazujemy, co agent zrobił: próby i komentarze. To też jest
  pierwszy efekt.
- **Dostępność:** każdy krok działa z VoiceOver i TalkBack, przyciski mają co
  najmniej 44 pt, a tekst skaluje się z ustawieniami systemu.

## 4. Lista przed wydaniem

- [ ] Arkusz z sekcji 1 uzupełniony dla nowej wersji (zrzut każdego ekranu do
      pierwszego efektu).
- [ ] Każdy ekran ma w kolumnie „Dostaje” coś innego niż „nic” albo uzasadnienie,
      dlaczego musi zostać.
- [ ] Jedno zdarzenie na ekran, sprawdzone w PostHog na koncie testowym.
- [ ] Żadnych uprawnień systemowych przed pierwszym efektem.
- [ ] Pusty stan proponuje następny krok.
- [ ] Najwyżej 2 pytania, a każde coś zmienia (zapisane w PR).
- [ ] Brak cen i płatności, dopóki nie zapadnie decyzja (zasada 4).

## Do sprawdzenia w danych

Po tygodniu z nowymi zdarzeniami odczytaj w PostHog lejek `onboarding_step_viewed`
(strona) i `mobile_onboarding_step_viewed` (aplikacja). Poprawiamy **tylko
ekran z największym spadkiem**, a potem mierzymy ponownie.
