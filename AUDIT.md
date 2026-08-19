# Guidon — Audyt (FAZA 0: Rozpoznanie)

Data: 2026-08-19. Stan repo: branch `main`, working tree czysty przed rozpoczęciem audytu.

## 1. Stack

- **Framework**: Next.js 16.3.0, App Router, Turbopack, `Proxy` (Next 16 nazwa dla middleware) w `src/proxy.ts`
- **Runtime**: React 19.2.8, TypeScript 5 (strict), Node
- **Stylowanie**: Tailwind CSS v4 (`@import "tailwindcss"`, most values via `@theme inline` bridge) — **nie** jest to gołe Tailwind, projekt ma już własny system tokenów semantycznych w `src/app/globals.css` (388 linii): `surface`, `surface-elevated`, `border(+hover/active)`, `text/text-secondary/text-muted`, `accent`, `success/warning/danger/info`, plus dedykowane `priority-low/medium/high/critical` pod Kanban. Light mode na `:root`, dark mode przez `@media (prefers-color-scheme: dark)` **i** przez jawny `[data-theme="dark"]` (oba warianty zdefiniowane niezależnie, zgodnie z zasadą "nigdy nie definiuj koloru tylko w media query").
- **`prefers-reduced-motion`**: już respektowany globalnie (`globals.css:379-388`, zerowanie `animation-duration`/`transition-duration`). To ważne dla FAZY 3 — fundament pod motion już istnieje, nie trzeba go zakładać od zera.
- **Komponenty bazowe**: styl shadcn/ui na Radix UI — zainstalowane: `@radix-ui/react-avatar`, `-dialog`, `-dropdown-menu`, `-label`, `-slot`. Własne: `button`, `card`, `input`, `label`, `badge`, `textarea`, `select` w `src/components/ui/`. `class-variance-authority` + `tailwind-merge` do wariantów.
- **Ikony**: `lucide-react`
- **Animacje**: **brak biblioteki** — żadnego `framer-motion`, `motion`, `react-spring`, `@react-spring/*`, `gsap` w `package.json` (sprawdzone w `dependencies` i `devDependencies`). Cokolwiek ruchu istnieje dziś, to czyste CSS (`transition-colors`, `hover:shadow-lg` itp.) — punkt wyjścia do FAZY 3 to CSS, biblioteka wymagałaby osobnej zgody zgodnie z Twoją zasadą.
- **Backend**: dualna ścieżka Supabase / self-hosted Postgres (`pg`), przełącznik `hasDirectDatabase()` (`DATABASE_URL`) — konsekwentnie zastosowany we wszystkich punktach dostępu do danych.
- **Auth**: Supabase Auth (hosted) albo lokalna sesja cookie + `pg` (self-hosted) — `src/lib/auth/`.
- **Testy**: brak Jest/Vitest — 4 własne skrypty Node (`tests/db`, `tests/auth`, `tests/limits`, `tests/ai`), uruchamiane przez `npm run test:*`.

## 2. Stan wyjściowy (build / typecheck / lint / testy)

| Krok | Wynik |
|---|---|
| `npx tsc --noEmit` | ✅ czysto, 0 błędów |
| `npx next build` | ✅ przechodzi, 33 trasy (17 statycznych/dynamicznych stron App Routera + API), bez ostrzeżeń builda |
| `npx eslint .` | ❌ **36 błędów, 3 ostrzeżenia** — patrz niżej |
| `npm run test:db` | ✅ 74 pass / 0 fail |
| `npm run test:auth` | ✅ 23 pass / 0 fail |
| `npm run test:limits` | ✅ 6 pass / 0 fail |
| `npm run test:ai` | ✅ 32 passed / 0 failed |

**Razem: 135/135 testów przechodzi. Build i typecheck czyste. To jest linia bazowa — każdy batch w dalszych fazach musi ją utrzymać.**

### Rozbicie błędów lintu (36 błędów, 3 warningi)

