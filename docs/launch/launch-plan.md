# Plan premiery darmowej bety

Guidon task `5020258d`. Wynika z decyzji „Zasada fokusu: jak coś jest do
wszystkiego, to jest do niczego” (Guidon → Decyzje), doprecyzowanej
2026-10-28: Guidon jest **przede wszystkim dla ludzi**, a AI to opcja z wieloma
sposobami podpięcia. Mówimy jedną rzecz:

> **One board for your team's work. Your AI can help too.**
> Plan, assign and finish tasks together, with the decisions and history
> behind each one kept right next to it. When you want help, connect Claude,
> ChatGPT, Cursor, Codex or any MCP app: it works from the same tasks, and
> you review what it does.

Na stronie głównej AI ma własną sekcję „Works with the AI you already use”
(aplikacje MCP, REST API i webhooki, GitHub, agenci w przeglądarce, czat z
własnym kluczem), ale nie jest obietnicą z nagłówka.

W miejscach dla ludzi pracujących z AI (r/ClaudeAI, Discordy Claude
Code/Cursor, Show HN) posty niżej nadal zaczynają od agenta, bo tam to jest
powód kliknięcia. Na landingu i w ogólnych miejscach zaczynamy od zespołu.

Nie reklamujemy modułów, marketplace'u ani sandboxa. Istnieją, ale nie są
powodem rejestracji. Kto o nie zapyta, dostaje odpowiedź w komentarzu.

## Warunki startu (wszystkie muszą być spełnione)

1. Produkcja działa, zgodnie z zadaniem `f141afb1`:
   - migracje i ich historia sprawdzone;
   - maile wychodzą;
   - Sentry i uptime są ustawione.
2. PR #88 jest na produkcji: przycisk „Connect your agent”, zadania startowe
   i nowy landing.
3. Pilot (`616a71da`, scenariusz w [pilot.md](./pilot.md)) przeszedł:
   - co najmniej 3 z 5 osób doszły od rejestracji do pierwszego zadania
     zrobionego przez agenta w Review w mniej niż 10 minut;
   - poprawki P0 są zrobione.
4. Jest 30-sekundowe nagranie: prawdziwy agent bierze zadanie startowe
   „write down what this project is” i oddaje je do Review. Bez montażu
   udającego szybkość. Wolne fragmenty wycinamy i podpisujemy „(skipped 40 s)”.

Płatne plany nie są warunkiem startu. Startujemy jako darmowa beta. Konto
płatności zakłada osoba dorosła i dopiero potem włączamy ceny.

## Kto publikuje

Posty publikuje właściciel. Jeśli regulamin miejsca wymaga konta osoby
dorosłej albo firmy, publikuje rodzic lub opiekun, ewentualnie z konta firmy.
Przed każdym postem trzeba przeczytać zasady konkretnego miejsca, bo zmieniają
się częściej niż ten dokument:
- autopromocja;
- wymagany wiek konta lub karma;
- dni, w które wolno pokazywać projekty.

Nie kupujemy głosów, nie prosimy znajomych o upvote'y i nie publikujemy z
wielu kont. To łamie zasady prawie wszędzie i kończy się banem domeny.

## Kalendarz (2 tygodnie od dnia startu D)

| Dzień | Gdzie | Co | Uwagi |
|---|---|---|---|
| D-3 | Discordy/fora Claude Code, Cursor i Codex (kanały „showcase”, jeśli są) | Krótki post + GIF, prośba o feedback | Testujemy, czy przekaz jest jasny. Pytania z komentarzy dopisujemy do FAQ |
| D | Show HN | Post „Show HN” (niżej) | Najlepiej we wtorek–czwartek rano czasu US East. Przez pierwsze 3 h odpowiadać na każdy komentarz |
| D | X / Bluesky | Wątek z nagraniem | Link do strony, nie do rejestracji |
| D+1 | r/ClaudeAI | Post „I built…” (niżej) | Sprawdzić, czy subreddit ma dzień lub flair na projekty |
| D+3 | r/ChatGPTCoding albo r/cursor | Ten sam post, dopasowany do narzędzia | Najpierw instrukcja dla tego narzędzia, potem link |
| D+5 | r/gamedev / r/IndieDev | Tylko w wątkach, gdzie wolno pokazywać narzędzia | Kąt: „solo dev z agentem AI, który pamięta decyzje projektu” |
| D+7 | Post „co zadziałało, co nie” | Liczby z `/admin/funnel` | Uczciwe liczby, także słabe |
| D+8–14 | Odpowiedzi, poprawki z feedbacku | — | Reklamy (`0d072e51`) dopiero po tym, jeśli lejek działa |

