#!/usr/bin/env node
/**
 * Seed demo dla walkthrough Guidon (guidon-walkthrough-pl.md).
 *
 * Tworzy organizację i projekt demo z pełnym zestawem danych, by każdy
 * rozdział prezentacji dalo się nagrać „na żywo":
 *
 *   R.4 tablica: 18 zadań w szufladach + 2 podzadania, komentarze,
 *       nieudana próba (attempt), potwierdzony commit i sugerowany PR
 *   R.5 whiteboard z 3 notatkami i krawędzią; roadmapa z 2 fazami
 *   R.6 decyzje (3), źródła wiedzy (2), technologie (4), moodboard (2
 *       placeholdery — nagrywając, wgraj prawdziwe obrazy przez UI)
 *   R.7 pamięć: zweryfikowany fakt, reguła, ograniczenie i 2 insighty AI
 *       (jeden z datą -100 dni → marka „stale"), relacje kontekstu
 *   R.8 brief agenta (wersja 1, zatwierdzony)
 *   R.9 moduł „release-planning" (manifest z examples/module-manifests,
 *       rozszerzony o automatyzację create_task) z 2 rekordami.
 *
 * Tryb: wyłącznie self-hosted (DATABASE_URL). Nie używaj na Guidon Cloud.
 *
 * Użycie:
 *
 *   DATABASE_URL=... node scripts/seed-walkthrough-demo.mjs --email ja@example.com
 *   node scripts/seed-walkthrough-demo.mjs --email ja@example.com --reset
 *
 * Użytkownik (--email) musi istnieć (załóż konto przez aplikację:
 * /auth/signup). Staje się właścicielem organizacji i projektu demo.
 * Uruchom ponownie z --reset, aby odświeżyć dane demo.
 */

import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_MARKER = "walkthrough-demo";
const ORG_NAME = "Guidon — demo walkthrough";
const PROJECT_NAME = "Kamera orbitalna VR";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--reset") args.reset = true;
    else if (flag === "--email") args.email = argv[++i];
    else if (flag === "--help" || flag === "-h") args.help = true;
  }
  return args;
}

function fail(message) {
  console.error(`Błąd: ${message}`);
  process.exit(1);
}