- **33× `@typescript-eslint/no-explicit-any`** — dług zastany, rozproszony po `src/app/api/v1/search/route.ts` (7×), `src/lib/api/api-response.ts` (3×), `src/lib/storage/storage.ts` (6×), `src/types/context.ts` (5×), `src/types/api.ts` (2×), `src/lib/search/index.ts` (3×), `src/lib/supabase-server.ts` (2×), plus pojedyncze w `organizations/*`, `projects/page.tsx`, `dashboard-shell.tsx`, `navigation.tsx`. Nie dotyka logiki biznesowej — do FAZY 2/4, nie teraz.
- **2× `no-empty-object-type`** — `src/components/ui/input.tsx:5`, `src/components/ui/textarea.tsx:5`: puste interfejsy rozszerzające `React.InputHTMLAttributes`/`TextareaHTMLAttributes` bez dodawania niczego. Standardowy wzorzec shadcn/ui, trywialny fix (zamiana `interface X extends Y {}` na `type X = Y`).
- **1× realny bug, nie tylko styl** — `src/app/projects/[id]/files/files-browser.tsx:218/260` (`react-hooks/static-components`): `const Icon = getFileIcon(...)` tworzy referencję komponentu wewnątrz ciała komponentu funkcyjnego przy każdym renderze, potem `<Icon />`. To realnie resetuje stan ikony przy każdym re-renderze karty pliku. Do naprawienia w FAZIE 2 lub 4 (nie kosmetyka — kandydat na osobny mały fix).
- **3× `no-unused-vars` (warning)**: `project-sidebar.tsx:7` (`Badge` niewykorzystany import), `lib/context/index.ts:63` (`relationType` niewykorzystany parametr), `lib/storage/storage.ts:18` (`FILE_CATEGORIES` niewykorzystany eksport) — kandydaci na FAZĘ 2.

## 3. Mapa ekranów / route'ów (33)

```
/                                          — landing (public)
/auth/login  /auth/signup  /auth/logout    — auth (+ /auth/callback route handler)
/dashboard                                 — lista projektów usera + statystyki
/profile                                   — edycja profilu (imię, avatar)
/organizations                             — lista organizacji
/organizations/[id]                        — projekty w organizacji
/organizations/[id]/members                — członkowie organizacji

/projects                                  — (istnieje jako trasa, do zweryfikowania w FAZIE 1 czy ma realny cel obok /dashboard)
/projects/[id]/*                           — WSPÓLNY layout.tsx (ProjectSidebar, requireProjectAccess raz na nawigację):
  /projects/[id]              — przegląd projektu
  /projects/[id]/work         — tablica Kanban (najbardziej złożony ekran — DnD, dialogi)
  /projects/[id]/roadmap      — fazy/milestone'y
  /projects/[id]/knowledge    — źródła wiedzy
  /projects/[id]/decisions    — decyzje (Context Layer)
  /projects/[id]/context      — relacje Context Layer
  /projects/[id]/memory       — project_memory: FACT vs AI INSIGHT
  /projects/[id]/files        — przeglądarka plików
  /projects/[id]/members      — członkowie projektu
  /projects/[id]/activity     — log aktywności
  /projects/[id]/technology   — stack technologiczny
  /projects/[id]/settings     — ustawienia projektu
  /projects/[id]/tasks        — (osobna trasa obok /work — do wyjaśnienia w FAZIE 1, czy to duplikat)

/admin/*                                   — panel admina (TODO.md §25), wspólny layout.tsx, 5 podstron:
  /admin              — system status (DB/Storage/AI/Auth health, liczniki)
  /admin/organizations /admin/users /admin/integrations /admin/logs

/api/health  /api/storage  /api/v1/search  — API
```

## 4. Mapa głównych komponentów

