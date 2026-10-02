#!/usr/bin/env node
/**
 * Seeds the "Emberfall" demo project that the landing page screenshots are
 * taken from (see capture.mjs next to this file). Local/self-hosted only -
 * talks to Postgres directly, never run it against production.
 *
 *   DATABASE_URL=postgresql://... DEMO_USER_EMAIL=you@example.com \
 *     node scripts/landing/seed-demo.mjs
 *
 * Re-running replaces the previous demo organization (slug below) and
 * everything in it. All writes after that go through the same RLS path as
 * the app (SET LOCAL ROLE authenticated + JWT claims, like withUser()), so
 * triggers fill in owners/memberships exactly as they would for a real user.
 */

import pg from "pg";

const ORG_SLUG = "emberfall-demo";

const { DATABASE_URL, DEMO_USER_EMAIL } = process.env;
if (!DATABASE_URL || !DEMO_USER_EMAIL) {
  console.error("Set DATABASE_URL and DEMO_USER_EMAIL.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const { rows: users } = await client.query("SELECT id FROM public.profiles WHERE email = $1", [
  DEMO_USER_EMAIL.toLowerCase(),
]);
if (!users[0]) {
  console.error(`No profile for ${DEMO_USER_EMAIL} - sign up first.`);
  process.exit(1);
}
const userId = users[0].id;

// Previous demo, if any. Deleting the organization cascades to its projects.
await client.query("DELETE FROM public.organizations WHERE slug = $1", [ORG_SLUG]);

const days = (n) => new Date(Date.now() + n * 86_400_000).toISOString();

