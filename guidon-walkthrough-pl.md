# Guidon — kompletna prezentacja aplikacji (walkthrough po polsku)

> Prezentacja przygotowana na podstawie analizy kodu repozytorium
> `Two-Steps-Studio/guidon` (Next.js 16 App Router, React 19, PostgreSQL
> z Row-Level Security, abstrakcje `AIProvider`/`StorageProvider`, serwer
> MCP, system modułów). Wszystkie opisane cechy pochodzą z codu;
> funkcje częściowe lub zaplanowane są wprost oznaczone w checkliście
> pokrycia (sekcja 3).

---

## 1. Kompletny scenariusz walkthrough (narracja)

Całkowity czas narracji: **ok. 9–10 minut** (12 rozdziałów). Standardowe
zakładki omawiamy krótko; dłużej zatrzymujemy się na warstwie kontekstu,
pamięci, agentach i modułach.

### Rozdział 1 — Wprowadzenie (0:00–0:35)

> „Guidon to kontekstowe zarządzanie projektami dla zespołów
> deweloperskich i game dev. Oznacza to, że Guidon śledzi nie tylko *co*
> trzeba zrobić, ale i *dlaczego* — decyzje, relacje, pamięć projektu
> i pochodzenie wiedzy. Aplikacja jest od początku zaprojektowana pod
> współpracę z agentami AI: ma REST API, serwer MCP i pełny cykl
> „człowiek zatwierdza". Działa w trzech trybach: chmura (Guidon Cloud),
> self-hosted (Docker Compose z własnym PostgreSQL) albo lokalnie
> dewelopersko — ten sam kod w każdym z nich. W tej prezentacji przejdźmy
> przez całą aplikację: od tablicy zadań, przez warstwę kontekstu, aż do
> agentów, modułów i integracji z Unity, Unreal i GitHubem."

### Rozdział 2 — Dashboard, My tasks, organizacje (0:35–1:45)

> „Po zalogowaniu wita nas **Dashboard** — to poranny widok człowieka,
> nie ekran jednego projektu. Po lewej nawigacja globalna: Dashboard,
> *My tasks*, Projekty i Organizacje; niżej grupa rozszerzeń: Plugins
> i Marketplace. Na dole: profil, zmiana motywu (jasny, ciemny albo
> systemowy), zmiana języka — aplikacja jest dostępna po angielsku,
> polsku, niemiecku i hiszpańsku — oraz wspólna wyszukiwarka.
>
> Dashboard pokazuje cztery elementy: moje otwarte i przeterminowane
> zadania (z licznikami), najbliższe terminy, ostatnią aktywność w
> projektach i karty projektów z paskiem postępu. Przypięte projekty
> pojawiają się w pasku nawigacji na każdej stronie.
>
> **My tasks** to praca przypisana do mnie *w poprzek projektów* — jeden
> widok zamiast klikania po tablicach.
>
> Organizacje grupują projekty, członków i — w wersji chmurowej —
> rozliczenia Stripe. Członkostwo w organizacji i w projekcie zarządza się
> osobno: najpierw zaprasza się do organizacji, potem dodaje osoby do
> projektów z odpowiednią rolą. Zaproszenie to link jednorazowy ważny
> 7 dni; można go wyświetlić i przekazać ręcznie."

### Rozdział 3 — Nawigacja modułowa projektu (1:45–2:25)

> „Wchodzimy w projekt. Ten pasek po lewej nie jest sztywną listą linków —
> to konfiguracja: projekt decyduje, które moduły są widoczne. Ukrycie
> modułu to wyłącznie preferencja wyświetlania; dane zostają w bazie.
> Zakładki są pogrupowane: **Praca** (tablica zadań, whiteboard, kalendarz,
> roadmapa, pliki), **Wiedza** (baza wiedzy, decyzje, moodboard,
> technologie), **Kontekst** (pamięć, brief agenta, graf relacji, własne
> moduły) i **Projekt** (członkowie, zatwierdzenia, aktywność, ustawienia).
> Projekt z własnymi modułami dostaje dla każdego osobną zakładkę w grupie
> swojej kategorii. Zwróćcie uwagę: zakładka *Zatwierdzenia* zwykle nie
> istnieje — pojawia się dopiero, gdy pierwszy agent poprosi o coś, czego
> sam zrobić nie może."

### Rozdział 4 — Tablica zadań (2:25–4:05)

> „Serce Guidona: tablica Kanban. Kolumny to Backlog, To Do, In Progress,
> **AI Working**, Review i Done — i ta lista nie jest zamrożona: projekt
> może zmienić nazwy i dodać własne kolumny, z flagą „liczone jako
> skończone". Karty przeciągamy drag&dropem; można zaznaczyć kilka i
> użyć działań masowych.
>
> Otwieram zadanie. To nie okienko z tytułem — tutaj składa się cały
> kontekst: opis, priorytet, termin, przypisanie, etykiety (z presetami
> projektu), podzadania z pełnymi statusami, komentarze, załączniki —
> w tym wklejanie obrazka prosto ze schowka i miniatura okładki na karcie —
> oraz relacje do innych zadań i panel **Why**: dlaczego to zadanie w ogóle
> istnieje i skąd pochodzą jego ustalenia.
>
> Dwie rzeczy na szczególną uwagę. Pierwsza: **attempts** — próby wykonania
> tego zadania, także nieudane, razem z powodem. Druga: **linki do kodu** —
> commity, branche i pull requesty z GitHuba. Guidon wykrywa odwołania
> `guidon#<id>` w komunikatach commitów, treści PR-ów i nazwach branchy i
> sam przesuwa zadania; linki *sugerowane* (dopasowane ze słów) czekają na
> **potwierdzenie człowieka** — sugestia to zgadnięcie, nie fakt.
>
> Na koniec **Import**: przeniesienie zadań z Jira, Linear, Trello, Asana,
> ClickUp czy Notion. Import czyta CSV i JSON, pokazuje podgląd dopasowania
> kolumn, priorytetów i przypisań, wykrywa duplikaty po tytułach, a po
> imporcie można **cofnąć** całą operację — znikają tylko zadania, których
> nikt jeszcze nie edytował."

### Rozdział 5 — Whiteboard i planowanie (4:05–5:05)