- `src/components/ui/*` (10) — prymitywy: button, card, input, label, dialog, dropdown-menu, avatar, badge, textarea, select
- `src/components/layout/*` — `navigation.tsx` (górny pasek, wspólny dla stron poza `/projects/[id]` i `/admin`), `project-sidebar.tsx` + `project-switcher.tsx` (shell projektu), `dashboard-shell.tsx` (**podejrzenie martwego kodu**, patrz niżej)
- `src/components/work/*` — `kanban-board.tsx`, `task-card.tsx`, `task-why-panel.tsx`, `task-detail-dialog.tsx`, `task-attempts-section.tsx` — najbardziej interaktywny obszar aplikacji, główny cel FAZY 3 dla motion (drag state, panel Why, dialog szczegółów)
- `src/components/files/*` — `code-block.tsx`, `file-viewer.tsx`
- `src/components/auth/oauth-buttons.tsx`
- Wzorzec kolokacji: każdy moduł projektu (`roadmap/`, `knowledge/`, `decisions/`, `memory/`, `context/`, `technology/`) trzyma własne `actions.ts` + `*-dialog.tsx` + `*-config.ts` + `*-card-menu.tsx` obok `page.tsx`, zamiast centralizować w `components/` — spójne w całym repo, nie problem.

## 5. Stan systemu wizualnego (wstępna obserwacja — szczegóły w FAZIE 1)

Dobra wiadomość: **fundament tokenów już istnieje** i jest w miarę kompletny (kolory semantyczne, dark mode, reduced-motion). To zmienia punkt wyjścia FAZY 3 — nie budujemy systemu od zera, tylko go rozszerzamy/porządkujemy.

Zły news: **użycie jest niespójne.** Przykłady znalezione już w tej fazie (bez szukania — będzie ich więcej w FAZIE 1):
- `admin/page.tsx`, `profile/*`, `auth/login/signup` — w pełni na tokenach (`bg-success/15`, `border-warning/30`, `text-muted-foreground`)
- `dashboard/page.tsx`, `organizations/[id]/members/page.tsx` (`ROLE_COLORS`), `organizations/[id]/page.tsx` (kolory statusu projektu) — surowe klasy Tailwind (`bg-purple-100 text-purple-800`, `bg-green-100 text-green-800`, `hover:shadow-lg`) niepowiązane z tokenami, więc **nie reagują na dark mode** mimo że reszta apki go obsługuje

## 6. Wstępne podejrzenia martwego kodu (do potwierdzenia narzędziami w FAZIE 2 — nic nie usunięte)

1. **`src/components/layout/dashboard-shell.tsx`** — zero importerów w całym `src/` (grep), niezmieniony od commitu założycielskiego `5e6ef0c "Guidon Creation"`. Nawigację przejął `navigation.tsx`, shell projektu — `project-sidebar.tsx`. Silny kandydat do usunięcia.
2. `src/lib/storage/storage-constants.ts:18` — `FILE_CATEGORIES` (eksport nieużywany, warning lintu)
3. `src/lib/context/index.ts:63` — parametr `relationType` nieużywany
4. `src/components/layout/project-sidebar.tsx:7` — import `Badge` nieużywany
5. **Trasa `/projects/[id]/tasks` obok `/projects/[id]/work`** — dwie trasy o pokrywających się nazwach w tym samym module; wymaga sprawdzenia w kodzie/routingu czy to duplikat, wariant, czy coś aktywnie linkowanego, zanim cokolwiek ruszę.
6. **Trasa `/projects` obok `/dashboard`** — też do wyjaśnienia, nie zakładam nic.

**Dobra wiadomość, którą warto odnotować**: wcześniejszy plan architektoniczny z tej sesji (`guidon-master-product-floofy-newt.md`) wskazywał trzy niezamontowane React Contexts (`AuthProvider`, `ProjectProvider`, `ContextLayerProvider`) jako martwy kod. Sprawdziłem — **katalog `src/contexts/` już nie istnieje**, a `src/app/projects/[id]/layout.tsx` ma wprost w komentarzu, że `ProjectAccessProvider` został usunięty jako nieskonsumowany. Ten fragment starego planu jest już zrealizowany; nie licz na niego jako aktualny punkt odniesienia — będę pracował z tym, co widzę w repo teraz, nie z tamtym dokumentem.

