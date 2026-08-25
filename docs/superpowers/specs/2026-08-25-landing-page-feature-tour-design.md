# Landing page feature tour

## Problem

`src/app/page.tsx` (the public `/` marketing page) currently shows only a hero and a 3-card
grid (Decisions, Context, Memory). It doesn't walk a first-time visitor through what Guidon
actually does, the way Linear's homepage walks visitors through Intake / Plan / Build / Review
/ Monitor. The user wants the same kind of feature-by-feature introduction on Guidon's landing
page, so someone arriving via a shared link understands the product before signing up.

This is a content/layout addition to an existing static page, not an in-app onboarding tour -
that direction was explicitly considered and rejected in favor of expanding the public landing
page.

## Design

Replace the current 3-card grid on `src/app/page.tsx` with 6 alternating feature sections,
inserted between the hero and the pricing section. Hero and pricing are unchanged.

Each section: an icon in a colored square (same `bg-primary/10` treatment already used on the
page and in `pricing-section.tsx`), a heading, a 2-3 sentence description, and 2-3 bullet
points of concrete capabilities. Layout alternates icon-left/text-right and text-left/icon-right
on desktop (`md:` breakpoint), stacks vertically on mobile.

Sections, drawn from Guidon's real nav (`src/components/layout/app-sidebar.tsx`) so copy stays
accurate:

1. **Task Board** (`CheckSquare`) - Kanban board with per-project configurable columns
   (rename/reorder/hide statuses).
2. **AI Task API** (`Cpu`) - AI agents can pick up and complete tasks autonomously via the
   API, moving them through the same board humans use.
3. **Decisions** (`FileText`) - a log of architectural/technical decisions with rationale,
   so the "why" behind a choice isn't lost. Matches the icon `app-sidebar.tsx` already uses
   for Decisions.
4. **Knowledge Base** (`BookOpen`) - sources, documentation, and tracked technologies per
   project.
5. **Memory & Context Graph** (`Brain` / `Network`) - persistent project knowledge plus
   relations connecting decisions, sources, and tasks to each other.
6. **Roadmap** (`GitBranch`) - phases and long-range planning. Matches the icon
   `app-sidebar.tsx` already uses for Roadmap.

No new dependencies (no carousel/tour library). Pure Tailwind + existing `Card`/`Badge`/
`WavesBackground` components and the semantic color tokens already in use on this page. All
copy is static; the page keeps its current `revalidate = 3600` static rendering - no new
queries.

## Testing

Visual check only: load `/` in the browser preview at desktop and mobile widths, confirm the
new sections render, alternate correctly, and match dark/light theme (semantic tokens already
handle this). No unit tests needed for static marketing copy.