> „Nowy moduł: **Whiteboard**. To kanwa do burzy mózgów — React Flow
> z minimapą i węzłami, które zapisują się na serwerze. Następnie główne
> wydarzenie: zaznaczam kilka notatek i wybieram *convert to tasks*. AI
> dostaje zaznaczony tekst z kontekstem projektu i **proponuje zestaw
> zadań** — tytuły, opisy, priorytety — w oknie, w którym każdy wiersz
> trzeba zaznaczyć, żeby naprawdę powstało zadanie. Nic nie powstaje
> automatycznie.
>
> Dalej po planach: **Kalendarz** pokazuje zadania z terminami i fazy w
> siatce miesiąca; **Roadmapa** zbiera fazy projektu ze statusem, datami
> start/end i postępem liczonym z zadań. **Pliki** to uploady z kategoriami
> oraz przeglądarka kodu oparta na edytorze Monaco — także dla plików
> z podłączonego repozytorium GitHub."

### Rozdział 6 — Wiedza: decyzje, moodboard, technologie, graf (5:05–6:15)

> „Grupa **Wiedza**. **Decyzje** to rejestr „co ustaliliśmy i dlaczego";
> każda decyzja ma typ z kolorem, status i uzasadnienie. **Baza wiedzy**
> przechowuje źródła wiedzy i pokazuje liczniki powiązanych decyzji,
> plików i wpisów pamięci. **Moodboard** to referencje i inspiracje
> wizualne. **Technologie** — inwentarz stosu technologicznego.
>
> Wszystko to spina **Graf kontekstu**: relacje typu decyzja–wiedza–pamięć–
> plik tworzy się ręcznie jednym dialogiem. Właśnie te relacje warunkują
> świeżość wiedzy, gdy korzysta z niej AI — wrócimy do tego za chwilę.
> To jest ta warstwa kontekstu: zadanie, decyzja, dokument i zapamiętany
> fakt wiedzą o sobie nawzajem."

### Rozdział 7 — Pamięć projektu i brief agenta (6:15–7:25)

> „**Pamięć** to odpowiednik uczącego się projektu. Wpisy dzielą się na
> **fakty** — zweryfikowane przez człowieka — i **AI insights**:
> niezweryfikowane propozycje. Wnioski AI trzeba *zaakceptować, poprawić
> albo odrzucić*; nic nie staje się wiedzą projektu bez decyzji człowieka.
> Wróćmy na chwilę na tablicę: gdy zadanie zostaje ukończone, AI może w
> tle przeczytać jego opis, komentarze i próby i zaproponować jedną–dwie
> rzeczy warte zapamiętania — trafiają do tej samej kolejki, powiązane z
> zadaniem. Jeśli zadanie wróci do „do zrobienia", oczekujące wnioski
> zostają automatycznie wycofane.
>
> Świeżość: wpisy dostają oznaczenie *stale* po określonym czasie dla
> swojego rodzaju; jeśli powiązana decyzja zmieni się później, wpis
> dostaje markę *wymaga przeglądu* i znika z puli zweryfikowanych faktów,
> dopóki ktoś go nie zaktualizuje.
>
> Drugi kluczowy element: **Brief agenta**. Wersjonowany dokument w
> Markdownie zatwierdzany przez właścicieli projektu — cel, stack,
> konwencje, ograniczenia, dozwolone akcje agenta — **z podanym źródłem
> dla każdej linii**. To pierwszy dokument, który agent czyta, zaczynając
> pracę z projektem."

### Rozdział 8 — Kolaboracja z agentami AI (7:25–9:05)

> „I wreszcie to, co odróżnia Guidon od klasycznych narzędzi: agenci.
> Guidon wystawia dwa interfejsy z jednym wspólnym systemem uprawnień:
> **REST API** (`/api/v1` — projekty, zadania, start/complete/status,
> komentarze, próby, załączniki, kontekst, kolumny, priorytety, zdarzenia,
> moduły…) i **serwer MCP** (`/api/mcp`, Streamable HTTP) z narzędziami:
> list_projects, list_tasks, get_task, create_task, update_task,
> set_task_status, start_task, complete_task, comment_on_task,
> get_task_context, get_project_context, list_task_links, review_task_link,
> list_attempts, record_attempt, get_agent_brief, request_approval,
> list_approval_requests — łącznie około dwudziestu ośmiu.
>
> Autoryzacja: osobne **klucze API z zakresami uprawnień** — `tasks:read`,
> `tasks:write`, `comments:write`, `attempts:write` i inne. W Profil →
> Integracje → „Connect an AI app (MCP)" wybieram aplikację — Claude Code,
> Claude Desktop, Cursor, VS Code, Codex CLI czy Gemini CLI — i kreator
> generuje klucz o właściwych zakresach i gotową konfigurację dla tej
> aplikacji. Serwer MCP nie ma osobnego systemu uprawnień: każda prośba
> trafia do tych samych handlerów `/api/v1`, więc stosują się te same
> polityki RLS, te same limity i uprawnienia projektu do AI.
>
> Agenci mają **sandbox**: `POST /api/v1/sandbox` tworzy projekt
> treningowy z przykładowymi zadaniami, który można zresetować — wygodne
> do prób bez zaglądania w prawdziwe dane.
>
> Rekomendowany cykl: `get_task_context` → `start_task` → praca →
> `record_attempt` → `comment_on_task` → `set_task_status` na `review`.
> A `get_task_context` to osobne dzieło — **pakiet kontekstu** — jedna
> paczka Markdown w ograniczonym budżecie tokenów (max_tokens + focus),
> w której wszystko poza zadaniem jest **rankingowane z wagami**:
> ograniczenia projektu, zweryfikowane fakty, powiązane decyzje, PR-y,
> **nieudane próby na czele**, insighty AI. Elementy, które nie zmieściły
> się w budżecie, są wypisane z id i narzędziem do ich pobrania — agent
> może wejść za szczegółami tak głęboko, jak potrzebuje.
>
> Bezpieczeństwo treści: tekst pisany przez członków projektu nigdy nie
> staje się instrukcją dla modelu — jest opisany jako *dane*; fragmenty
> wyglądające jak prompt injection dostają jawnego ostrzeżenia „traktuj
> jako dane"; sekrety (klucze API, tokeny, JWT-y) są automatycznie
> usuwane. Wszystko pod RLS tożsamością klucza; projekt nieczytelny → 404.
>
> I wreszcie **ludzka kontrola**. Jeśli projekt nie pozwala agentowi
> zamykać zadań samodzielnie (auto-complete nie jest włączone), agent
> wywołuje `request_approval` z uzasadnieniem. W projekcie pojawia się
> zakładka **Approvals** z licznikiem — inbox, gdzie człowiek podejmuje
> *jedną* decyzję na raz: zatwierdzić albo odrzucić z komentarzem.
> Prośby wygasają po 7 dniach, a zatwierdzona akcja wykonuje się **jako
> ta osoba**. Aktywność agentów obserwujemy w **Activity**: raport
> monitoringu pokazuje liczbę zadań w review, powtórnych prób, prośb o
> zatwierdzenie i niezweryfikowanych wpisów pamięci."