## 7. Decyzje z FAZY 0

- Trasy `/projects/[id]/tasks` i `/projects` — **do zbadania w FAZIE 2** narzędziami/grepem, nie zakładam nic z góry.
- FAZA 1 (ten audyt) i FAZA 2 (martwy kod) zostają na `main` — nie modyfikują `src/`. Osobna gałąź startuje dopiero z pierwszym realnym commitem w FAZIE 2 lub 3.

---

# FAZA 1 — Audyt wyglądu (bez zmian)

Posortowane wg wpływu na odbiór aplikacji. Każdy punkt: plik+linia, dlaczego to problem, propozycja fixu. Nic z tego nie zostało jeszcze zmienione.

### 1. Systemowy problem: kolory statusu/typu omijają tokeny w co najmniej 5 miejscach — **najwyższy priorytet**

Projekt ma dojrzały system tokenów (`globals.css`, patrz FAZA 0 §5), ale kilka kluczowych plików go ignoruje i piszą surowe pary `bg-X-100 text-X-800`:

- `src/app/projects/[id]/memory/memory-type-config.ts:5-11` — **to jest dokładnie rozróżnienie FACT vs AI INSIGHT**, o które prosiłeś. `fact: "bg-blue-100 text-blue-800"` vs `ai_insight: "bg-indigo-100 text-indigo-800"` — dwa bardzo bliskie odcienie niebieskiego jako *jedyny* kolorystyczny sygnał (ikona się różni: `FileText` vs `Lightbulb`, ale to nie ratuje sytuacji przy szybkim skanowaniu wzrokiem listy).
- `src/app/projects/[id]/decisions/decision-config.ts:5-17` — `STATUS_CONFIG` (4 statusy) i `TYPE_COLORS` (6 typów decyzji), wszystkie jako surowe pary Tailwind.
- `src/app/organizations/[id]/members/page.tsx:24-27` (`ROLE_COLORS`) i `src/app/organizations/[id]/page.tsx:117-123` (status projektu, inline ternary) — już odnotowane w FAZIE 0, ten sam wzorzec.
- `src/components/work/task-attempts-section.tsx:22-24` — częściowe skażenie: `failed` poprawnie używa `text-destructive` (token), ale `partial`/`succeeded` używają surowych `text-amber-500`/`text-emerald-500` zamiast istniejących `--color-warning`/`--color-success`.

**Dlaczego to problem, konkretnie:**
- Te chipy **nie reagują na dark mode** — `bg-blue-100`/`text-blue-800` to stałe jasne kolory, więc na ciemnym tle świecą jako jasne plamy zamiast wtopić się w resztę UI, która przez token system poprawnie się przyciemnia.
- Ten sam wzorzec **przecieka do Kanban/Why panelu** przez `task-why-panel.tsx:60` (`DECISION_STATUS_CONFIG[...].color` wstrzyknięte prosto do `<Badge className={...}>`) — czyli nawet ekran, który sam w sobie jest dobrze zbudowany (`task-card.tsx` jest w pełni na tokenach), dziedziczy niespójny kolor z zewnątrz. To najczystszy przykład "niespójnego wariantu tego samego komponentu" (Badge) w obrębie jednej funkcji produktu.
- To bezpośrednio podważa wymóg z Twojego briefu: *"FACT vs AI INSIGHT musi być rozróżnialne na pierwszy rzut oka (kolor + ikona + tło, nie sam kolor)"* — obecnie tło jest tym samym mechanizmem co kolor (jedna klasa `bg-X-100 text-X-800`), więc realnie jest to nadal jeden sygnał, nie trzy niezależne.

**Propozycja fixu (FAZA 3/4):** dodać do `globals.css` mały zestaw tokenów kategorii (albo świadomie reużyć `success/warning/danger/info` tam gdzie pasują semantycznie), i przepisać tych 5 plików na jedno źródło prawdy. To pojedyncza, dobrze izolowana zmiana, ale dotyka najbardziej wyeksponowanych ekranów (Memory, Decisions, Why panel) — kandydat na pierwszy commit FAZY 4.

