# Dane demo dla walkthrough (nagranie prezentacji)

Skrypt `scripts/seed-walkthrough-demo.mjs` tworzy gotowy zestaw danych
demo odpowiadający rozdziałom przewodnika
[`guidon-walkthrough-pl.md`](../guidon-walkthrough-pl.md), żeby prezentację
dało się nagrać w prawdziwej aplikacji zamiast opowiadać o niej wyłącznie
słownie.

## Kiedy używać

- **Tylko tryb self-hosted** (zmienna `DATABASE_URL`, np. `docker compose`
  według [docs/self-hosting.md](self-hosting.md)). Na Guidon Cloud skrypt
  nie jest przeznaczony — tam dane demo tworzy się po prostu w aplikacji.
- Konto użytkownika podane w `--email` musi już istnieć (załóż je przez
  `/auth/signup`). Staje się właścicielem organizacji i projektu demo —
  i widzi wszystkie dane w interfejsie.

## Uruchomienie

```bash
# pierwszy raz (zakłada organizację „Guidon — demo walkthrough"
# i projekt „Kamera orbitalna VR")
DATABASE_URL=postgres://... npm run demo:seed -- --email ja@example.com

# odświeżenie danych demo (usuwa stary zestaw kaskadowo i tworzy nowy)
DATABASE_URL=postgres://... npm run demo:seed -- --email ja@example.com --reset
```

Skrypt działa wyłącznie przez zwykły SQL na kopiach tabel aplikacji, z tym
samym modelem uprawnień co sesja użytkownika: transakcje „as user" ustawiają
`request.jwt.claims`, więc RLS i triggery (m.in. walidacja workflow zadań)
przechodzą dokładnie jak w aplikacji. Tabele zapisywane w aplikacji przez
`service_role` (brief agenta, pakiet modułu, referencje moodboardu) skrypt
wstawia w trybie definer.

## Co tworzy (mapa na rozdziały walkthrough)

| Dane | Rozdział | Gdzie w aplikacji |
|---|---|---|
| 18 zadań w kolumnach backlog/todo/in_progress/ai_working/review/done + 2 podzadania | R.4 | `/work` |
| Komentarze, nieudana próba (attempt), potwierdzony commit i sugerowany PR | R.4 | `/work` (szczegół zadania) |
| Biała tablica: 3 notatki + krawędź | R.5 | `/whiteboard` |
| Dwie fazy roadmapy z postępem | R.5 | `/roadmap` |
| Trzy decyzje (product/architectural/process) | R.6 | `/decisions` |
| Dwa źródła wiedzy + cztery technologie | R.6 | `/knowledge`, `/technology` |
| Dwa placeholdery moodboardu | R.6 | `/references` |
| Pamięć: fakt, reguła, ograniczenie i dwa insighty AI (jeden z datą −100 dni → marka „stale") | R.7 | `/memory` |
| Relacje kontekstu: insight ↔ decyzja (`based_on`), fakt ↔ źródło (`references`) | R.7 | `/context` |
| Brief agenta, wersja 1, zatwierdzony | R.8 | `/brief` |
| Moduł `release-planning` (manifest z `examples/module-manifests`) z automatyzacją `create_task` | R.9 | `/modules` |

## Uwagi na nagranie

- **Moodboard**: obrazy są placeholderami (`moodboard/*.png`), więc na
  podglądzie pojawi się brak grafiki. Nagrywając R.6, wgraj prawdziwe
  pliki przez UI (przycisk dodawania na `/references`).
- **Automatyzacja modułu**: uruchamia się przy zapisie rekordu z poziomu
  aplikacji (moduł → formularz → nowy rekord ze statusem „Planned"),
  nie przy bezpośrednim SQL. Zadanie „Plan wydania: …" pojawi się w Backlogu.
- **Linki do kodu**: sugerowany PR ma confidence 0,60 — w R.4 pokaż
  potwierdzenie (Confirm link) na tym wierszu.
- **Insight „stale"**: w R.7 pokazuj widok listy, gdzie marka „stale" jest
  widoczna; marka „wymaga przeglądu" pojawi się dopiero po zmianie decyzji
  powiązanej (`based_on`) — można to zrobić na żywo edytując decyzję
  „PostgreSQL 15_z RLS..." w `/decisions`.

## Czego skrypt nie robi

- Nie tworzy kont (używaj istniejącego konta przez `--email`).
- Nie uruchamia AI (insighty AI są zasiane ręcznie, z pustą weryfikacją).
- Nie zmienia kodu aplikacji, migracji ani polityk RLS — tylko wstawia dane.