await client.query("BEGIN");
try {
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  await client.query("SET LOCAL ROLE authenticated");
  const q = (sql, params) => client.query(sql, params).then((r) => r.rows);

  const [org] = await q(
    "INSERT INTO public.organizations (name, slug, description) VALUES ('Emberfall Studio', $1, 'Indie studio - demo data') RETURNING id",
    [ORG_SLUG]
  );
  const [project] = await q(
    `INSERT INTO public.projects (organization_id, name, description, color, project_type)
     VALUES ($1, 'Emberfall', 'Roguelite deckbuilder about a lighthouse keeper holding back the dark.', '#e05d2b', 'game')
     RETURNING id`,
    [org.id]
  );
  const p = project.id;

  // --- Roadmap -----------------------------------------------------------
  const phases = [
    ["Prototype", "Core loop: draw, play, survive the night. Paper-tested, then in engine.", "completed", 100, -120, -75],
    ["Vertical slice", "One full biome, 40 cards, boss fight, final art direction.", "in_progress", 62, -74, 20],
    ["Steam Next Fest demo", "30-minute demo, controller support, telemetry opt-in.", "planned", 0, 21, 60],
    ["Early Access", "3 biomes, 120 cards, meta-progression, localisation (EN/PL/DE).", "planned", 0, 61, 180],
  ];
  for (const [i, [name, description, status, pct, start, end]] of phases.entries()) {
    await q(
      `INSERT INTO public.roadmap_phases (project_id, name, description, status, completion_percentage, start_date, planned_end_date, actual_end_date, sort_order, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [p, name, description, status, pct, days(start), days(end), status === "completed" ? days(end) : null, i, userId]
    );
  }

  // --- Decisions ---------------------------------------------------------
  const decisions = [
    ["Godot 4 instead of Unity", "Open source, no runtime fee, GDScript is fast enough for a card game; C# kept as an option for hot paths.", "technical", "approved", ["Unity 6", "Custom engine (SDL + Lua)"], "Engine choice locks tooling for the whole project."],
    ["Deterministic run seeds", "Every run is reproducible from its seed so bug reports can be replayed exactly.", "architectural", "approved", ["Record/replay of inputs"], "Needs a seeded RNG everywhere - no global randi()."],
    ["Cut online co-op from 1.0", "Co-op doubles QA and netcode scope; revisit after Early Access feedback.", "product", "approved", ["Ship co-op as beta branch"], "Frees ~3 months for content."],
    ["Weekly playtest builds on Fridays", "Tag a build every Friday, collect feedback over the weekend via the in-game report form.", "process", "proposed", [], null],
  ];
  const decisionIds = [];
  for (const [title, description, type, status, alternatives, impact] of decisions) {
    const [row] = await q(
      `INSERT INTO public.context_decisions (project_id, title, description, decision_type, status, alternatives, impact, made_by, made_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [p, title, description, type, status, alternatives, impact, userId, days(-60)]
    );
    decisionIds.push(row.id);
  }

  // --- Knowledge ---------------------------------------------------------
  const sources = [
    ["document", "Game design document v0.4", "Pillars: tension, readable decisions, one more run. Night lasts 8 turns; light is both health and currency.", null],
    ["meeting", "Playtest #6 notes", "5/7 testers didn't notice the lighthouse beam upgrades. Tutorial tooltip on first shop visit.", null],
    ["pull_request", "PR #118: Seeded RNG service", "Replaces all randi()/randf() calls with RunRng.next_*; adds seed to crash reports.", "https://github.com/emberfall/game/pull/118"],
    ["external_url", "Steam Next Fest guidelines", "Demo must be available for the whole event; store page live 2 weeks before.", "https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest"],
  ];
  for (const [type, title, content, url] of sources) {
    await q(
      "INSERT INTO public.context_sources (project_id, source_type, title, content, url, author) VALUES ($1,$2,$3,$4,$5,$6)",
      [p, type, title, content, url, userId]
    );
  }

  // --- Memory ------------------------------------------------------------
  const memories = [
    ["project_rule", "Every card must be playable with one hand on a controller - no drag-only interactions.", true, null],
    ["constraint", "Steam Deck is a target: 60 FPS at 800p, max 1.5 GB RAM.", true, null],
    ["fact", "Average run length in playtests is 34 minutes (target 25-40).", true, null],
    ["decision_summary", "Online co-op is out of scope for 1.0; the netcode prototype is archived, not deleted.", true, null],
    ["ai_insight", "Three of the last five bug reports mention the shop UI after a controller disconnect - likely one root cause in focus handling.", false, 0.72],
  ];
  for (const [type, content, verified, confidence] of memories) {
    await q(
      `INSERT INTO public.project_memory (project_id, content, memory_type, verified, verified_by, verified_at, confidence, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [p, content, type, verified, verified ? userId : null, verified ? days(-3) : null, confidence, userId]
    );
  }

  // --- Technologies ------------------------------------------------------
  const tech = [
    ["Godot", "godotengine", "4.3", "game_engine"],
    ["GDScript", null, null, "game_engine"],
    ["C#", "dotnet", "12", "backend"],
    ["Steamworks", "steam", null, "other"],
    ["Blender", "blender", "4.2", "other"],
  ];
  for (const [i, [name, icon, version, category]] of tech.entries()) {
    await q(
      "INSERT INTO public.technologies (project_id, name, icon_slug, version, category, sort_order) VALUES ($1,$2,$3,$4,$5,$6)",
      [p, name, icon, version, category, i]
    );
  }

  // --- Tasks -------------------------------------------------------------
  const tasks = [
    ["Boss: The Drowned Bell - phase 2 attacks", "in_progress", "high", ["combat", "boss"], 5, decisionIds[1]],
    ["Controller focus lost after reconnect in shop", "todo", "critical", ["bug", "ui", "controller"], 2, null],
    ["Lighthouse beam upgrade tooltip", "review", "medium", ["ui", "tutorial"], 1, null],
    ["Card art pass: 12 Tide cards", "in_progress", "medium", ["art"], 9, null],
    ["Seeded RNG for event rolls", "done", "high", ["tech"], -4, decisionIds[1]],
    ["Steam Deck performance profile", "backlog", "medium", ["performance", "steam-deck"], 25, null],
    ["Polish translation - UI strings", "todo", "low", ["localisation"], 30, null],
    ["Night 6-8 difficulty curve", "backlog", "high", ["balance"], 14, null],
    ["Crash report: null light source on restart", "ai_working", "high", ["bug"], 3, null],
    ["Store page capsule art", "done", "medium", ["marketing", "art"], -10, null],
  ];
  const taskIds = [];
  for (const [i, [title, status, priority, tags, due, decisionId]] of tasks.entries()) {
    const [row] = await q(
      `INSERT INTO public.tasks (project_id, title, status, priority, tags, due_date, sort_order, assignee_id, decision_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [p, title, status, priority, tags, days(due), i, i % 3 === 0 ? userId : null, decisionId, userId]
    );
    taskIds.push(row.id);
  }
  await q(
    "UPDATE public.tasks SET description = $1 WHERE id = $2",
    [
      "Phase 2 starts at 50% HP: the bell rings every 3 turns and **dims one light source**.\n\n" +
        "- [x] Bell toll telegraph (VFX + audio)\n- [x] Dim-light debuff\n- [ ] Tide adds spawn from the edges\n- [ ] Phase transition cutscene\n\n" +
        "Balance target: 60% win rate for a Night-5 deck.",
      taskIds[0],
    ]
  );
  for (const [title, status] of [
    ["Tide adds spawn logic", "in_progress"],
    ["Phase transition cutscene", "todo"],
    ["Bell toll telegraph", "done"],
  ]) {
    await q(
      "INSERT INTO public.tasks (project_id, parent_task_id, title, status, priority, created_by) VALUES ($1,$2,$3,$4,'medium',$5)",
      [p, taskIds[0], title, status, userId]
    );
  }

  // --- Relations (context graph) -----------------------------------------
  const rel = [
    ["task", taskIds[4], "decision", decisionIds[1], "implements"],
    ["task", taskIds[0], "decision", decisionIds[1], "depends_on"],
    ["decision", decisionIds[2], "decision", decisionIds[0], "related_to"],
  ];
  for (const [st, sid, tt, tid, type] of rel) {
    await q(
      `INSERT INTO public.context_relations (project_id, source_type, source_id, target_type, target_id, relation_type, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [p, st, sid, tt, tid, type, userId]
    );
  }

  await client.query("COMMIT");
  console.log(`Seeded demo project ${p} (org ${org.id}) for ${DEMO_USER_EMAIL}.`);
  console.log(`DEMO_PROJECT_ID=${p}`);
  console.log(`DEMO_TASK_ID=${taskIds[0]}`);
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Seeding failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