### 2. Wewnątrz projektu nie ma górnego paska nawigacji — brak drogi do profilu/wylogowania/organizacji

`src/app/projects/[id]/layout.tsx:50-54` renderuje `<ProjectSidebar>` bezpośrednio, bez `<Navigation>`. `ProjectSidebar` (`src/components/layout/project-sidebar.tsx`) ma tylko `ProjectSwitcher` (przełącza projekty w tej samej organizacji) i grupy linków projektowych — nie ma menu użytkownika, linku do `/profile`, przycisku wylogowania ani drogi do `/organizations`.

**Dlaczego problem:** to jest ekran, na którym użytkownik spędza większość czasu (Board, Roadmap, Knowledge...), a nie ma z niego wyjścia poza przeglądarkowym "wstecz" albo ręczną edycją URL. To nie kosmetyka — to dziura w hierarchii nawigacji.

**Propozycja fixu:** wymaga decyzji projektowej (osobny wiersz w nagłówku sidebara vs. cienki pasek nad sidebarem vs. rozszerzenie `ProjectSwitcher` o menu użytkownika) — **DO POTWIERDZENIA**, nie zgaduję w FAZIE 3.

### 3. Zero stanów loading/error na poziomie trasy w całej aplikacji

Potwierdzone w FAZIE 0: `Glob` na `**/{loading,error,not-found}.tsx` w `src/app` zwrócił **0 plików**. Żadna z 33 tras nie ma konwencji App Routera do stanu ładowania ani błędu.

**Dlaczego problem:** każda strona to Server Component, więc nawigacja blokuje się bez żadnego wizualnego feedbacku aż do zakończenia zapytań do bazy — przy wolniejszym połączeniu użytkownik klika link i nic się nie dzieje. Rzucony błąd w dowolnej stronie pokaże generyczny ekran błędu Next.js zamiast czegoś spójnego z resztą UI. To bezpośrednio złamanie zasady z Twojego briefu ("brakujące stany: loading/empty/error").

**Propozycja fixu:** jeden `loading.tsx`/`error.tsx` w `src/app/` (fallback globalny) + dedykowany w `src/app/projects/[id]/` (największy, najczęściej odwiedzany obszar) — do FAZY 4, osobny, mały commit.

### 4. Panel wyszukiwania w Navigation może renderować się poza ekranem po scrollu

`src/components/layout/navigation.tsx:85` — `<nav className="border-b bg-background">` nie ma `relative`, a panel wyników (`navigation.tsx:141`, `absolute top-16 left-0 right-0`) pozycjonuje się więc względem initial containing block, nie względem paska nawigacji. Po przescrollowaniu strony w dół panel może wyrenderować się nad aktualnym widokiem (efektywnie niewidoczny).

**Fix:** dodać `relative` do `<nav>` — jednolinijkowa, izolowana poprawka. Nie zrobione teraz (FAZA 1 = bez zmian), ale to dobry kandydat na szybki fix na starcie FAZY 4.

### 5. Prawdopodobne naruszenie WCAG AA kontrastu