### Rozdział 9 — Moduły, automatyzacje, marketplace (9:05–10:15)

> „**Własne moduły** to rozszerzalność bez kodu. Moduł to pakiet opisany
> manifestem: widoki stron (notatki, checklisty z natychmiastowym zapisem,
> linki) oraz widoki danych — **tabela, formularz, tablica (board),
> wykres i kalendarz** — nad encjami z typowanymi polami. Na instalację
> trzeba zaakceptować **pełną listę uprawnień**: to dokładnie to, co moduł
> może zrobić — i nic poza tym.
>
> Jest też **AI Module Builder**: opisujemy zwykłym językiem, czego
> potrzebujemy; AI przygotowuje **plan** (do 10 encji i 10 widoków, tylko
> pola modułowe: tekst, liczba, boolean, data, wybór). Na planie można
> zadawać pytania, a potem **go jawnie zatwierdzić** — serwer wtedy
> deterministycznie kompiluje manifest, bez drugiej rundy modelu i bez
> możliwości zmiany zatwierdzonych pól. Nic nie jest instalowane
> automatycznie: można pobrać JSON albo zainstalować.
>
> Wersja 1.x dodaje **automatyzacje**: wyzwalacz na utworzenie, zmianę
> albo usunięcie rekordu (z warunkiem „pole = wartość") oraz akcje:
> **utwórz zadanie**, **powiadom właścicieli** albo **wyślij webhooki**.
> Działa idempotentnie, z ponowieniami (1 min, 5 min, 30 min, 2 h) i
> **bez pętli** — akcje modułów nigdy nie zapisują do modułów. Dziennik
> 20 ostatnich uruchomień z przyciskiem Retry jest w konfiguracji modułu.
>
> Dla programistów jest **silnik kodu w sandbox** (engine 1.3): moduł może
> mieć skrypt JavaScript do 100 tys. znaków, wymagający uprawnienia
> `code:run`, który rysuje własny widok jako **drzewo UI** — Guidon
> renderuje je własnymi komponentami, bez HTML i bez iframe. Jest edytor
> Monaco z typami SDK oraz preview uruchamiany na danych projektu,
> bez zapisu.
>
> **Marketplace** publikuje moduły: katalog z wyszukiwarką i filtrami,
> szczegóły wersji z pełną listą uprawnień i podglądami, oraz kreator
> instalacji wymagający roli owner/admin i zatwierdzenia zakresów, ze
> sprawdzeniem SHA-256 — instaluje się dokładnie to, co przeglądano.
> *My Modules* pokazuje moje instalacje. Płatne moduły istnieją tylko
> jako projekt w dokumentacji — dziś katalog jest w całości darmowy."

### Rozdział 10 — Integracje i aplikacje (10:15–11:05)

> „**Plugins** — Guidon spotyka Was tam, gdzie pracujecie: wtyczki dla
> Unity, Unreal Engine, Godot i Blendera, rozszerzenia VS Code i JetBrains,
> aplikacja desktopowa oparta na Tauri (pobieranie z GitHub Releases)
> i aplikacja mobilna. Do tego **raporty in-game**: klucz reportera
> (zakres `reports:write`) jest wbudowany w build gry i z założenia może
> zostać wyodrębniony — dlatego może *tylko zgłaszać*, bez odczytu
> projektu. Gracz wysyła z gry tytuł, opis, metadane (build, platforma,
> scena, pozycja…) i do trzech zrzutów ekranu; w Backlogu pojawia się
> zadanie z tagiem kategorii i `in-game`, a pliki wchodzą jako
> załączniki. Jest też widget webowy.
>
> **GitHub** to połączenie dwukierunkowe: webhooki przesuwają zadania po
> commitach i PR-ach, sugerowane linki czekają na potwierdzenie, a pliki
> z repo przeglądamy w zakładce Pliki. **Discord**: projekt może wysyłać
> powiadomienia na webhook kanału; osobny bot ze slash-komendami
> /task-list, /task-start, /task-complete i /task-comment pozwala pracować
> bez przeglądarki — jest zwykłym klientem `/api/v1`, dokładnie jak agent
> AI."

### Rozdział 11 — Platforma: role, bezpieczeństwo, self-hosting, admin (11:05–11:50)

> „I platforma. Role projektu: Owner, Admin, Developer, Tester, Viewer.
> Pod spodem **70 polityk RLS w PostgreSQL** jako rzeczywista granica
> autoryzacji: nawet jeśli kod aplikacji popełni błąd, baza odmówi dostępu
> do cudzych danych. Instancja self-hosted to ten sam kod na własnym
> PostgreSQL: kompatybilność `auth.uid()` jest odtworzona lokalnie,
> storage może być lokalny — pliki z adresami podpisanymi HMAC; AI z
> **siedmiu backendów** — Anthropic, OpenAI-kompatybilne (OpenAI,
> OpenRouter, Groq, Azure, custom) albo Ollama w pełni lokalnie. Limity
> planów i rozliczenia (Stripe: checkout, webhook, promo kody) dotyczą
> chmury; self-hosted rozliczeń nie ma. Panel **admina instancji**,
> chroniony listą `ADMIN_EMAILS`, pokazuje status systemu (health
> checks), organizacje (z ręcznym nadpisaniem limitów), użytkowników,
> logi i moduły do przeglądu. Do tego usługi publiczne dla agentów:
> `/ask`, agent A2A (JSON-RPC), dokumenty `.md`/llms.txt i serwer MCP
> dokumentacji."

### Rozdział 12 — Zamknięcie (11:50–12:15)

> „Podsumowując: Guidon to tablica Kanban, która pamięta *dlaczego*;
> projekt z aktualną, źródłowaną wiedzą, z którą ludzie i agenci AI
> pracują na tych samych danych i w jednym systemie uprawnień. Jeśli
> zarządzasz projektami, w których kontekst znaczy więcej niż lista TODO,
> i chcesz wpuścić agentów tam, gdzie pracujesz — Guidon jest do tego
> zbudowany. Dziękuję i do zobaczenia w Guidonie."

---

## 2. Szczegółowy plan demonstracji

Dla każdego rozdziału: co otworzyć, którą interakcję wykonać, co ma być
widoczne na ekranie i co zostawić w narracji. Dane demo: projekt ze
szablonu, 15–20 zadań, 3 decyzje, 5–8 wpisów pamięci (w tym 2
niezweryfikowane AI i 1 oznaczony *stale*), podłączony GitHub z 1 PR,
1 moduł z marketplace i 1 moduł z automatyzacją.

### R.1 Wprowadzenie
- **Ekran:** landing (`/`) → po zalogowaniu przejście na `/dashboard`.
- **Interakcja:** przełączenie motywu jasny↔ciemny; zmiana języka EN→PL
  (całe UI zmienia język).
- **Widoczne:** wordmark Guidona, grupy globalne i rozszerzeń w pasku.

### R.2 Dashboard, My tasks, organizacje
- **Ekran:** `/dashboard` — karty projektów z kolorem i paskiem postępu,
  liczniki „otwarte" i „przeterminowane", lista nadchodzących, ostatnia
  aktywność, przypięte projekty.
- **Interakcja:** klik w przeterminowane zadanie → otwiera się szczegół
  zadania; powrót na `/dashboard`.
- **Ekran:** `/my-tasks` — praca w poprzek projektów; pokaż filtry.
- **Ekran:** `/organizations/[id]` → członkowie: zaproszenie linkiem
  (jednorazowe, ważne 7 dni, e-mailem albo do przekazania ręcznie);
  ustawienia z webhookami.

### R.3 Nawigacja modułowa
- **Ekran:** `/projects/[id]` — przegląd projektu z linkami do modułów.
- **Widoczne:** grupy nav; *Zatwierdzenia* zwykle nieobecne (porównanie
  w R.8).
- **Interakcja:** `/projects/[id]/settings` → ukrycie modułu (np.
  whiteboard) → zakładka znika z paska; przywrócenie; **ukrycie ≠
  usunięcie**.

### R.4 Tablica zadań
- **Ekran:** `/projects/[id]/work`.
- **Widoczne:** kolumny backlog / todo / in_progress / ai_working / review /
  done (plus własne), karty z miniaturą, etykietami, avatarami i badge
  liczby komentarzy.
- **Interakcje:**
  1. Przeciągnięcie zadania do In Progress.
  2. Zaznaczenie 2–3 kart → pasek działań masowych → zbiorcza zmiana
     priorytetu.
  3. Otwarcie zadania: edycja opisu, terminu, przypisania, etykiet;
     dodanie podzadania i komentarza; wklejenie obrazka ze schowka do
     załącznika; miniatura okładki karty.
  4. Panel **Why** — pochodzenie zadania.
  5. Sekcja **Attempts** — istniejąca nieudana próba z powodem.
  6. Panel **links** — sugerowany PR (confidence < 1) → *Confirm link*.
- **GitHub (drugie okno):** commit z opisem `guidon#<pierwsze 8 znaków
  id>` → po chwili tablica pokazuje nowy komentarz i przesunięcie karty
  (webhook), a w Activity widać zdarzenie.
- **Import:** przycisk *Import* → CSV z Linear → podgląd dopasowania
  (kolumny/priorytety/przypisania, wiersze niedopasowane) → import →
  natychmiastowe **Undo import**; wyjaśnienie, że edytowane przez
  człowieka zadania zostają.

### R.5 Whiteboard i planowanie
- **Ekran:** `/projects/[id]/whiteboard` — React Flow: kanwa, minimapa,
  notatki.
- **Interakcje:** dodanie dwóch notatek, połączenie krawędzią, przesunięcie
  kanwy; zaznaczenie dwóch → *convert to tasks* → modal z propozycjami
  (tytuł/opis/priorytet) → odznaczenie jednej → „utwórz zaznaczone" →
  nowa karta pojawia się w Backlogu.
- **Kalendarz:** `/projects/[id]/calendar` — zadania z terminami i fazy;
  nawigacja po miesiącach.
- **Roadmapa:** `/projects/[id]/roadmap` — fazy: status, start/end, pasek
  postępu; edycja dat.
- **Pliki:** `/projects/[id]/files` — katalogi, upload z kategorią; Monaco
  w podglądzie; `connect repo` → przeglądanie plików z GitHuba.

### R.6 Wiedza
- **Decyzje:** karty z kolorem typu i statusem; edycja z uzasadnieniem.
- **Knowledge:** źródła wiedzy + liczniki powiązań (decisions / files /
  memory).
- **References (moodboard):** przegląd referencji.
- **Technologies:** lista technologii; edycja.
- **Context:** graf relacji; dialog *Utwórz relację* (np. „wiedza
  powstała z decyzji"); wyjaśnienie: te relacje sterują rankingiem w
  pakiecie kontekstowym.

### R.7 Pamięć i brief
- **Ekran:** `/projects/[id]/memory`.
- **Widoczne:** wpisy fakt / AI insight; status: zweryfikowany, `stale`,
  „wymaga przeglądu" z nazwą decyzji.
- **Interakcje:**
  1. Ręczne utworzenie wpisu (typ fact).
  2. *Generate Insight* (AI).
  3. **Accept** jednego niezweryfikowanego insightu (staje się faktem);
     drugi **Reject**.
- **Tablica:** ukończenie zadania → po chwili w pamięci pojawia się nowy
  AI-insight powiązany z zadaniem; ponowne otwarcie — wniosek wycofany.
- **Ekran:** `/projects/[id]/brief` — wersjonowany brief; każda linia ma
  źródło `_[…]_`; edycja + przycisk **Approve** (owner/admin).

### R.8 Agenci
- **Ekran:** `/profile` → Integracje → *Connect an AI app (MCP)* — wybór
  aplikacji (Claude Code/Desktop, Cursor, VS Code, Codex CLI, Gemini CLI,
  Other); klucz z zakresami `tasks:read tasks:write tasks:status
  comments:write attempts:write`; gotowa konfiguracja aplikacji. Poza tym
  karta **API Keys** (klucze ręczne).
- **Terminal 1 — MCP z Claude Code:**
  ```bash
  claude mcp add --transport http guidon https://<host>/api/mcp \
      --header "Authorization: Bearer guidon_<key>"
  ```
  W Claude Code:
  - „sprawdź sandbox Guidona i wypisz zadania" → *list_projects* →
    pierwsze wywołanie tworzy sandbox (`POST /api/v1/sandbox`); pokaż
    board_url.
  - „weź zadanie, przeczytaj kontekst, zacznij, zapisz próbę z
    niepowodzeniem i przenieś do review" → obok ekran tablicy: karta
    przechodzi **AI Working → Review**; w zadaniu komentarz i próba.
- **Terminal 2 — REST:** `GET /api/v1/tasks/<taskId>/context?max_tokens=4000`
  → fragment Markdowna (ranking, oznaczenia stale, stopka z listą
  elementów).
- **Terminal 3 — approvals:** `request_approval` (klucz bez pozwolenia
  complete) → w projekcie pojawia się **Approvals** z badge → inbox,
  pojedyncza prośba autorstwa agenta → *Approve* → akcja wykonuje się
  **jako człowiek** → tablica: Done. Potem `list_approval_requests`.
- **Ekran:** `/projects/[id]/activity` → raport **Agent monitoring**
  (zadania w review, powtórne próby, prośby o zatwierdzenie,
  niezweryfikowana pamięć); wejdź w zadanie → sekcja **App changes**
  (czym agent edytował).

### R.9 Moduły
- **Ekran:** `/projects/[id]/modules` — przyciski *Open* i *Configuration*
  na każdej karcie; przyciski **Templates** (Release checklist, Research
  hub, Release planning), **Import JSON**, **Browse Marketplace**,
  **AI Module Builder**.
- **Interakcje:**
  1. Instalacja szablonu `Release planning` → zatwierdzenie permissions →
     moduł dostaje zakładkę w pasku.
  2. Widoki: Releases (table) → New release (form) → board → chart →
     calendar; dodanie rekordu w formularzu; natychmiastowa zmiana na
     tablicy (board) i w tabeli.
  3. *Configuration* → automations (trigger record.created + `create_task`) —
     zapisanie rekordu z polem severity = high → zadanie pojawia się w
     Backlogu; pokazanie 20 runów z przyciskiem Retry.
  4. Sekcja **Code** (engine 1.3): Monaco z typami SDK; preview bez
     zapisu; włączenie `code:run` wymaga wyraźnego checkboxa.
  5. AI Module Builder: opis „planowanie konferencji: sponsorzy (firmy),
     budżet, termin; widoki: tabela + formularz" → PLAN (encje, pola,
     permissions) → **Approve & compile** → **Download JSON**.
- **Ekran:** `/marketplace` — wyszukiwarka, filtry, szczegóły wersji,
  kreator instalacji (owner/admin; scopes; SHA-256).
- **Ekran:** `/my-modules` — moje instalacje (do 200) z linkiem do
  projektu.

### R.10 Integracje
- **Ekran:** `/plugins` — 6 wtyczek (Unity, Unreal, Godot, Blender, VS Code,
  JetBrains) + karta **Desktop** z pobieraniem z Releases; instrukcje
  instalacji dla każdej.
- **In-game report (demo):** wtyczka Unity w buildzie → widget raportu
  → tytuł, opis, kategoria *bug* → wyślij → w Backlogu zadanie z tagiem
  `in-game` i załącznikami; komentarz: klucz `reports:write` może tylko
  zgłaszać.
- **GitHub:** connect-repo w plikach + zdarzenia w Activity (opisane w R.4).
- **Discord:** ustawienia projektu → webhook kanału Discord (pokaż
  powiadomienie po przesunięciu zadania); oddzielna usługa bota
  slash-commands.

### R.11 Platforma
- **Ekran:** `/profile` — profil, AI preferences, API keys.
- **Ekran:** `/upgrade` (chmura) — plany, Stripe, promo codes; wskaż, że
  na self-hosted tego nie ma.
- **Ekran:** `/admin` (tylko przy `ADMIN_EMAILS`) — System status z
  health-checks; `/admin/organizations` (nadpisanie planów/limitów).
- **Ekran:** `/sandbox` — publiczna dokumentacja sandbox API.

### R.12 Zamknięcie
- **Ekran:** powrót na `/dashboard`; CTA: useguidon.com, przewodnik
  self-hostingu, portal `/developers`, instalacja umiejętności
  `npx skills add two-steps-studio/guidon`.

---

## 3. Checklista pokrycia (inwentarz rzeczywisty)

Legenda: ✅ wdrożone · 🟡 wdrożone z warunkiem (AI włączone / konkretna
rola / moduł / opcja operatora) · 🔒 dostęp ograniczony (chmura /
`ADMIN_EMAILS` / wyspecjalizowany klucz) · 🧪 zaprojektowane, ale **nie
czynne / placeholder** · [R.x] — rozdział narracji.

### Globalne

| Obszar | Stan | Uwagi | Rozdz. |
|---|---|---|---|
| Strony publiczne: landing, About, Pricing, Contact, Legal, Brand (z alternatywami `.md`) | ✅ | | R.1 |
| Konta: email+hasło; Google/GitHub/Discord/GitLab/OIDC (self-host — konfig. w czasie działania) | ✅ | niekonfigurowany provider = brak przycisku | R.1 |
| Motywy i 4 języki (EN/PL/DE/ES) | ✅ | next-intl | R.1 |
| Dashboard (otwarte/przeterminowane, nadchodzące, aktywność, karty postępu, pinning) | ✅ | | R.2 |
| My tasks | ✅ | | R.2 |
| Projekty, pinning, przełącznik projektów | ✅ | | R.2–3 |
| Organizacje: członkowie, zaproszenia linkiem (1 użycie / 7 dni), settings, AI accounts, billing (chmura), webhooks | ✅ | | R.2, R.11 |
| Upgrade / plany / Stripe / promo kody | 🔒 chmura | self-hosted nie rozlicza | R.11 |
| Plugins (Unity, Unreal, Godot, Blender, VS Code, JetBrains, Desktop) | ✅ | catalog.json; zipy budowane w prebuild | R.10 |
| Marketplace i My modules | ✅ | moduły płatne = 🧪 projekt | R.9 |
| Profil: profil, avatar, AI preferences, API keys, connected apps (MCP), usunięcie konta | ✅ | | R.8, R.11 |
| Oferta agentowa: `/developers`, llms.txt, `/ask`, agent A2A (JSON-RPC), docs MCP, `.well-known/agent-*`, skills | ✅ | | R.8 |
| Sandbox (tworzenie własnego projektu i reset) | ✅ | | R.8 |
| Feedback (dialog w stopce) | ✅ | admin widzi `/admin/feedback` | R.11 |
| Panel admina `/admin/*` (status systemu, orgs z nadpisaniem limitów, users, logs, integrations, feedback, funnel, search quality, promo codes, billing prices, module review) | 🔒 `ADMIN_EMAILS` | jedyna rola z zapisem: organizations | R.11 |

### Moduły projektu

| Obszar | Stan | Uwagi | Rozdz. |
|---|---|---|---|
| Przegląd projektu | ✅ | | R.3 |
| Tablica: kolumny (nadpisywalne, własne), drag&drop, bulk, filtry | ✅ | | R.4 |
| Zadania: opis, priorytet, termin, przypisanie, etykiety + presety, podzadania, komentarze, załączniki (paste, okładka), cykliczność, przypięte karty | ✅ | | R.4 |
| Panel **Why** (pochodzenie) + **App changes** (edycje agenta) | ✅ | | R.4, R.8 |
| Attempts i task links (GitHub; sugestie kontra potwierdzone) | ✅ | | R.4 |
| Relacje między zadaniami | ✅ | | R.4 |
| AI task chat (proponuje, człowiek zatwierdza) | 🟡 | wymaga providera i włączonego AI w projekcie; historia bez persystencji | R.4 |
| Import zadań (Jira/Linear/Trello/Asana/ClickUp/Notion/CSV/JSON; podgląd, duplikaty; ≤1000; 5 MB) | ✅ | undo dostępny dla owner/admin | R.4 |
| Whiteboard (React Flow, zapis, minimapa; propozycje AI z zaznaczeń) | ✅ (AI 🟡) | | R.5 |
| Kalendarz (miesiąc: zadania i fazy) | ✅ | | R.5 |
| Roadmapa (fazy: status, daty, postęp) | ✅ | | R.5 |
| Pliki (upload, kategorie, Monaco, connect-repo) | ✅ | StorageProvider Supabase/local; **S3 = 🧪 placeholder** | R.5 |
| Knowledge (źródła + liczniki powiązań) | ✅ | | R.6 |
| Decisions (typy, statusy, uzasadnienia) | ✅ | | R.6 |
| References / Moodboard | ✅ | | R.6 |
| Technologies | ✅ | | R.6 |
| Graf kontekstu (relacje między encjami) | ✅ | | R.6 |
| Memory (fakt vs AI insight; Accept/Correct/Reject; Generate Insight; stale; requires review; auto-learning po ukończeniu) | 🟡 | AI wymaga providera; auto-learning ciche, z limitami; wycofanie po otwarciu ponownym | R.7 |
| Agent brief (wersjonowany, z pochodzeniem linii, zatwierdzanie) | ✅ | | R.7 |
| Members i role (Owner/Admin/Developer/Tester/Viewer) | ✅ | | R.2, R.11 |
| Approvals (complete_task / delete_task) | 🟡 | pojawia się dopiero przy prośbie; wygasanie 7 dni | R.8 |
| Activity + Agent monitoring | ✅ | | R.8 |
| Ustawienia projektu (moduły on/off, kolumny, uprawnienia AI, etykiety) | ✅ | | R.3 |
| Własne moduły (templates, page i data views, manifest v1, limit 20 modułów, import/export, lifecycle z zachowaniem danych) | ✅ | | R.9 |
| Automatyzacje modułów (trigger + create_task/notify/webhook; retry; dedupe; bez pętli; run log) | ✅ | engine 1.2 | R.9 |
| Modułowy silnik kodu (sandbox, custom view, Monaco + SDK, `code:run`) | ✅ | engine 1.3; kod z marketplace read-only | R.9 |
| AI Module Builder (plan → approve → deterministyczny kompilat) | 🟡 | wymaga providera; w v1 brak relacji między encjami i integracji zewn. | R.9 |
| Marketplace install (kreator, SHA-256, zezwolenie na scope'y) | ✅ | | R.9 |

### API, agenty i integracje

| Obszar | Stan | Uwagi | Rozdz. |
|---|---|---|---|
| REST API `/api/v1` (tasks CRUD, start/complete/status, comments, attempts, links, attachments, context, brief, columns, priorities, events, decisions, knowledge, memory, modules+runs, reports, references, roadmap, technologies, import, batch, jobs, account, me, search, sandbox) | ✅ | klucze z zakresami; polityki RLS | R.8 |
| Serwer MCP (`/api/mcp`) — ok. 28 narzędzi (list_projects, list_tasks, get_task, create_task, update_task, set_task_status, start_task, complete_task, comment_on_task, get_task_context, get_project_context, list_task_links, review_task_link, list_attempts, record_attempt, get_agent_brief, request_approval, list_approval_requests, list_events, list_columns, list_priorities, narzędzia załączników, moduły) | ✅ | dispatch do `/api/v1` — te same uprawnienia, limity, RLS | R.8 |
| Kreator „Connect an AI app (MCP)" w profilu (Claude Code/Desktop, Cursor, VS Code, Codex CLI, Gemini CLI, Other) | ✅ | | R.8 |
| OAuth dla agentów (DCR `/oauth/register`, authorize, token, revoke; `.well-known/oauth-*`, JWKS directory, MCP protected resource) | ✅ | | R.8 |
| `service_auth` (ceremonia agenta zatwierdzana przez człowieka) | 🟡 | opt-in operatora; bez klucza podpisującego **wyłączony** i niewidoczny w discovery | R.8 |
| Skills (skills.sh; `.well-known/agent-skills/guidon-tasks/SKILL.md`) | ✅ | | R.8 |
| GitHub integration (connect, webhooki `guidon#…` w commit/PR/branch, sugestie połączeń, pliki z repo) | ✅ | | R.4, R.10 |
| Webhooki organizacji (task.created / status_changed / completed; module.automation; ping; retries) | ✅ | | R.9, R.10 |
| Discord (powiadomienia projektowe + bot slash-commands jako osobna usługa) | ✅ | | R.10 |
| In-game reports (klucz tylko `reports:write`, ≤3 pliki, kategorie bug/crash/feedback, widget webowy z CORS, rate limit) | ✅ | | R.10 |
| Aplikacje: desktop (Tauri), mobile (Expo) | ✅ | dostępne w repo, osobne wdrożenia | R.10 |
| S3 storage provider | 🧪 | interfejs zarezerwowany; rzuca „not implemented" | R.5 |
| Płatne moduły (monetizacja marketplace) | 🧪 | design only; nic nie obciąża | R.9 |
| Licencja aplikacji | ⚠️ | jawnie **nie rozstrzygnięta** (MIT tylko sdk-js / CLI / python) | — |

### Jakość i obserwowalność

- Suite'y `npm run test:*` (db/PGlite, auth, ai, limits, reports, github,
  webhooks, agent-evidence, context pack, search, modules, billing, e2e
  izolacja, perf budgets) oraz `npm run verify:agent-readiness`.
- Sentry (spany `timeAction` na akcjach tablicy i wywołaniach AI), PostHog,
  logi OTel; `/api/health` (db / storage / auth / ai) z ochroną przed
  wyciekami (`safeReason`).

---

## 4. Funkcje różnicujące — głębszy opis

### 1. Engine kontekstu — „Context Pack"

**Problem.** Agent wrzucony „na zimno" w projekt bez konwencji, decyzji
i historii nieudanych prób powtarza te same błędy.

**Dostęp.** `GET /api/v1/tasks/{id}/context`, w MCP `get_task_context`;
przycisk *Copy agent context* w widoku zadania (budżet 16 000 tokenów).

**Jak działa.** Jedna paczka Markdown w ograniczonym budżecie tokenów.
Samo zadanie zajmuje do ~60% budżetu; cała reszta jest **rankingowana
z wagami**: ograniczenie/reguła 100 · powiązana decyzja 95 · nieudana
próba 90 · zweryfikowany fakt 80 · related decision 75 · PR 70 ·
plik/udana próba 60 · źródło wiedzy 55 · AI insight 40 · inne wpisy
pamięci 30. Podobieństwo słów z tytułem, opisem i fokusem dodaje do +20;
wiek kosztuje aż −20 (30 dni = −1); ograniczenia się nie starzeją.
Elementy, które nie mieszczą się w budżecie, są wypisane per sekcja z id
i **narzędziem, którym agent może je pobrać**. Każdy wpis ma wiek
(`3d ago`, `5mo ago`) i oznaczenie *stale* po progu zależnym od rodzaju
(60 dni dla niezweryfikowanej AI, 180 dla decyzji i prób, 365 dla
zweryfikowanych faktów; ograniczenia nigdy). Wpisy powiązane ze zmienioną
decyzją dostają markę *wymaga przeglądu*, wprost wymieniając decyzję i datę.

**Bezpieczeństwo.** Tekst członków projektu jest traktowany jako **dane**,
nie instrukcje: nagłówki, kod fenced i HTML nie zafałszują struktury
paczki; treści wyglądające jak atak na prompt są przekazywane z jawną
adnotacją „traktuj jako dane". Sekrety (klucze Stripe, GitHub, AWS,
Slack, OpenAI, Anthropic, JWT-y, wartości `password:`/`token=`) są usuwane
przed wydaniem. Wszystkie zapytania idą jako użytkownik klucza pod RLS;
nieczytelny projekt → 404; klucz z zakresem `reports:write` → 403; brak
cache wspólnego dla użytkowników.

