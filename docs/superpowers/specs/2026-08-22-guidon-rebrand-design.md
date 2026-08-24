# Guidon visual rebrand — design

## Problem

Guidon's existing design system (Tailwind v4 + shadcn "new-york" style, CSS-variable tokens in `src/app/globals.css`, dark-first teal/green palette) is internally coherent but generic — it reads as a default shadcn SaaS boilerplate rather than a distinctive product. A code-level audit (no live browser available during brainstorming) also surfaced concrete inconsistencies independent of the rebrand decision:

1. **Hardcoded status colors bypass the token system.** `src/app/projects/[id]/files/files-browser.tsx`, `src/app/organizations/[id]/page.tsx`, and `src/app/organizations/[id]/members/page.tsx` use literal Tailwind palette classes (`bg-green-100 text-green-800`, etc.) for status/role badges instead of the design tokens. These have no dark-mode variant, so they render washed out or illegible in the app's primary (dark) mode.
2. **Page container width/padding is inconsistent.** Admin pages use `container mx-auto max-w-7xl px-6 py-8`; most project pages use `container mx-auto p-6 max-w-7xl`; organization pages use `container mx-auto p-6 max-w-6xl`; `/dashboard` and `/projects` use `container mx-auto px-4 py-8` with **no** `max-w-*` at all, so they stretch full-width on wide screens while every other page is capped and centered.
3. **Empty states are duplicated 14 times** (`grep` count) with near-identical markup (muted icon, heading, description, button) but no shared component — and the one place that *does* have a nicer treatment (icon in a `bg-primary/10` rounded square, on the landing page) isn't reused anywhere else.
4. **Admin tables** (`/admin/organizations`, `/admin/users`, `/admin/logs`) are bare `<table>` elements with no row hover state and don't share the border/radius treatment the rest of the app uses for surfaces.

## Goal

A full visual rebrand toward a "technical/tool" identity (Linear/Vercel/Raycast-adjacent), decided interactively with the user:

- **Accent color:** electric blue, replacing the current teal/green, in both light and dark palettes.
- **Typography:** Geist Sans replaces Inter as the primary typeface; Geist Mono is added for numeric/technical accents (stat values, counts).
- **Shape language:** sharper and flatter — smaller corner radius, thin 1px borders as the primary surface separator instead of soft shadows.
- **Mode priority:** stays dark-first (unchanged) — light mode remains fully supported, dark mode remains the primary designed identity.
- Alongside the palette/type/shape change, fix the four concrete inconsistencies above as part of the same systematic pass, since they undermine any rebrand if left in place.

The new accent (`#1d4fd8` light / `#4d8dff` dark) and shape direction (rounded-6px cards, 1px borders, no shadow) were shown to the user as a live mockup and approved before writing this spec.

Not building: a new logo/wordmark (the existing `guidon-wordmark.png` asset stays), a new information architecture (nav structure, page routes unchanged), or new marketing copy.

## Token changes (`src/app/globals.css`)