`src/components/work/task-attempts-section.tsx:23-24` — `text-amber-500` (outcome "Partial") i `text-emerald-500` (outcome "Succeeded") na jasnym tle dają orientacyjnie ok. 2.4–2.6:1 kontrastu — poniżej progu 4.5:1 dla tekstu wg WCAG AA. Aplikacja ma już wytunowane pod to tokeny: `--color-warning` (#d97706, ciemniejszy amber-600) i `--color-success` (#059669, emerald-600) — używane poprawnie gdzie indziej (np. `admin/page.tsx`). Ten plik po prostu po nie nie sięga.

**Fix:** `text-amber-500` → `text-warning`, `text-emerald-500` → `text-success`.

### 6. Magiczna wartość poza systemem tokenów w komponencie bazowym

`src/components/ui/select.tsx:26` — inline `style={{backgroundImage: ...}}` z ręcznie wpisanym SVG data-URI, w którym kolor strzałki jest zahardkodowany jako `stroke='%23888'` (czyli `#888888`) zamiast korzystać z tokenu tekstu/mutowanego koloru. Drobne, ale to jedyne miejsce w bazowych komponentach UI, gdzie kolor nie pochodzi z systemu — jeśli paleta się kiedyś przesunie, ta strzałka zostanie w tyle niezauważona.

### 7. Zmiany stanu bez wizualnego wyjaśnienia — kandydaci na animację w FAZIE 3

- **Kanban — przeciąganie karty** (`kanban-board.tsx`, `task-card.tsx`): karta znika/pojawia się w nowej kolumnie natychmiastowo (`isDragging` daje tylko `opacity-40`), reszta kolumny przeskakuje bez przejścia. `DropZone` ma już `transition-all`/`transition-colors` na linię wstawienia — dobry punkt zaczepienia do rozbudowy.
- **Przełączanie zakładek w Context Layer** (`src/app/projects/[id]/context/context-tabs.tsx:52-60`): zawartość zakładki (Decisions/Relations/Sources) zmienia się bez żadnego przejścia, tylko podkreślenie aktywnej zakładki (`border-b-2 border-primary`) zmienia klasę.
- **Recenzja AI Insight** (`src/app/projects/[id]/memory/insight-review-card.tsx`): Accept/Correct/Reject wywołuje Server Action + `revalidatePath` — cała lista się odświeża, karta po prostu znika. To dokładnie miejsce, które Twój brief nazywa najwyższym priorytetem: *"pojawianie się AI INSIGHT — powinno być widać, że coś powstało, a nie że nagle jest"* — dziś jest odwrotnie nawet dla zniknięcia po recenzji.
- **Board**: dodanie/usunięcie karty z kolumny (np. utworzenie taska) też nie ma przejścia wejścia/wyjścia.

Fundament jest gotowy do tego, żeby to zrobić dobrze: `globals.css:378-388` już globalnie respektuje `prefers-reduced-motion`, więc jakikolwiek system motion zbudowany w FAZIE 3 automatycznie odziedziczy to zabezpieczenie.

### 8. Niespójny wzorzec dark mode na poziomie pojedynczego komponentu

`src/app/projects/[id]/memory/insight-review-card.tsx:82` — `<Card className="border-indigo-300 dark:border-indigo-800">` hardkoduje jawny wariant `dark:`. W całej reszcie aplikacji dark mode obsługuje wyłącznie system tokenów (kolor automatycznie się przełącza przez `@media (prefers-color-scheme: dark)` / `[data-theme]` w `globals.css`) — nigdzie indziej nie widziałem komponentu z ręcznym `dark:` na klasie koloru. Strukturalna niespójność, nawet jeśli wizualnie dziś wygląda OK.

### 9. Drobne — długie treści / karty projektów

`src/app/dashboard/page.tsx:206-213` — `CardTitle` z nazwą projektu obok `Badge` statusu w `flex justify-between`, `CardTitle` bez `truncate`/`line-clamp`. Przy długiej nazwie projektu tytuł zawinie się pod odznakę zamiast się skrócić — `task-card.tsx` (`line-clamp-3` na tytule, `+N` na tagach) jest tu dobrym wzorcem do skopiowania. Niski priorytet, ale łatwy do naprawienia przy okazji tego samego pliku co punkt 1.

---

## Podsumowanie FAZY 1

9 konkretnych problemów, największy pojedynczy: **punkt 1** (kolory statusu poza tokenami) — dotyka 5 plików, ale to jeden spójny wzorzec naprawy, i bezpośrednio serwuje Twój wymóg FACT/AI-INSIGHT. Drugi co do wagi: **punkt 2** (brak nawigacji w obszarze projektu) — to nie jest kosmetyka, wymaga decyzji projektowej.

**STOP.** Zero zmian w kodzie w tej fazie. Czekam na Twoją decyzję co dalej.