const args = parseArgs(process.argv);
if (args.help || !args.email) {
  console.log(
    "Użycie: DATABASE_URL=... node scripts/seed-walkthrough-demo.mjs --email <adres istniejącego konta> [--reset]\n" +
      "  --reset  usuwa organizację demo (wraz z danymi, a następnie tworzy ją od nowa)"
  );
  process.exit(args.help || args.email ? 0 : 1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) fail("Ustaw DATABASE_URL (tryb self-hosted) — na Guidon Cloud skrypt nie jest przeznaczony.");

const EMAIL = String(args.email).trim().toLowerCase();
const pool = new Pool({ connectionString: DATABASE_URL });

async function findUser(client) {
  const { rows } = await client.query(
    `SELECT id, email FROM auth.users WHERE lower(email) = $1 LIMIT 1`,
    [EMAIL]
  );
  return rows[0] ?? null;
}

async function findDemoOrganization(client) {
  const { rows } = await client.query(
    `SELECT id FROM public.organizations WHERE slug LIKE 'guidon-demo-%' LIMIT 1`
  );
  return rows[0]?.id ?? null;
}

/**
 * Transakcja „jako najregularniejszy użytkownik aplikacji": RLS weryfikuje
 * tożsamość na podstawie request.jwt.claims, a triggery (np. walidacja
 * workflow zadania) odczytują auth.uid() = identyfikator użytkownika.
 */
async function asUserTx(client, userId, work) {
  await client.query("BEGIN");
  await client.query(`SET LOCAL ROLE authenticated`);
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  try {
    await work();
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/**
 * Transakcja „trybu definer": tabele zapisywane w aplikacji tylko przez
 * service_role (briefy, pakiety modułów, referencje moodboardu).
 * Właściciel tabel pomija RLS, więc wstawienie działa bezpośrednio.
 */
async function asOwnerTx(client, work) {
  await client.query("BEGIN");
  try {
    await work();
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const client = await pool.connect();
  try {
    const user = await findUser(client);
    if (!user) {
      fail(
        `Nie znaleziono konta „${EMAIL}". Zaloguj się do aplikacji i załóż konto` +
          ` (/auth/signup), potem uruchom skrypt ponownie.`
      );
    }
    const userId = user.id;

    const existingOrg = await findDemoOrganization(client);
    if (existingOrg && !args.reset) {
      fail(
        "Organizacja demo już istnieje. Uruchom z --reset, aby zastąpić ją" +
          " świeżym zestawem danych demo."
      );
    }
    if (existingOrg && args.reset) {
      await client.query("BEGIN");
      await client.query(`DELETE FROM public.organizations WHERE id = $1`, [existingOrg]);
      await client.query("COMMIT");
      console.log("Usunięto poprzednią organizację demo (kaskadowo wraz z danymi).");
    }

    let orgId;
    let projectId;
    let boardId;

    await asUserTx(client, userId, async () => {
      // 1. Organizacja i członkostwo
      const slug = `guidon-demo-${randomBytes(3).toString("hex")}`;
      const org = await client.query(
        `INSERT INTO public.organizations (name, slug, description, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [ORG_NAME, slug, `Organizacja demo dla walkthrough: ${DEMO_MARKER}`, userId]
      );
      orgId = org.rows[0].id;
      await client.query(
        `INSERT INTO public.organization_members (organization_id, user_id, role)
         VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
        [orgId, userId]
      );

      // 2. Projekt i członkostwo
      const project = await client.query(
        `INSERT INTO public.projects (organization_id, name, description, color, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          orgId,
          PROJECT_NAME,
          "Projekt demo do nagrania walkthrough: trzy misje nocne z kamerą orbitalną i raportami in-game.",
          "#5b8def",
          userId,
        ]
      );
      projectId = project.rows[0].id;
      await client.query(
        `INSERT INTO public.project_members (project_id, user_id, role)
         VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
        [projectId, userId]
      );

      // 3. Presety etykiet (R.4)
      const labels = [
        ["Bug", "#ef4444", 1],
        ["UX", "#8b5cf6", 2],
        ["Infrastruktura", "#0ea5e9", 3],
        ["AI", "#eab308", 4],
      ];
      for (const [name, color, order] of labels) {
        await client.query(
          `INSERT INTO public.project_label_presets (project_id, name, color, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [projectId, name, color, order]
        );
      }

      // 4. Zadania (R.4): backlog 4, todo 4, in_progress 3, ai_working 1,
      //    review 2, done 4 — razem 18 zadań głównych (+ 2 podzadania).
      const taskDefs = [
        // backlog
        [
          "Opisz mechanikę sznura",
          "Gracz chwyta sznur i przyspiesza w locie; opis zachowania i przypadków brzegowych.",
          "backlog",
          "high",
          ["UX"],
        ],
        [
          "Zbierz referencje do HUD",
          "Kolekcja ekranów z podobnych gier: półprzezroczysty HUD w locie.",
          "backlog",
          "low",
          [],
        ],
        [
          "Zaplanuj audyt wydajności",
          "Profilowanie sceny misji nocnej na średnim sprzęcie.",
          "backlog",
          "medium",
          ["Infrastruktura"],
        ],
        [
          "Zaprojektuj ekran ustawień audio",
          "Suwaki głośności, wybór wyjścia, przełącznik HRTF.",
          "backlog",
          "medium",
          ["UX"],
        ],
        // todo
        [
          "Popraw kolizję kamery",
          "Kamera przenika przez drzwi przy ostrym kącie natarcia.",
          "todo",
          "high",
          ["Bug"],
        ],
        [
          "Dopisz testy zapisów",
          "Zapis i wznowienie w trakcie misji z aktywnym sznurem.",
          "todo",
          "medium",
          [],
        ],
        [
          "Przygotuj build demo na konferencję",
          "Wersja ograniczona do trzech misji plus ekran deweloperski wyłączony w demo.",
          "todo",
          "high",
          [],
        ],
        [
          "Usuń martwy kod starego steru",
          "Stary ster kamera sarà zastąpiony nowym systemem orbitalnym.",
          "todo",
          "low",
          [],
        ],
        // in_progress
        [
          "Popraw rozmowę tekstową na Wayland",
          "Tekst rozjeżdża się w długich wypowiedziach NPC przy GPU-Linux.",
          "in_progress",
          "high",
          ["Bug"],
        ],
        [
          "Dostroj tryb nocny HUD",
          "Kontrast w ciemnych scenach: przełącznik i ścieżki HUD.",
          "in_progress",
          "medium",
          ["UX"],
        ],
        [
          "Integruj raporty in-game w Unity",
          "Widget raportu błędu w menu pauzy; klucz reports:write wbudowany w build.",
          "in_progress",
          "high",
          ["AI"],
        ],
        // ai_working
        [
          "Refaktoring systemu zapisów",
          "Agent przepisuje SystemSave; praca prowadzona przez agenta (AI Working).",
          "ai_working",
          "medium",
          ["AI"],
        ],
        // review
        [
          "Przegląd PR: streaming audio 3D",
          "OpenAL streaming zamiast bufora monolitycznego; PR numer 42.",
          "review",
          "medium",
          ["AI"],
        ],
        [
          "Recenzja hero landinga",
          "Nowa wersja sekcji hero do potwierdzenia; przepisz z historii branch",
          "review",
          "low",
          ["UX"],
        ],
        // done
        [
          "Migracja bazy na PostgreSQL 15",
          "Upgrade z wersji 13; testy db/PGlite zielone.",
          "done",
          "high",
          ["Infrastruktura"],
        ],
        [
          "Prototyp sznura",
          "Fizyczna symulacja sznura, zaakceptowana przez zespół.",
          "done",
          "medium",
          [],
        ],
        [
          "Konfiguracja CI (lint + test)",
          "GitHub Actions: suite test:* przy każdym Pull Request.",
          "done",
          "medium",
          ["Infrastruktura"],
        ],
        [
          "Dodanie kolumny AI Working",
          "Nowa kolumna tablicy dla zadań prowadzonych przez agenta.",
          "done",
          "low",
          [],
        ],
      ];
      const taskIds = [];
      let stageSort = 0;
      for (const [title, description, status, priority, tags] of taskDefs) {
        const inserted = await client.query(
          `INSERT INTO public.tasks
             (project_id, title, description, status, priority, tags, assignee_id, sort_order, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id`,
          [projectId, title, description, status, priority, tags, userId, (stageSort += 1000), userId]
        );
        taskIds.push(inserted.rows[0].id);
      }

      const [backlogFirst, todoFirst, inProgressFirst, aiWorking, reviewFirst, doneFirst] = [
        taskIds[0],
        taskIds[4],
        taskIds[8],
        taskIds[11],
        taskIds[12],
        taskIds[14],
      ];

      // Podzadania pod „Refaktoring systemu zapisów" (R.4, interakcja 3)
      await client.query(
        `INSERT INTO public.tasks
           (project_id, parent_task_id, title, description, status, priority, tags, assignee_id, sort_order, created_by)
         VALUES ($1, $2, 'Część 1: ekstrakcja serwera zapisów', 'Wydzielenie modułu SystemSave do osobnej przestrzeni nazw.', 'todo', 'medium', $3, $4, 1000, $4)`,
        [projectId, aiWorking, JSON.stringify(["AI"]), userId]
      );
      await client.query(
        `INSERT INTO public.tasks
           (project_id, parent_task_id, title, description, status, priority, tags, assignee_id, sort_order, created_by)
         VALUES ($1, $2, 'Część 2: testy migracji zapisów', 'Testy resetu i kompatybilności starych zapisów.', 'todo', 'medium', $3, $4, 2000, $4)`,
        [projectId, aiWorking, JSON.stringify(["AI"]), userId]
      );

      // Komentarze (R.4)
      await client.query(
        `INSERT INTO public.task_comments (task_id, author_id, content)
         VALUES ($1, $2, 'Postawiłem na OpenAL streaming — stary bufor monolityczny nie dawał stabilnych 22 ms na Wayland.')`,
        [reviewFirst, userId]
      );
      await client.query(
        `INSERT INTO public.task_comments (task_id, author_id, content)
         VALUES ($1, $2, 'Rozumiem — dopisałem ponowienie próby przy zrywanym połączeniu 3G.')`,
        [doneFirst, userId]
      );

      // Nieudana próba (R.4, interakcja 5) — sedno demo „dlaczego nie”
      await client.query(
        `INSERT INTO public.task_attempts
           (task_id, problem, approach, outcome, failure_reason, files_changed, agent, created_by)
         VALUES ($1, $2, $3, 'failed', $4, $5, 'demo-v1', $6)`,
        [
          inProgressFirst,
          "Echo w dźwięku po przełączeniu na nowy bufor",
          "Podejście: podwójny pierścień buforów o rozmiarze 4096.",
          "Zakłócenia w prawym uchu przy powrocie do menu — weryfikacja logu 14.",
          JSON.stringify(["src/audio/hrtf.ts"]),
          userId,
        ]
      );

      // Linki do kodu (R.4, interakcja 6): potwierdzony commit + sugerowany PR
      await client.query(
        `INSERT INTO public.task_links
           (project_id, task_id, kind, repository, external_ref, title, url, pr_state, status, provenance, confidence, decided_by)
         VALUES
          ($1, $2, 'commit', 'two-steps-studio/demo-vr', 'a1b2c3d4',
            'fix: stabilniejszy dźwięk na Wayland',
            'https://github.com/two-steps-studio/demo-vr/commit/a1b2c3d4',
            NULL, 'confirmed', 'explicit_reference', 1.00, $3),
          ($1, $4, 'pull_request', 'two-steps-studio/demo-vr', '42',
            'PR 42: streaming audio 3D',
            'https://github.com/two-steps-studio/demo-vr/pull/42',
            'open', 'suggested', 'suggestion', 0.60, NULL)`,
        [projectId, reviewFirst, userId, backlogFirst]
      );

      // 5. Whiteboard (R.5): tablica, trzy notatki i krawędź
      const board = await client.query(
        `INSERT INTO public.whiteboards (project_id, name) VALUES ($1, 'Burza mózgów — kamery') RETURNING id`,
        [projectId]
      );
      boardId = board.rows[0].id;
      const notes = await client.query(
        `INSERT INTO public.whiteboard_elements (board_id, type, x, y, width, height, content)
         VALUES
           ($1, 'sticky', 120, 140, 180, 150, $2),
           ($1, 'sticky', 380, 200, 180, 150, $3),
           ($1, 'sticky', 640, 120, 180, 150, $4)
         RETURNING id`,
        [
          boardId,
          JSON.stringify({ text: "Kamera 1: sznur z dynamicznym FOV", color: "#fbbf24" }),
          JSON.stringify({ text: "Kamera 2: orbita z tłumieniem", color: "#60a5fa" }),
          JSON.stringify({ text: "Drżenie tylko przy trafieniach", color: "#34d399" }),
        ]
      );
      await client.query(
        `INSERT INTO public.whiteboard_edges (project_id, board_id, source_id, target_id, label, type)
         VALUES ($1, 'default', $2, $3, 'włącza kamerę 2', 'default')`,
        [projectId, notes.rows[0].id, notes.rows[2].id]
      );

      // 6. Roadmapa (R.5): dwie fazy z postępem
      await client.query(
        `INSERT INTO public.roadmap_phases
           (project_id, name, description, start_date, planned_end_date, status, completion_percentage, sort_order, created_by)
         VALUES
          ($1, 'Prototyp kamery', 'Fizyka sznura i dynamiczny FOV.', now() - interval '45 days', now() - interval '5 days', 'completed', 100, 1, $2),
          ($1, 'Alfa demo', 'Trzy misje, raporty in-game, build konferencyjny.', now() - interval '4 days', now() + interval '40 days', 'in_progress', 35, 2, $2)`,
        [projectId, userId]
      );

      // 7. Wiedza (R.6): decyzje, źródła, technologie
      const decisions = [
        {
          title: "Kamera orbitalna zamiast podglądu FPS",
          description:
            "Kamera śledzi sznur z tłumieniem zamiast klasycznego podglądu FPS — lepsza czytelność misji nocnych.",
          decision_type: "product",
          status: "approved",
          alternatives: ["Podgląd FPS", "Kamera izometryczna"],
          impact: "Zmiana segmentu HUD i steru kamery.",
        },
        {
          title: "PostgreSQL 15 z RLS jako backend zadań",
          description:
            "Self-hosted Postgres z warstwą kompatybilności auth.uid() odtworzoną lokalnie zamiast usługi zarządzanej.",
          decision_type: "architectural",
          status: "approved",
          alternatives: ["Usługa zarządzana", "SQLite lokalnie"],
          impact: "Docker Compose jako droga wdrożenia.",
        },
        {
          title: "AI Working jako osobna kolumna tablicy",
          description:
            "Zadania prowadzone przez agenta mają własną szufladę, co ułatwia monitoring w raporcie agentów.",
          decision_type: "process",
          status: "proposed",
          alternatives: ["Odznaka na karcie", "Tag AI"],
          impact: "Nowa kolumna i reguła masowa.",
        },
      ];
      const decisionIds = [];
      for (const d of decisions) {
        const row = await client.query(
          `INSERT INTO public.context_decisions
             (project_id, title, description, decision_type, status, made_by, made_at, alternatives, impact)
           VALUES ($1, $2, $3, $4, $5, $6, now() - interval '12 days', $7, $8)
           RETURNING id`,
          [projectId, d.title, d.description, d.decision_type, d.status, userId, d.alternatives, d.impact]
        );
        decisionIds.push(row.rows[0].id);
      }

      const sources = [
        {
          source_type: "document",
          title: "Notatka z sesji playtestu (22.10)",
          content:
            "Gracze (7 osób): 5 wskazało przytłoczenie HUD w ciemnej scenie; 6 szukało sznura po kolorze.",
          url: null,
        },
        {
          source_type: "external_url",
          title: "Dokumentacja GDK: streaming audio",
          content: null,
          url: "https://learn.microsoft.com/gaming/gdk/",
        },
      ];
      const sourceIds = [];
      for (const s of sources) {
        const row = await client.query(
          `INSERT INTO public.context_sources (project_id, source_type, title, content, url, author)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [projectId, s.source_type, s.title, s.content, s.url, s.url ? null : userId]
        );
        sourceIds.push(row.rows[0].id);
      }

      let techSort = 0;

      const technologies = [
        ["Unity 6000.0 LTS", "game_engine", "2022.3", "Silnik demo i raporty in-game."],
        ["PostgreSQL 15", "database", "15.8", "Backend danych zadań z RLS."],
        ["GitHub Actions", "devops", null, "CI: suite test:* przy każdym Pull Request."],
        ["OpenAI GPT-4o", "ai", null, "Insighty pamięci i kreator modułów."],
      ];
      for (const [name, category, version, description] of technologies) {
        await client.query(
          `INSERT INTO public.technologies (project_id, name, category, version, description, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [projectId, name, category, version, description, (techSort += 100)]
        );
      }

      // 8. Pamięć (R.7): fakt, reguła, ograniczenie, dwa insighty AI.
      //    pierwszy insight z datą -100 dni → marka „stale" w packu kontekstu.
      const memoryRows = await client.query(
        `INSERT INTO public.project_memory
           (project_id, content, memory_type, verified, verified_by, verified_at, created_by, confidence, created_at)
         VALUES
          ($1, 'Kolumna „done" liczy się jako zakończona — nie dublujemy flagi w kodzie kart.', 'fact', true, $2, now() - interval '3 days', $2, NULL, now() - interval '3 days'),
          ($1, 'Wydania zawsze w piątek; build musi być gotowy przed południem CET.', 'project_rule', true, $2, now() - interval '10 days', $2, NULL, now() - interval '10 days'),
          ($1, 'Bufor audio nie przekracza 4096 — na Linuxie większe wartości lagują.', 'constraint', false, NULL, NULL, $2, NULL, now() - interval '30 days'),
          ($1, 'Raporty in-game mogą tworzyć duplikaty po restarcie klienta — rozważ klucz idempotentny.', 'ai_insight', false, NULL, NULL, $2, 0.55, now() - interval '100 days'),
          ($1, 'Recenzje PR sugerowane przez agenta wymagają potwierdzenia przez człowieka.', 'ai_insight', false, NULL, NULL, $2, 0.70, now() - interval '2 days')
         RETURNING id, memory_type, created_at`,
        [projectId, userId]
      );
      const fact = memoryRows.rows.find((row) => row.memory_type === "fact");
      const staleInsight = memoryRows.rows.find((row) => row.memory_type === "ai_insight" && row.created_at < new Date(Date.now() - 30 * 24 * 3600 * 1000)) ?? memoryRows.rows.filter((row) => row.memory_type === "ai_insight")[0];

      if (staleInsight) {
        // Relacja pamięć → decyzja: zmiana decyzji pokaże markę
        // „wymaga przeglądu" w packu kontekstu.
        await client.query(
          `INSERT INTO public.context_relations (source_type, source_id, target_type, target_id, relation_type, created_by)
           VALUES ('memory', $1, 'decision', $2, 'based_on', $3)`,
          [staleInsight.id, decisionIds[1], userId]
        );
      } else {
        throw new Error("Nie udało się dostać do insightu pamięci — brak relacji based_on.");
      }
      if (fact) {
        // Relacja pamięć → źródło wiedzy (R.6/R.7 łącznik)
        await client.query(
          `INSERT INTO public.context_relations (source_type, source_id, target_type, target_id, relation_type, created_by)
           VALUES ('memory', $1, 'source', $2, 'references', $3)`,
          [fact.id, sourceIds[0], userId]
        );
      }
    });

    if (!orgId || !projectId || !boardId) {
      throw new Error("Nie udało się utworzyć podstawowych obiektów demo.");
    }

    // 9. Brief agenta + moduł + moodboard (tryb definer — w aplikacji
    //    zapisuje je service_role)
    await asOwnerTx(client, async () => {
      await client.query(
        `INSERT INTO public.agent_briefs (project_id, version, content, approved_by)
         VALUES ($1, 1, $2, $3)`,
        [
          projectId,
          [
            "# Brief agenta — Kamera orbitalna VR",
            "",
            "## Cel projektu",
            "Demo konferencyjne: trzy misje nocne z kamerą orbitalną; build w piątek przed południem CET. _[decyzja procesowa: AI Working jako osobna kolumna]_",
            "",
            "## Stack i konwencje",
            "- Unity 6000.0 LTS; backend PostgreSQL 15 (self-hosted). _[technologie projektu]_",
            "- Audio przez OpenAL streaming; bufor nie większy niż 4096. _[decyzja architektoniczna: PostgreSQL 15]_",
            "",
            "## Ograniczenia",
            "- Nie pomijaj przeglądów PR — zawsze potwierdzenie człowieka.",
            "",
            "## Dozwolone akcje agenta",
            "- czytaj get_task_context, pracuj na zadaniach implementacyjnych, zapisuj attempts i komentarze;",
            "- **bez** complete_task — status review i zamknięcie wykonuje człowiek.",
            "",
            "_Wersja 1 — zatwierdzona przez właściciela projektu._",
          ].join("\n"),
          userId,
        ]
      );

      // Moduł release-planning (R.9) z automatyzacją create_task
      const manifestPath = path.join(ROOT, "examples/module-manifests/release-planning.json");
      const recordsPath = path.join(ROOT, "examples/module-manifests/release-planning-data.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifest.permissions = [...new Set([...manifest.permissions, "tasks:write"])];
      manifest.automations = [
        {
          id: "triage",
          name: "Zadanie do przeglądu nowego wydania",
          trigger: { event: "record.created", entity: "release", when: { field: "status", equals: "planned" } },
          actions: [{ type: "create_task", title: "Plan wydania: {{name}}", priority: "high" }],
        },
      ];
      const records = JSON.parse(readFileSync(recordsPath, "utf8"));
      await client.query(
        `INSERT INTO public.project_module_packages (project_id, module_id, manifest, records)
         VALUES ($1, $2, $3::jsonb, $4::jsonb)
         ON CONFLICT (project_id, module_id) DO NOTHING`,
        [projectId, "release-planning", JSON.stringify(manifest), JSON.stringify(records)]
      );

      // Moodboard (R.6): placeholdery — nagrywając, wgraj prawdziwe obrazy.
      const references = [
        ["moodboard/cockpit-ref.png", "Referencja kokpitu", "Ciemny, czytelny HUD z gier referencyjnych.", ["hud", "dark"]],
        ["moodboard/cable-physics.png", "Referencja fizyki sznura", "Kadmowy film referencyjny do nagrania pętli fizycznej.", ["physics"]],
      ];
      for (const [storagePath, name, caption, tags] of references) {
        await client.query(
          `INSERT INTO public.project_references
             (project_id, name, storage_path, mime_type, caption, tags, uploaded_by)
           VALUES ($1, $2, $3, 'image/png', $4, $5, $6)`,
          [projectId, name, storagePath, caption, tags, userId]
        );
      }
    });

    const {
      rows: [projectRow],
    } = await client.query(`SELECT slug FROM public.projects WHERE id = $1`, [projectId]);

    console.log("\n✅ Gotowe — dane demo walkthrough załadowane.");
    console.log(`   Użytkownik:  ${EMAIL}`);
    console.log(`   Organizacja: ${ORG_NAME}`);
    console.log(`   Projekt:     ${PROJECT_NAME} (slug: ${projectRow?.slug})`);
    console.log("\n   Gdzie nagrywać (id projektu: " + projectId + ")");
    console.log("   • /work       — R.4: 18 zadań + podzadanie, próba, linki");
    console.log("   • /whiteboard — R.5: 3 notatki + krawędź");
    console.log("   • /roadmap    — R.5: 2 fazy z postępem");
    console.log("   • /decisions  — R.6: 3 decyzje");
    console.log("   • /memory     — R.7: fakt, reguła, ograniczenie, 2 insighty (1 stale)");
    console.log("   • /brief      — R.8: brief agenta v1 zatwierdzony");
    console.log("   • /modules    — R.9: release-planning z automatyzacją");
    console.log("   • /references — R.6: moodboard (placeholdery obrazów)");
    console.log("\n   Uwaga: automatyzacja modułu uruchamia się przy zapisie rekordu");
    console.log("   z poziomu aplikacji (moduł → formularz), nie z bezpośredniego SQL.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Seed nieudany:", error?.message ?? error);
  process.exit(1);
});
