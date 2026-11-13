# Idealny klient Guidona (ICP)

Wersja 1, 2026-11-13. To są **hipotezy do sprawdzenia w rozmowach**, a nie
wyniki badań. Każde twierdzenie ma podane źródło. Tam, gdzie go nie ma,
jest oznaczone jako założenie.

## Jednym zdaniem

**Mały zespół robiący gry albo oprogramowanie (2–15 osób), który dzieli
pracę między ludzi i agentów AI i ciągle traci czas na odtwarzanie
kontekstu: dlaczego coś zrobiono i co już nie zadziałało.**

## Bolesny problem

> Ktoś – nowa osoba w zespole, kolega po urlopie albo agent AI w nowej
> rozmowie – bierze zadanie i nie wie, co już ustalono ani co już próbowano.
> Pyta na czacie, przekopuje historię albo powtarza ślepy zaułek.

Ten sam problem dotyczy ludzi i agentów, więc zgadza się z decyzją z
2026-10-28 („Guidon jest przede wszystkim dla ludzi, AI to opcja”).
Agent tylko go wyostrza: zaczyna każdą rozmowę od zera i nie dopyta.

Skąd wiemy, że to może boleć:

| Sygnał | Rodzaj dowodu |
| --- | --- |
| Ludzie ręcznie piszą pliki `CLAUDE.md` / `AGENTS.md`, żeby agent znał projekt. Guidon sam ma oba w repozytorium. | Obserwacja własna (dogfooding) |
| Konkurenci mają MCP, ale żaden nie ma w dokumentacji wbudowanej historii prób („co już nie zadziałało”). | Przegląd dokumentacji, `src/lib/compare.ts`, stan na 2026-11-09 |
| Konkurencja jest liczna i płatna (Jira, Linear, ClickUp, Plane), więc ludzie płacą za zarządzanie pracą. | Rynek, `docs/launch/competitive-evidence-2026-10-29.md` |
| Częstotliwość i koszt utraty kontekstu w małych zespołach | **Niezbadane.** Do sprawdzenia w rozmowach (niżej). |

## Główny profil (ICP 1): małe studio gier lub zespół deweloperski z AI

| Cecha | Wartość |
| --- | --- |
| Wielkość | 2–15 osób; często założyciel-programista plus kilka osób |
| Branża | Gry indie (Godot, Unity, Unreal), małe produkty SaaS, agencje deweloperskie |
| Narzędzia dziś | GitHub; Trello, Notion albo arkusz zamiast prawdziwego PM; Discord jako czat |
| AI | Co najmniej jedna osoba używa Claude Code, Cursora albo Codexa co tydzień |
| Budżet na narzędzia | Bliski zera. Darmowy plan albo własny serwer |
| Kto decyduje | Ta sama osoba, która używa: lead dev albo techniczny założyciel |
| Region na start | Polska i Europa: sieć kontaktów autora, interfejs w PL/EN/DE/ES (założenie) |
| Wartości | Chce mieć swoje dane, nie lubi uzależnienia od dostawcy, lubi open source |

### Co ich popycha do zmiany (momenty zapalne)

1. **Nowa osoba w zespole:** tydzień wdrażania przez pytania na Discordzie.
2. **Zaczęli używać agentów AI:** agent robi w kółko te same błędy, a ktoś
   ręcznie przepisuje kontekst do promptów.
3. **Trello albo Notion się rozjechało:** zadania osobno, decyzje osobno,
   nikt nie wie, co jest aktualne.
4. **Jira albo Linear za drogie lub za ciężkie** jak na 5 osób.
5. **Plane albo inny self-hosted ma limity** w wersji darmowej (źródło:
   wcześniejsze badanie skarg na Plane, sesja z 2026-11-09).

### Czego od Guidona oczekują

- **Wejście w zadanie bez dopytywania:** opis, decyzja, wcześniejsze próby.
- **Agent bierze zadanie z tym samym kontekstem** i oddaje je do przeglądu,
  a człowiek decyduje.