Replace the brand/primary/ring tokens in `:root`, the `@media (prefers-color-scheme: dark)` block, and the `:root[data-theme="dark"]` block (all three must stay in sync — that's the existing convention in this file):

| Token | Light (current → new) | Dark (current → new) |
|---|---|---|
| `--color-primary` | `#0f6b5a` → `#1d4fd8` | `#2dd4a7` → `#4d8dff` |
| `--color-primary-hover` | `#127e69` → `#1640b0` | `#4ee0b8` → `#6ea3ff` |
| `--color-primary-active` | `#0c5647` → `#0f2f85` | `#22b98f` → `#3a76e6` |
| `--color-primary-foreground` | `#ffffff` (unchanged) | `#05221b` → `#05142e` |
| `--color-ring` | `#0f6b5a` → `#1d4fd8` | `#2dd4a7` → `#4d8dff` |
| `--color-brand` | `#176b5b` → `#1d4fd8` | (single value, no dark variant today — leave as-is) |
| `--color-brand-accent` | `#57d6b3` → `#4d8dff` | (single value — leave as-is) |

`--color-success`/`--color-warning`/`--color-danger`/`--color-info` and the priority accents are unchanged — they're already semantically distinct from the brand color and don't need to shift with it.

Add a new token, in all three blocks:

```css
--radius: 0.375rem; /* 6px — replaces the rounded-xl (12px) card default */
```

Add to the `@theme inline` bridge block (required — anything omitted there isn't available as a utility, per the file's own header comment):

```css
--color-primary: var(--color-primary);
/* (already present — no change to which tokens are bridged, only their values above) */
--radius: var(--radius);
--font-mono: var(--font-geist-mono), var(--font-mono);
```

(The existing `--font-mono` fallback stack in `@theme inline` stays as the value after the Geist Mono variable — same pattern as `--font-sans` falling back to `ui-sans-serif, system-ui, ...` today.)

## Typography (`src/app/layout.tsx`, `globals.css`)

Replace the `Inter` import with `Geist` and `Geist_Mono` from `next/font/google`:

```typescript
import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});
```

Both variables go on the `<html>` element's `className` (replacing the current single `inter.variable`). `globals.css`'s `--font-sans` bridge value changes from `var(--font-inter), ui-sans-serif, ...` to `var(--font-geist-sans), ui-sans-serif, ...`, and `body`'s inline `font-family` (which currently duplicates the same stack — see the file's `body` rule) updates to match. `--font-mono` (new, see above) uses `var(--font-geist-mono)`.

Geist Mono is applied at point of use, not globally — specifically the numeric stat values on `/dashboard` (`stats.total_projects`, `totalTasks`, etc., currently plain `text-2xl font-bold`) get a `font-mono` class added. No other blanket application; this stays a deliberate accent, not a base body-font change.

## Shape (shared components)

