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

## Out of scope

- New logo/wordmark.
- Navigation/IA changes (the user has independent, uncommitted local changes to `project-sidebar.tsx`'s nav grouping — not part of this spec, not touched by it).
- Marketing copy changes on the landing page.
- A shared `AdminTable` abstraction — the three admin tables get the same inline treatment (hover, inherited Card radius) rather than a new extracted component; three call sites don't justify the abstraction (YAGNI).
- Light-mode/dark-mode priority change — dark-first stays dark-first.