- **Prostota:** tablica plus kontekst, bez konfigurowania 20 modułów.
- **Darmowy start i możliwość postawienia u siebie.**

## Drugi profil (ICP 2): solo developer z agentami

Jedna osoba z kilkoma projektami, która używa agentów AI zamiast zespołu.
Ten sam ból („agent nie pamięta”), mniej potrzeb zespołowych. Łatwiej ją
znaleźć (r/ClaudeAI, Discordy Cursora), ale trudniej zatrzymać, bo jedna
osoba szybko wraca do plików Markdown. Dobra do testowania onboardingu,
słabsza jako docelowy klient.

## Kto NIE jest naszym klientem (anty-ICP)

- **Korporacje i duże zespoły,** które potrzebują SSO, audytów, zgodności
  i umów (SLA, DPA). Guidon tego nie ma i nie powinien zaczynać od tego.
- **Zespoły nietechniczne** (marketing, HR, agencje kreatywne bez kodu):
  Guidon mówi językiem dewelopera.
- **Kierownicy projektów, którzy potrzebują wykresów Gantta,** budżetów
  i portfeli projektów.
- **Ludzie szukający „AI, które samo zrobi projekt”:** Guidon trzyma
  człowieka w roli decydującego.

## Gdzie ich szukać

- Polskie społeczności gamedevu (Discordy, grupy, game jamy), r/godot,
  r/gamedev, r/IndieDev.
- r/ClaudeAI, r/cursor, Discordy Claude Code i Cursora (posty zaczynające
  od agenta, jak w `docs/launch/launch-plan.md`).
- r/selfhosted dla wersji na własny serwer.
- Znajomi programiści, koło informatyczne, szkolne projekty
  (`docs/launch/pilot.md`).

## Co mówimy (jeden komunikat)

> **Weź każde zadanie bez dopytywania.**
> Guidon trzyma przy zadaniu decyzję, kontekst i to, co już nie zadziałało,
> dla ludzi i dla agentów AI. Za darmo, albo na własnym serwerze.

## Co to znaczy dla produktu

1. **Pierwszy efekt:** w ciągu jednej sesji ktoś bierze zadanie (sam albo
   przez agenta) i widzi przy nim decyzję oraz wcześniejsze próby.
2. **Prosty start:** nowy projekt pokazuje tablicę, decyzje i pamięć.
   Reszta modułów jest schowana do włączenia.
3. **Przewodnik w aplikacji** prowadzi właśnie do tego pierwszego efektu
   (stąd maskotka Gido, która jest zawsze pod ręką).
4. **Strona główna:** największa sekcja to „co już próbowano”, a nie sama
   tablica.

## Jak to sprawdzić (zanim zbudujemy więcej)

**5 rozmów** z osobami z ICP 1, wg `docs/launch/pilot.md` i sekcji
„Five interviews” w `docs/launch/competitive-evidence-2026-10-29.md`:

1. Kiedy ostatnio ktoś (albo agent) zaczął zadanie bez potrzebnego
   kontekstu? Co się stało?
2. Ile czasu w zeszłym tygodniu zajęło Ci tłumaczenie kontekstu – ludziom
   albo agentowi?
3. Gdzie dziś trzymacie decyzje i informacje o tym, co nie zadziałało?
4. Czego używacie do zadań i ile płacicie?

**Kryteria decyzji:**

- **Idziemy dalej,** jeśli co najmniej 3 z 5 osób od razu opowie konkretną,
  niedawną historię i ma dziś jakieś obejście (pliki, notatki, czat).
- **Zmieniamy profil albo problem,** jeśli większość nie pamięta takiej
  sytuacji albo nie przeszkadza jej to na tyle, żeby coś zmienić.

Wyniki zapisujemy jako P1–P5, bez danych osobowych, i aktualizujemy ten
dokument (wersja 2).