- `src/components/ui/card.tsx`: `Card`'s className changes from `"rounded-xl border bg-card text-card-foreground shadow"` to `"rounded-[var(--radius)] border bg-card text-card-foreground shadow-none"`.
- `src/components/ui/button.tsx`: the `buttonVariants` base and each variant currently mix `rounded-md` (already close to the new 6px target — left as literal `rounded-md`, not switched to the `--radius` var, since Tailwind's `rounded-md` is already 6px and matches) with `shadow`/`shadow-sm` on `default`, `destructive`, `secondary`, `outline`. Those drop to no shadow class (matching the flatter direction), border-only separation via existing `border` on `outline`.
- `src/components/ui/badge.tsx`: already `rounded-md` — no change needed, it's already at the target radius.
- `src/components/ui/input.tsx`: check its current radius/shadow classes at implementation time and align the same way (rounded-md, no shadow) if it currently uses the larger scale.

This is a small, bounded set of files — every page that uses `Card`/`Button`/`Badge`/`Input` (which is effectively every page in the app) picks up the shape change automatically. No per-page shape edits are needed.

## New shared `EmptyState` component

Create `src/components/ui/empty-state.tsx`:

```typescript
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}
```

Renders: icon inside a rounded square tinted with the new primary accent (`bg-primary/10`, matching the landing page's existing feature-card icon treatment — `w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center`), heading, description, optional action slot (for a `<Button>` or `<Link>`, since the 14 existing call sites pass different combinations of button label/href).

Replace all 14 existing inline empty-state blocks (found via `grep -rl "flex flex-col items-center justify-center py-12"`) with `<EmptyState .../>` calls. This is a mechanical, low-risk replacement — same visual slots, same content per page, just centralized markup — and it's what makes the empty-state visual upgrade apply everywhere at once instead of drifting.

## Concrete consistency fixes

**Hardcoded status colors → tokens**, in the three files identified:
- `files-browser.tsx`'s `FILE_TYPE_COLORS` map (PDF/image/text/video/fallback) moves from Tailwind palette classes to the existing semantic tokens (`bg-danger/10 text-danger`, `bg-info/10 text-info`, `bg-success/10 text-success`, `bg-warning/10 text-warning`, `bg-muted text-muted-foreground` for the fallback) — chosen by closest existing semantic match per file type, not a new color per type.
- `organizations/[id]/page.tsx`'s inline project-status ternary (`active` / `archived` / other) moves to the same success/muted/danger token set.
- `organizations/[id]/members/page.tsx`'s `ROLE_COLORS` map (`owner: bg-purple-100 text-purple-800`, `admin: bg-blue-100 text-blue-800`, `member: bg-gray-100 text-gray-800`) is removed entirely and replaced with `Badge` component variants, matching how `Badge` is already used elsewhere (e.g. `dashboard/page.tsx`'s project-status badge) instead of a bespoke color map: `owner` → `default` (primary-filled, the most prominent role), `admin` → `secondary`, `member` → `outline`. This drops the purple hue (no token for it in this system) in favor of the existing three-tier Badge hierarchy, which already reads as "most → least prominent."

**Container width/padding unified** across the ~19 page files found via the earlier `grep`, to one shared pattern: `container mx-auto max-w-7xl px-6 py-8`. `profile/page.tsx` (`max-w-2xl`) and `projects/[id]/settings/page.tsx` (`max-w-4xl`) are deliberately narrower for their content (a single-column form) and are left as-is — the fix targets the *inconsistent* wide-page wrappers, not every `max-w` value in the app.

**Admin tables** (`organizations`, `users`, `logs` — all three share the same `<table>` structure): add `hover:bg-surface-hover` (or the closest existing hover token) to each data `<tr>`, and align the wrapping `<Card>`'s radius/border to the new shared token automatically via the `Card` component change above (no separate edit needed there — they already render inside `<Card><CardContent className="overflow-x-auto p-0">`).

## Verification

- `npm run build`, `npx tsc --noEmit`, `npm run lint` — same gate as the previous plan.
- No automated visual test exists for this app (no Storybook, no screenshot diffing) — verification is a manual pass through the Browser pane (landing, dashboard, a project workspace page, admin) in both light and dark, if the pane is available in the execution environment; otherwise a DOM/text-based check (`read_page`, `get_page_text`) confirming the expected classes/tokens render, consistent with how the previous (project-limit) plan handled the same environment constraint.

## Phase 1 addendum: unified navigation, onboarding, React Bits, color gaps

Added after a much larger 28-point request from the user covering the whole
product (auth, billing, AI task API, etc. — tracked as later phases, not
here). This addendum extends Phase 1 (UI/UX) with four pieces the user
specifically asked to fold into it, each investigated against the real
codebase before being designed (not assumed from the request text):

### Investigation findings (correcting assumptions in the original request)

- **Project color system is not hardcoded.** `projects.color` (nullable hex,
  `src/db/migrations/000_baseline_schema.sql:101`) is read by
  `requireProjectAccess()` (`src/lib/data/project-access.ts`) and already
  threaded as a `projectColor` prop through ~15 files: `project-sidebar.tsx`
  (active nav item), `kanban-board.tsx` (column border, priority dot,
  selected state), `task-card.tsx` (priority dot), `work-board.tsx`,
  `member-list.tsx`, `files-browser.tsx`, `knowledge-list.tsx`, the four
  create-dialogs (decision/phase/source), `projects/[id]/page.tsx` (header
  icons, `--tw-ring-color`), `activity/page.tsx`, `roadmap/page.tsx`. The
  real gaps are narrower than "fix hardcoded color": `Badge` has no color
  override, no progress-bar component exists yet to color, and the ring/focus
  treatment used at `projects/[id]/page.tsx:164` is not applied anywhere
  else that has a focus/selected state.
- **New-user onboarding is a real gap.** `signup-form.tsx` routes straight to
  `/dashboard` (`router.push('/dashboard')` / server-side redirect for the
  Supabase path). A brand-new user has 0 organizations and 0 projects.
  `dashboard/page.tsx`'s current empty state (`projects.length === 0`) is a
  generic "No projects yet" card with a button linking to `/organizations`,
  which is *also* empty and requires creating an organization first before
  a project can exist at all — nothing on either page explains what the
  product does. The creation chain itself is not broken:
  `organizations/actions.ts`'s `createOrganization` already
  `redirect(`/organizations/${orgId}`)`s on success, and that page already
  shows a prominent "Create Project" empty state for a 0-project org. No new
  Server Action is needed — only a better on-ramp into the existing chain.
- **Navigation is two separate layouts today**, confirmed by reading both:
  `components/layout/navigation.tsx` (horizontal top bar — Dashboard,
  Projects — rendered individually by `dashboard/page.tsx`,
  `organizations/page.tsx`, `organizations/[id]/page.tsx`,
  `organizations/[id]/members/page.tsx`, `projects/page.tsx`, `profile/page.tsx`,
  and each `admin/*/page.tsx`) and `components/layout/project-sidebar.tsx`
  (left sidebar, only rendered by `projects/[id]/layout.tsx`, so only visible
  inside a project). The user's requested nav list reads as one persistent
  sidebar for the whole authenticated app, confirmed with the user.
- **React Bits** (reactbits.dev) is MIT + Commons Clause (free for commercial
  use), installed per-component via the shadcn CLI
  (`npx shadcn@latest add @react-bits/<Name>-TS-TW`), landing as plain
  TS+Tailwind files in `src/components/ui/` — this matches Guidon's existing
  shadcn setup (`components.json`) exactly, no new tooling required. No
  "Pro" tier exists to gate on.

### Unified sidebar

Replace the two layouts with one persistent left sidebar, without moving any
route files (keeps every URL and `generateMetadata` call exactly where it
is — lower risk than restructuring into a Next.js route group, and doesn't
require trusting possibly-stale assumptions about this project's
non-standard Next.js build; see `AGENTS.md`'s instruction to check
`node_modules/next/dist/docs/` before relying on routing APIs, which the
per-page-wrapper approach below avoids needing to do at all).

- Install shadcn's official `sidebar` primitive (`npx shadcn@latest add
  sidebar`) as the base — it already provides collapsed-state persistence
  (cookie-backed, so no flash-of-uncollapsed-sidebar on reload), a
  `SidebarProvider`/`Sidebar`/`SidebarTrigger` composition, and mobile
  responsiveness, rather than hand-rolling the same thing `project-sidebar.tsx`
  already partially does with plain `useState` (which does *not* persist
  across reloads today — confirmed by reading it, no cookie/localStorage
  read on mount). The exact generated API (component names/props) will be
  read directly from the generated file once installed, not guessed —
  shadcn CLI additions are copied source, not a black-box package.
- New `src/components/layout/app-sidebar.tsx` wraps that primitive with
  Guidon's nav data: a project switcher at the top (reusing
  `ProjectSwitcher`, already used by `project-sidebar.tsx`) when inside a
  project, otherwise the organization/user context; below it, one flat list
  built by merging the existing global items (Dashboard, Projects,
  Organizations) with the project-scoped items from `project-sidebar.tsx`'s
  `navGroups` **as they exist in the current uncommitted working tree**
  (Overview; Work: Task Board, Roadmap, Files; Knowledge: Knowledge,
  Decisions, Technologies; Context: Memory, Graph; Project: Members,
  Activity, Settings) when a project is active — see the note below on why
  this uses the working-tree version, not the last-committed one. No
  AI/Billing/Workspace entries — those pages don't exist yet (later phases).
- Every top-level page that currently renders `<Navigation user={user} />`
  swaps that one line for `<AppShell user={user}>` wrapping its existing
  content (same page file, same route, same data-fetching — only the layout
  wrapper changes): `dashboard/page.tsx`, `organizations/page.tsx`,
  `organizations/[id]/page.tsx`, `organizations/[id]/members/page.tsx`,
  `projects/page.tsx`, `profile/page.tsx`, and the five `admin/*/page.tsx`
  files (`admin/page.tsx`, `admin/organizations/page.tsx`,
  `admin/users/page.tsx`, `admin/logs/page.tsx`, `admin/integrations/page.tsx`).
  `projects/[id]/layout.tsx` swaps `ProjectSidebar` for the same `AppShell`
  (with `projectId` passed so it renders the project-scoped nav items too).
  `components/layout/navigation.tsx` and `components/layout/project-sidebar.tsx`
  are deleted once nothing imports them — not kept as a parallel unused
  system.
- Auth pages (`auth/login`, `auth/signup`, etc.) and the public landing page
  keep no sidebar, unchanged.

### Onboarding

- `dashboard/page.tsx`: when `projects.length === 0`, render a new
  onboarding view instead of today's generic empty `Card` — short
  explainer cards for Projects/Tasks/Knowledge/Context/AI (same content
  pattern as the three feature cards already on `src/app/page.tsx`, reused
  rather than re-invented) plus one primary CTA, **Create your first
  project**, linking to `/organizations?create=1`.
- `organizations/page.tsx` and its `CreateOrganizationDialog`
  (`organizations/create-organization-dialog.tsx`): read a `create` search
  param server-side and pass an `openOnMount` flag into the (client)
  dialog component so it opens automatically when arriving from the
  onboarding CTA — no new Server Action, the dialog's existing submit path
  (`createOrganization`) is unchanged, including its existing
  `redirect(`/organizations/${orgId}`)` on success.
- No changes to `organizations/[id]/page.tsx`'s existing "Create Project"
  empty state — it already does the right thing for a fresh organization.

### React Bits usage

- `src/app/page.tsx` (public landing): add a Spotlight-style background
  effect behind the hero (`npx shadcn@latest add @react-bits/Spotlight-TS-TW`
  or the closest matching component name found once browsing the installed
  category — confirmed at implementation time against the actual component
  list, not assumed), subtle, not covering the feature cards.
- `dashboard/page.tsx`: the four stat values (`stats.total_projects`,
  `totalTasks`, `completedTasks`, `totalDecisions`) get a Count Up animation
  on mount (`npx shadcn@latest add @react-bits/CountUp-TS-TW`), replacing
  the current static `<div className="text-2xl font-bold">{value}</div>`.
- Nothing else in this phase — Magic Bento, Dock, Tilted Card, and the other
  components the user listed are candidates for later UI phases once there's
  more surface area (AI activity feed, pricing page) that actually calls for
  them, not applied speculatively now.

### Color system gaps

- `src/components/ui/badge.tsx`: `Badge` accepts an optional `style` pass-
  through already (it spreads `...props` onto the underlying element per
  its current implementation) — confirmed sufficient for callers to pass
  `style={{ backgroundColor: projectColor }}` directly; no component code
  change needed here, only documentation of the pattern for the one caller
  that currently reinvents it as a hardcoded color map
  (`organizations/[id]/members/page.tsx`'s `ROLE_COLORS`, already covered by
  the base rebrand spec above).
- Ring/focus treatment: the `--tw-ring-color` pattern at
  `projects/[id]/page.tsx:164` is applied consistently to the other
  interactive project-colored elements introduced by the sidebar unification
  above (the active nav item in `app-sidebar.tsx`) so keyboard focus is
  visibly styled with the project's color where the project's color is
  already the visual theme, not just on hover/active.

## Out of scope

- New logo/wordmark.
- Marketing copy changes on the landing page (beyond the onboarding cards reused verbatim from it, see addendum).
- A shared `AdminTable` abstraction — the three admin tables get the same inline treatment (hover, inherited Card radius) rather than a new extracted component; three call sites don't justify the abstraction (YAGNI).
- Light-mode/dark-mode priority change — dark-first stays dark-first.
- A Next.js route-group restructure (`(app)/layout.tsx`) — the addendum's per-page `AppShell` wrapper achieves one persistent sidebar without moving route files; revisiting this as a cleanup is a later decision, not part of this phase.
- Any page for AI, Billing, or Workspace — not built yet, so not linked from the new sidebar; later phases per the user's own priority ordering.
- The remaining React Bits components the user listed (Magic Bento, Dock, Glass Surface, Tilted Card, Card Nav, Flowing Menu, Profile Card, text animations) — only Spotlight (landing) and Count Up (dashboard stats) are used in this phase.

### Note on pre-existing local changes

Before this addendum was written, an independent, uncommitted local edit to
`project-sidebar.tsx`'s `navGroups` already existed (working tree, not part
of any commit): renaming "Board" to "Task Board", moving "Files" from the
Knowledge group into the Work group, and adding a "Project" label to the
last group. Since `project-sidebar.tsx` is being replaced outright by
`app-sidebar.tsx` in this addendum, that in-progress relabeling is folded
into `app-sidebar.tsx`'s nav data as the starting point (not reverted, not
lost) — the plan carries this forward explicitly rather than the
implementer needing to rediscover it.