**Wartość.** Jednym wywołaniem agent wie tyle, co junior developer po
przyjęciu do projektu — i nie powtarza wcześniejszych błędów.

### 2. Ludzka kontrola agentów: approvals + monitoring + AI auto-complete

**Problem.** Zamykanie i usuwanie zadań przez agenta nie powinno być
domyślnie dostępne.

**Dostęp.** MCP `request_approval` / `list_approval_requests`; w projekcie
zakładka **Approvals** (pojawia się po pierwszej prośbie, z licznikiem w
pasku); raport **Agent monitoring** w Activity; sekcja **App changes** w
zadaniu.

**Jak działa.** `complete_task` działa tylko, gdy projekt włączył
AI auto-complete dla zadań; w przeciwnym razie agent prosi człowieka
(`request_approval` z krótkim uzasadnieniem). W inboxie jest **jedna
prośba na raz** — celowo bez akcji zbiorczych: każda prośba dotyczy
osobnej decyzji i wymaga osobnej oceny. Zatwierdzona akcja wykonuje się
**jako ta osoba** (np. complete jako właściciel). Odrzucenie niczego
nie zmienia. Prośby wygasają po 7 dniach. `delete_task` wymaga osobnego
potwierdzenia. Monitoring w Activity zbiera: zadań w review, powtórnych
prób, prośb o zatwierdzenie i liczby niezweryfikowanej pamięci — sygnały
zdrowia współpracy z agentami w jednym miejscu.