## Cel i jak mierzymy

Mierzymy w `/admin/funnel`:
- kohorta tygodniowa;
- kliknięcia `hero-start` i `how-start`.

| Krok | Cel po 14 dniach |
|---|---|
| Rejestracje | 100 |
| Projekt utworzony | 70 |
| Agent podłączony (krok „connected integration”) | 20 |
| Wraca w drugim tygodniu | 10 |

Jeśli rejestracji jest dużo, a podłączonych agentów mało, problemem jest
onboarding, nie zasięg. Wtedy poprawiamy przycisk i zadania startowe, a nie
publikujemy więcej.

## Odpowiadanie na komentarze

- Każde pytanie dostaje odpowiedź w ciągu 24 h przez pierwszy tydzień.
- Błąd zgłoszony w komentarzu dostaje własne zadanie w Guidonie (tytuł +
  link do komentarza). Odpowiadamy „dzięki, zapisane”, bez obietnic terminu.
- Prośba o nową funkcję trafia do Backlogu, zgodnie z zasadą fokusu. Do
  pierwszych 100 aktywnych użytkowników niczego takiego nie implementujemy
  od razu.
- Krytyka przekazu („to tylko Trello z API”) to cenna informacja. Zapisujemy
  ją w pamięci projektu jako obserwację.

## Teksty

Wszystko po angielsku. Bez superlatywów i porównań, których nie umiemy
udowodnić.

### Show HN

**Title:** Show HN: Guidon – a task board your AI coding agent works from

**Body:**

> I kept losing context between sessions with Claude Code: every new session
> I re-explained what the project is, what we decided last week and which
> approach already failed. So I built Guidon, a task board the agent itself
> reads and updates over MCP.
>
> You connect Claude Code, Codex or Cursor (one command for Claude Code,
> a JSON snippet for the others). The agent lists tasks, calls
> get_task_context and gets the task plus the decisions behind it, project
> rules, memory and previous attempts - within a token budget, with secrets
> redacted. When it's done it records what it tried and moves the task to
> Review; you decide what's done.
>
> It's a free beta. Self-hosting works too (Postgres or Supabase). I'd love
> feedback on the onboarding: from sign-up to the first task your agent hands
> back - where did you get stuck?
>
> https://useguidon.com

### r/ClaudeAI (i podobne)

**Title:** I made a task board that Claude Code reads and updates itself (free beta)

> Every new Claude Code session I had to re-explain the project. Now Claude
> takes the next task from a board, reads the decisions, project rules and
> what was already tried, does the work and moves the task to Review with a
> summary.
>
> Setup: `claude mcp add --transport http --scope user guidon https://useguidon.com/api/mcp --header "Authorization: Bearer <key from the Connect your agent button>"`,
> then ask it: "take the highest-priority task from To do in my Guidon project".
>
> New projects can start with three starter tasks for the agent (write down
> what the project is, propose the next 5 tasks, make one small fix), so you
> see it working in a few minutes.
>
> Free beta, feedback very welcome - especially what was confusing.
> [30 s video]

### X / Bluesky (wątek)

1. Hand the task to your AI agent. It already knows the project. [wideo]
2. Guidon is a task board Claude Code / Codex / Cursor read and update over
   MCP. Each task comes with the decisions, rules, memory and failed
   attempts behind it.
3. Connect in two minutes, ask your agent to take the next task, review
   what it hands back. Free beta: https://useguidon.com

### Discord (krótko, D-3)

> Built a board that Claude Code takes tasks from over MCP - with the
> project's decisions and earlier attempts as context, so it doesn't repeat
> what already failed. Free beta, looking for 5 people to try the onboarding
> and tell me where it's confusing: https://useguidon.com

## Czego nie robimy na starcie

- Płatnych reklam przed sprawdzeniem lejka.
- Product Hunta, chyba że osoba dorosła prowadzi konto i jest czas na cały
  dzień odpowiadania. To duży jednorazowy strzał, lepiej go oddać, gdy
  onboarding jest dopracowany.
- Obietnic funkcji, których nie ma (Unity/Blender, autonomiczne studio,
  płatny marketplace).