### 3. Pamięć projektu: fakty kontra AI insights

**Problem.** Wiedza zespołu ginie w komentarzach i z czasem się starzeje;
agent dowiaduje się z niej, ale musi mieć widoczną decyzję człowieka.

**Dostęp.** Zakładka **Memory**; auto-learning po ukończeniu zadania;
przycisk *Generate Insight*; ręczne utworzenie wpisu.

**Jak działa.** Wpisy AI lądują w kolejce **Accept / Correct / Reject**
powiązanej z zadaniem i (opcjonalnie) źródłami. Po zatwierdzeniu stają się
**faktami** i wchodzą do pakietu kontekstowego. Każdy wpis pokazuje stan
(zweryfikowany / stale / „wymaga przeglądu"); marka „wymaga przeglądu"
pojawia się, gdy powiązana decyzja (w relacji w obu kierunkach) zmieniła
się po utworzeniu powiązania. Auto-learning: AI po **ukończeniu** zadania
czyta opis, komentarze i próby i proponuje 1–2 fakty do kolejki; jeśli
zadanie zostanie ponownie otwarte albo usunięte, oczekujące wnioski są
**wycofywane** (migration 098); przy kolejnym ukończeniu uczy się
znowu.
Po przekroczeniu godzinowego limitu na projekt AI po prostu odpuszcza
(ciche wyłączenie). Bez providera zostaje ręczne tworzenie wpisów;
kolejka Accept/Correct/Reject istnieje zawsze.

### 4. Brief agenta: wersjonowany, z pochodzeniem linii

**Problem.** „Onboarding" agenta wymaga spójnego, zatwierdzonego
kontraktu (cel, stack, zasady, dozwolone akcje), a nie zbierania tego
z komentarzy.

**Dostęp.** Zakładka **Agent brief**; narzędzie MCP `get_agent_brief`
(odczyt dowolnej wersji historycznej).

**Jak działa.** Edycja tylko dla owner/admin; każda wersja ma
`approved_by`; **każda linia mówi, skąd pochodzi** — `_[…]_`; linie
„unverified" i „dodane ręcznie" są rozróżnialne i jawne. Zalecane
pierwsze czytania agenta: brief, potem `get_task_context`.

### 5. Moduły: deklaratywny runtime + silnik kodu + automatyzacje + AI builder

**Problem.** Zespół potrzebuje własnych, małych narzędzi — od checklist
po planowanie wydania — bez budowania osobnej aplikacji.

**Dostęp.** Zakładka **Modules**: szablony, import JSON, AI builder,
marketplace; każdy moduł dostaje własną zakładkę w pasku.

**Jak działa.** Manifest v1 opisuje: id, wersje silnika, encje z
typowanymi polami (tekst, liczba, boolean, data, wybór, URL) i widoki:
**page** (notatki, checklisty z natychmiastowym zapisem, linki),
**table**, **form**, **board**, **chart**, **calendar**. Renderowanie
wyłącznie przez stały zestaw elementów React — bez HTML, skryptów i
ramek. Limit 20 modułów na projekt; dane modułu trzymają się w osobnych
rekordach, nie w manifestie — przy aktualizacji wersji zostają;
odinstalowanie zachowuje dane (read-only + eksport). **Automatyzacje:**
wyzwalacz record.created / updated / deleted z warunkiem na pole; akcje
`create_task`, `notify` (właściciele/adminowie), `webhook` — idempotentne
(dedupe per run), z ponowieniami 1/5/30/120 min (cron) i **bez pętli** —
akcje modułów nie zapisują do modułów; dziennik 20 runów z przyciskiem
Retry. **Silnik kodu (engine 1.3):** skrypt do 100 tys. znaków z
uprawnieniem `code:run`, rysujący **drzewo UI**; Guidon renderuje
własnymi komponentami (bez HTML, iframe i wywołań sieciowych); Monaco
z typami SDK (`guidon.module({ render, onAction })`), preview bez zapisu;
pierwszy zapis wymaga wyraźnego checkboxa. **AI builder:** opis → plan
(do 10 encji i 10 widoków, tylko lokalne pola) → jawnie approve →
deterministyczna kompilacja manifestu (bez drugiego wywołania modelu —
zatwierdzone pola się nie zmieniają) → pobranie JSON albo instalacja z
zatwierdzeniem uprawnień. Ograniczenie jawne: relacje między encjami są
nieobsługiwane — model ma dopytywać, nie symulować implementacji.

### 6. Zadania ↔ kod (GitHub) i raporty in-game

**Problem.** Statusy zadań i PR-ów rozejdą się w czasie; bugi zgłaszane
przez graczy z poziomu gry rzadko docierają do zespołu.

**Dostęp.** Panel **links** na zadaniu; połączenie GitHub (connect),
webhooki repo; wtyczki Unity/Unreal/Godot z reportami.

**Jak działa.** Odwołanie `guidon#<pierwsze 8 znaków>` albo
`guidon-1a2b3c4d` w komunikacie commitu, treści PR-a czy nazwie branchy →
webhook Guidona (weryfikacja podpisu; klucz idempotentności — to samo
zdarzenie nie zadziała drugi raz) **komentuje i przesuwa zadanie**: PR →
review, merge → done, z warunkami „z jakiego statusu"; akcja niczego nie
zmienia, gdy zadanie jest już w stanie docelowym. Sugerowane powiązania
(podobieństwo słów) **oczekują na przegląd** — człowiek potwierdza albo
odrzuca (`review_task_link`), zawsze z widocznym dowodem i pewnością
(confidence < 1). Ponadto **raport in-game** (Unity/Unreal/Godot): klucz
`reports:write` może **tylko zgłaszać** (brak odczytu projektu);
multipart z tytułem, opisem, kategorią (bug/crash/feedback), metadanymi
i do 3 plików; CORS dla widgetu webowego; limit liczby zgłoszeń względem
klucza. W Backlogu powstaje zadanie z tagiem kategorii i `in-game`,
pliki jako załączniki.

---

## 5. Podsumowanie końcowe

**Co jest (stan implementacji).** Kompletne zarządzanie projektami:
tablice Kanban z konfigurowalnymi kolumnami, podzadania, komentarze,
załączniki (z wklejaniem obrazków), etykiety z presetami, akcje masowe,
import z Jira/Linear/Trello/Asana/ClickUp/Notion z podglądem i undo,
cykliczność zadań, kalendarz, roadmapa, pliki z przeglądarką Monaco i
przeglądem repo GitHuba, członkowie z pięcioma rolami, zaproszenia
linkiem, motywy i 4 języki — oraz **warstwa kontekstu** jako rdzeń:
decyzje, wiedza, moodboard, technologie, graf relacji, pamięć projektu.
Pełna współpraca z agentami: REST API, serwer MCP (~28 narzędzi),
jednoklikniany wizard dla Claude/Cursor/VS Code/Codex/Gemini, sandbox,
OAuth z DCR, (opt-in) `service_auth`, **decyzje człowieka w approvals**,
monitoring agentów w Activity i sekcja „App changes". Elastyczność:
własne moduły (szablony, widoki danych, automatyzacje z idempotentnym
retry, silnik kodu w sandbox, AI builder, marketplace z SHA-256 i jawną
listą uprawnień). Ekosystem: wtyczki Unity/Unreal/Godot/Blender/IDE,
desktop (Tauri), mobile (Expo), raporty in-game, webhooks, Discord.
Chmura: Stripe, promo kody, admin panel z planami; self-hosted: własny
PostgreSQL z identycznymi politykami RLS, storage lokalny, AI lokalne
(Ollama).

**Co odróżnia Guidona.** To nie „Kanban z botem w zakładce AI", ale
projekt, który **przechowuje i weryfikuje wiedzę o tym, dlaczego** —
i wystawia ten sam kontekst ludziom i maszynom przez jedno API z tymi
samymi uprawnieniami: decyzje i zweryfikowane fakty mają pierwszeństwo,
a nieudane próby pojawiają się u góry — najpierw nauka z błędów.
Kontekst jest budżetowany tokenami, ważony, z oznaczeniami świeżości
i automatyczną redakcją sekretów; agent ma do dyspozycji pętlę narzędzi,
ale granice wyznaczają ludzie (approvals, review linków, weryfikacja
pamięci) i RLS.

**Dla kogo.** Zespoły dev i game-dev (integracje silnikowe, raporty
z gry, przegląd kodu z taskami); produkty multidyscyplinarne (decyzje,
moodboard, technologie, moduły); organizacje zarządzające wiedzą (pamięć
z akceptacją, brief z pochodzeniem linii, graf relacji); zespoły
wdrażające agentów AI (MCP, API, approvals, sandbox do prób); oraz
operatorzy wymagający self-hostingu (własny PostgreSQL, lokalny storage,
lokalne AI przez Ollama).

**Jasne ograniczenia (stan implementacji).** Provider S3 — interfejs
gotowy, implementacji brak (jawnie rzuca „not implemented"). Płatne
moduły — projekt „design only", nic nie obciąża. AI Module Builder v1
nie obsługuje relacji między encjami ani integracji zewnętrznych.
Historia czatu AI tablicy nie jest przechowywana. Licencja aplikacji
nie jest finalnie ustalona (jawnie wskazana w README; MIT tylko
sdk-js/CLI/python). Bot Discord, desktop i mobile to osobne wdrożenia.
`service_auth` jest domyślnie wyłączony i wymaga klucza podpisującego
oraz migracji. Funkcje AI wymagają providera; bez niego przyciski
generowania się nie pokazują.

---

*Źródło: analiza kodu `src/app`, `src/lib`, `src/components`, dokumentacji
`docs/*`, testów `tests/*`, katalogu `plugins/*` oraz `desktop/`,
`mobile/`, `discord-bot/`; stan repo `main`, październik 2026. Weryfikację
na żywo można kontrolować przez `npm run test:*` i `GET /api/health`.*
