# Guidon Rebrand — Plan 1a: Tokens, Typography, Shape, Consistency

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved visual rebrand (electric blue accent, Geist typography, sharper/flatter shape) at the design-system level, and fix the four concrete consistency bugs found during the code audit — all without touching navigation structure (that's Plan 1b).

**Architecture:** Everything here flows from three low-level changes — `globals.css` tokens, `layout.tsx` fonts, and the four shared `components/ui/*` primitives — which every page already consumes, so most of the visual change is "free." The remaining tasks are mechanical, per-file fixes: a new shared `EmptyState` component replacing 14 duplicated blocks, three files with hardcoded Tailwind colors moving to design tokens, eleven pages getting a unified container width, and three admin tables getting a hover state.

**Tech Stack:** Tailwind v4 (`@theme inline` bridge), `next/font/google` (Geist, Geist Mono), shadcn "new-york" component primitives, CVA.

Spec: `docs/superpowers/specs/2026-08-22-guidon-rebrand-design.md`

---

### Task 1: Design tokens — electric blue accent + radius token

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Update the light-mode `:root` block**

In `src/app/globals.css`, replace the `/* Brand */` block (currently lines 18-30):

```css
  /* Brand */
  --color-primary: #1d4fd8;
  --color-primary-hover: #1640b0;
  --color-primary-active: #0f2f85;
  --color-primary-foreground: #ffffff;

  --color-accent: #f1f5f9;
  --color-accent-hover: #e2e8f0;
  --color-accent-active: #cbd5e1;
  --color-accent-foreground: #0f172a;

  --color-brand: #1d4fd8;
  --color-brand-accent: #4d8dff;
```

Replace `--color-ring: #0f6b5a;` (currently line 93, inside the `/* Components */` block) with:

```css
  --color-ring: #1d4fd8;
```

Add a new token at the end of the `:root` block, right after `--foreground: var(--color-text);` (currently line 102):

```css
  --radius: 0.375rem;
```

- [ ] **Step 2: Update the system-dark-mode block**

In the `@media (prefers-color-scheme: dark)` block's `:root:not([data-theme="light"])` selector, replace its `--color-primary*` lines (currently lines 108-111):

```css
    --color-primary: #4d8dff;
    --color-primary-hover: #6ea3ff;
    --color-primary-active: #3a76e6;
    --color-primary-foreground: #05142e;
```

Replace `--color-ring: #2dd4a7;` (currently line 172) with:

```css
    --color-ring: #4d8dff;
```

This block does not need its own `--radius` — the token doesn't change between light and dark, so it stays defined once on `:root` (Step 1) and inherits.

- [ ] **Step 3: Update the explicit-dark-mode block**

In the `:root[data-theme="dark"]` block, replace its `--color-primary*` lines (currently lines 183-186):

```css
  --color-primary: #4d8dff;
  --color-primary-hover: #6ea3ff;
  --color-primary-active: #3a76e6;
  --color-primary-foreground: #05142e;
```

Replace `--color-ring: #2dd4a7;` (currently line 247) with:

```css
  --color-ring: #4d8dff;
```

- [ ] **Step 4: Bridge the new `--radius` token into `@theme inline`**

In the `@theme inline` block, add this line immediately after `--color-priority-critical: var(--color-priority-critical);` (currently line 333, right before the blank line that precedes `--font-sans`):

```css
  --radius: var(--radius);
```

- [ ] **Step 5: Verify no leftover teal references**

Run: `grep -n "0f6b5a\|2dd4a7\|176b5b\|57d6b3" src/app/globals.css`
Expected: no output (all four old hex values fully replaced).

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css
git commit -m "Replace teal/green brand tokens with electric blue, add --radius token"
```

---

### Task 2: Typography — Geist Sans + Geist Mono

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Swap the font import and variables**

Replace `src/app/layout.tsx` in full:

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next"
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Guidon - Context-First Project Management",
  description: "Understand why your project exists. Context-first project management for development teams.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-screen bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
```

(The `Analytics` import was already unused before this change — `npm run lint` already reports `'Analytics' is defined but never used` today. Leaving it as pre-existing, unrelated lint debt; not introduced by this task.)

- [ ] **Step 2: Point the CSS font bridge at the new variables**

In `src/app/globals.css`, inside the `@theme inline` block, replace the `--font-sans`/`--font-mono` lines (currently lines 335-338):

```css
  --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system,
    "Segoe UI", Roboto, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
    "Liberation Mono", monospace;
```

- [ ] **Step 3: Update the `body` rule's duplicate font stack**

Replace the `font-family` line inside the `body` rule (currently part of lines 360-368):

```css
body {
  background: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system,
    "Segoe UI", Roboto, sans-serif;
  font-feature-settings: "cv02", "cv03", "cv04", "cv11";
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
```

- [ ] **Step 4: Verify no leftover Inter references**

Run: `grep -rn "font-inter\|from \"next/font/google\"" src/app/layout.tsx src/app/globals.css`
Expected: only the new `Geist`/`Geist_Mono` import line and no `--font-inter` occurrences.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "Replace Inter with Geist Sans, add Geist Mono for numeric accents"
```

---

### Task 3: Apply mono font to dashboard stat values

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add `font-mono` to the four stat numbers**

In `src/app/dashboard/page.tsx`, each of the four stat `<div>`s currently reads `<div className="text-2xl font-bold">{stats.X}</div>` (lines 140, 150, 160, 170). Replace all four with `font-mono` added:

```typescript
              <div className="text-2xl font-bold font-mono">{stats.total_projects}</div>
```
```typescript
              <div className="text-2xl font-bold font-mono">{stats.totalTasks}</div>
```
```typescript
              <div className="text-2xl font-bold font-mono">{stats.completedTasks}</div>
```
```typescript
              <div className="text-2xl font-bold font-mono">{stats.totalDecisions}</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Use the mono font for dashboard stat values"
```

---

### Task 4: Shared component shape — flatter, sharper

**Files:**
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/input.tsx`

- [ ] **Step 1: Flatten `Card`**

In `src/components/ui/card.tsx`, replace the `Card` component's className (currently line 12):

```typescript
      "rounded-[var(--radius)] border bg-card text-card-foreground shadow-none",
```

- [ ] **Step 2: Remove shadows from `Button` variants**

In `src/components/ui/button.tsx`, replace the `variants.variant` object (currently lines 13-24):

```typescript
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
```

(Only the trailing `shadow`/`shadow-sm` classes are removed from `default`, `destructive`, `outline`, and `secondary` — everything else in each variant string is unchanged.)

- [ ] **Step 3: Remove the shadow from `Input`**

In `src/components/ui/input.tsx`, replace the class string (currently line 13):

```typescript
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
```

(Only `shadow-sm` is removed; everything else is unchanged. `rounded-md` is left as-is on both `Button` and `Input` — Tailwind's `rounded-md` is already 6px, matching the new `--radius` token's value, so there's no visible difference and no need to introduce the CSS-variable form on every primitive.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/card.tsx src/components/ui/button.tsx src/components/ui/input.tsx
git commit -m "Flatten Card/Button/Input: smaller radius token, no shadows"
```

---

### Task 5: New shared `EmptyState` component

**Files:**
- Create: `src/components/ui/empty-state.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/ui/empty-state.tsx`:

```typescript
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/**
 * The icon-in-a-tinted-square treatment matches the feature cards on the
 * public landing page (src/app/page.tsx) — reused here so every empty state
 * in the app gets the same, more finished look instead of the plain muted
 * icon each of the 14 previous call sites hand-rolled slightly differently.
 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">{title}</h3>
        {description && (
          <p className="mb-4 max-w-md text-center text-muted-foreground">{description}</p>
        )}
        {action}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/empty-state.tsx
git commit -m "Add shared EmptyState component"
```

---

### Task 6: Migrate dashboard and organizations-list empty states

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/organizations/page.tsx`
- Modify: `src/app/projects/page.tsx`

- [ ] **Step 1: `dashboard/page.tsx`**

Add the import (alongside the existing `lucide-react` import line):

```typescript
import { EmptyState } from "@/components/ui/empty-state";
```

Replace the empty-state block (currently lines 186-200):

```typescript
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Create your first project to get started with Guidon"
            action={
              <Button asChild>
                <Link href="/organizations">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Project
                </Link>
              </Button>
            }
          />
```

- [ ] **Step 2: `organizations/page.tsx`**

Add the import:

```typescript
import { EmptyState } from "@/components/ui/empty-state";
```

Replace the empty-state block (currently lines 64-80):

```typescript
          <EmptyState
            icon={Building2}
            title="No organizations yet"
            description="Create your first organization to start managing projects"
            action={
              <CreateOrganizationDialog
                trigger={
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Organization
                  </Button>
                }
              />
            }
          />
```

- [ ] **Step 3: `projects/page.tsx`**

Add the import:

```typescript
import { EmptyState } from "@/components/ui/empty-state";
```

Replace the empty-state block (currently lines 144-170ish — the `<Card>...</Card>` wrapping the conditional description/action):

```typescript
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description={
              organizations.length === 0
                ? "Create an organization first to start managing projects"
                : "Create your first project to get started"
            }
            action={
              organizations.length === 0 ? (
                <Button asChild>
                  <Link href="/organizations">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Organization
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/organizations">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Project
                  </Link>
                </Button>
              )
            }
          />
```

This replaces the whole `{projects.length === 0 ? (<Card>...</Card>) : (...)}` block's true-branch (currently `src/app/projects/page.tsx` lines 144-174) — the `<Card>` (no `border-dashed` here, unlike most other instances) wrapping a `<CardContent>` with the icon, heading, and the inner `organizations.length === 0` ternary between "Create an organization first..." / "Create Organization" and "Create your first project..." / "Create Project", both branches linking to `/organizations`. The false-branch (the actual projects grid, starting at the `) : (` that follows) is untouched.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx src/app/organizations/page.tsx src/app/projects/page.tsx
git commit -m "Migrate dashboard/organizations/projects empty states to EmptyState"
```

---

### Task 7: Migrate project-workspace empty states (decisions, roadmap, memory, files, activity)

**Files:**
- Modify: `src/app/projects/[id]/decisions/page.tsx`
- Modify: `src/app/projects/[id]/roadmap/page.tsx`
- Modify: `src/app/projects/[id]/memory/page.tsx`
- Modify: `src/app/projects/[id]/files/files-browser.tsx`
- Modify: `src/app/projects/[id]/activity/page.tsx`

- [ ] **Step 1: `decisions/page.tsx`**

Add the import:

```typescript
import { EmptyState } from "@/components/ui/empty-state";
```

Replace the empty-state block (currently lines 60-79):

```typescript
        <EmptyState
          icon={CheckCircle2}
          title="No decisions yet"
          description="Record important project decisions to preserve context and rationale"
          action={
            canWrite ? (
              <CreateDecisionDialog
                projectId={projectId}
                trigger={
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Decision
                  </Button>
                }
              />
            ) : undefined
          }
        />
```

- [ ] **Step 2: `roadmap/page.tsx`**

Add the import:

```typescript
import { EmptyState } from "@/components/ui/empty-state";
```

Replace the empty-state block (currently lines 60-77-ish, the `<Card className="border-dashed">...</Card>` starting at line 60):

```typescript
      <EmptyState
        icon={TrendingUp}
        title="No roadmap phases yet"
        description="Create your first phase to start planning your project timeline"
        action={
          canManage ? (
            <CreatePhaseDialog
              projectId={projectId}
              trigger={
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Phase
                </Button>
              }
            />
          ) : undefined
        }
      />
```

- [ ] **Step 3: `memory/page.tsx`**

Add the import:

```typescript
import { EmptyState } from "@/components/ui/empty-state";
```

Replace the empty-state block (currently lines 117-134-ish):

```typescript
        <EmptyState
          icon={Brain}
          title="No memories yet"
          description="Start capturing project knowledge and insights"
          action={
            canWrite ? (
              <CreateMemoryDialog
                projectId={projectId}
                trigger={
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Memory
                  </Button>
                }
              />
            ) : undefined
          }
        />
```

- [ ] **Step 4: `files-browser.tsx`**

Add the import:

```typescript
import { EmptyState } from "@/components/ui/empty-state";
```

Replace the empty-state block (currently lines 175-189):

```typescript
        <EmptyState
          icon={FileText}
          title="No files yet"
          description="Upload project documents and assets"
          action={
            canWrite ? (
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Upload File
              </Button>
            ) : undefined
          }
        />
```

- [ ] **Step 5: `activity/page.tsx`**

Add the import:

```typescript
import { EmptyState } from "@/components/ui/empty-state";
```

Replace the empty-state block (currently lines 71-79):

```typescript
        <EmptyState
          icon={ActivityIcon}
          title="No activity yet"
          description="Changes on this project will show up here once they happen."
        />
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/projects/[id]/decisions/page.tsx src/app/projects/[id]/roadmap/page.tsx src/app/projects/[id]/memory/page.tsx src/app/projects/[id]/files/files-browser.tsx src/app/projects/[id]/activity/page.tsx
git commit -m "Migrate project-workspace empty states to EmptyState"
```

---

### Task 8: Migrate remaining empty states (context tabs, org members, admin)

**Files:**
- Modify: `src/app/projects/[id]/context/context-tabs.tsx`
- Modify: `src/app/organizations/[id]/members/page.tsx`
- Modify: `src/app/admin/organizations/page.tsx`
- Modify: `src/app/admin/users/page.tsx`
- Modify: `src/app/admin/logs/page.tsx`

- [ ] **Step 1: `context-tabs.tsx` (three empty states in one file)**

Add the import:

```typescript
import { EmptyState } from "@/components/ui/empty-state";
```

Replace the decisions empty-state block (currently lines 77-96):

```typescript
            <EmptyState
              icon={FileText}
              title="No decisions yet"
              description="Record important project decisions to preserve context"
              action={
                canWrite ? (
                  <CreateDecisionDialog
                    projectId={projectId}
                    trigger={
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Decision
                      </Button>
                    }
                  />
                ) : undefined
              }
            />
```

Replace the relations empty-state block (currently lines 155-164):

```typescript
            <EmptyState
              icon={Link2}
              title="No relations yet"
              description="Create relations to link project entities together"
              action={canWrite ? <CreateRelationDialog projectId={projectId} /> : undefined}
            />
```

Replace the sources empty-state block (currently lines 183-202):

```typescript
            <EmptyState
              icon={FileText}
              title="No sources yet"
              description="Add knowledge sources to build project context"
              action={
                canWrite ? (
                  <CreateSourceDialog
                    projectId={projectId}
                    trigger={
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Source
                      </Button>
                    }
                  />
                ) : undefined
              }
            />
```

- [ ] **Step 2: `organizations/[id]/members/page.tsx`**

Add the import:

```typescript
import { EmptyState } from "@/components/ui/empty-state";
```

Replace the empty-state block (currently lines 95-113-ish):

```typescript
          <EmptyState
            icon={Users}
            title="No members yet"
            description="Add team members to collaborate on projects"
            action={
              canManage ? (
                <AddMemberDialog
                  orgId={orgId}
                  isOwner={access.role === "owner"}
                  trigger={
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Member
                    </Button>
                  }
                />
              ) : undefined
            }
          />
```

- [ ] **Step 3: `admin/organizations/page.tsx`**

Add the import:

```typescript
import { EmptyState } from "@/components/ui/empty-state";
```

Replace the empty-state block (currently lines 21-31):

```typescript
        <EmptyState
          icon={Building2}
          title="No organizations yet"
          description="Organizations created on this instance will show up here."
        />
```

- [ ] **Step 4: `admin/users/page.tsx`**

Add the import:

```typescript
import { EmptyState } from "@/components/ui/empty-state";
```

Replace the empty-state block (currently lines 20-27):

```typescript
      <EmptyState icon={Users} title="No users yet" />
```

- [ ] **Step 5: `admin/logs/page.tsx`**

Add the import:

```typescript
import { EmptyState } from "@/components/ui/empty-state";
```

Replace the empty-state block (currently lines 55-66):

```typescript
        <EmptyState
          icon={ActivityIcon}
          title="No activity yet"
          description="Nothing in Guidon currently writes to activity_logs, so this stays empty until a future feature starts logging here."
        />
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. In particular, check whether `Card`/`CardContent` are still used elsewhere in each of these five files — if a file's only use of `Card`/`CardContent` was the empty state just replaced, remove that now-unused import (TypeScript will flag it as unused, or `npm run lint` will).

- [ ] **Step 7: Commit**

```bash
git add src/app/projects/[id]/context/context-tabs.tsx src/app/organizations/[id]/members/page.tsx src/app/admin/organizations/page.tsx src/app/admin/users/page.tsx src/app/admin/logs/page.tsx
git commit -m "Migrate remaining empty states (context tabs, org members, admin) to EmptyState"
```

---

### Task 9: Fix hardcoded status colors

**Files:**
- Modify: `src/app/projects/[id]/files/files-browser.tsx`
- Modify: `src/app/organizations/[id]/page.tsx`
- Modify: `src/app/organizations/[id]/members/page.tsx`

- [ ] **Step 1: `files-browser.tsx`'s `FILE_TYPE_COLORS`**

Replace the map (currently lines 34-40):

```typescript
const FILE_TYPE_COLORS: Record<string, string> = {
  "application/pdf": "bg-danger/10 text-danger",
  "image/": "bg-info/10 text-info",
  "text/": "bg-success/10 text-success",
  "audio/": "bg-primary/10 text-primary",
  "video/": "bg-warning/10 text-warning",
};
```

Replace the fallback in `getFileColor` (currently line 53):

```typescript
  return "bg-muted text-muted-foreground";
```

- [ ] **Step 2: `organizations/[id]/page.tsx`'s status badge**

Replace the ternary (currently lines 116-123):

```typescript
                      <span
                        className={`px-2 py-1 rounded-full ${
                          project.status === "active"
                            ? "bg-success/10 text-success"
                            : project.status === "archived"
                              ? "bg-muted text-muted-foreground"
                              : "bg-danger/10 text-danger"
                        }`}
                      >
```

- [ ] **Step 3: `organizations/[id]/members/page.tsx`'s `ROLE_COLORS`**

Delete the `ROLE_COLORS` map entirely (currently lines 23-27):

```typescript
const ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-100 text-purple-800",
  admin: "bg-blue-100 text-blue-800",
  member: "bg-gray-100 text-gray-800",
};
```

Replace its one usage site (currently line 133, inside the member-row `<Badge className={ROLE_COLORS[member.role] || ROLE_COLORS.member}>`):

```typescript
                    <Badge variant={member.role === "owner" ? "default" : member.role === "admin" ? "secondary" : "outline"}>
                      <Shield className="h-3 w-3 mr-1" />
                      {member.role}
                    </Badge>
```

(This is already a `Badge`, not a plain `<span>` — only the `className={ROLE_COLORS[...]}` prop is replaced with `variant={...}`; the `<Shield>` icon and `{member.role}` children are unchanged. `Badge` is already imported in this file.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/projects/[id]/files/files-browser.tsx "src/app/organizations/[id]/page.tsx" "src/app/organizations/[id]/members/page.tsx"
git commit -m "Replace hardcoded status colors with design tokens (dark-mode safe)"
```

---

### Task 10: Unify page container width and padding

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/organizations/page.tsx`
- Modify: `src/app/organizations/[id]/page.tsx`
- Modify: `src/app/organizations/[id]/members/page.tsx`
- Modify: `src/app/projects/page.tsx`
- Modify: `src/app/projects/[id]/activity/page.tsx`
- Modify: `src/app/projects/[id]/decisions/page.tsx`
- Modify: `src/app/projects/[id]/files/page.tsx`
- Modify: `src/app/projects/[id]/memory/page.tsx`
- Modify: `src/app/projects/[id]/page.tsx`
- Modify: `src/app/projects/[id]/roadmap/page.tsx`

All eleven files converge on the same wrapper: `container mx-auto max-w-7xl px-6 py-8`. `src/app/page.tsx` (marketing landing, `px-4 py-20`), `src/app/profile/page.tsx` (`max-w-2xl`, a single-column form), and `src/app/projects/[id]/settings/page.tsx` (`max-w-4xl`, also a form) are deliberately different and are NOT touched by this task.

- [ ] **Step 1: `dashboard/page.tsx:126`**

```typescript
      <div className="container mx-auto max-w-7xl px-6 py-8">
```

- [ ] **Step 2: `organizations/page.tsx:54`**

```typescript
      <div className="container mx-auto max-w-7xl px-6 py-8">
```

- [ ] **Step 3: `organizations/[id]/page.tsx:48`**

```typescript
      <div className="container mx-auto max-w-7xl px-6 py-8">
```

- [ ] **Step 4: `organizations/[id]/members/page.tsx:80`**

```typescript
      <div className="container mx-auto max-w-7xl px-6 py-8">
```

- [ ] **Step 5: `projects/page.tsx:92`**

```typescript
      <div className="container mx-auto max-w-7xl px-6 py-8">
```

- [ ] **Step 6: `projects/[id]/activity/page.tsx:64`**

```typescript
    <div className="container mx-auto max-w-7xl px-6 py-8">
```

- [ ] **Step 7: `projects/[id]/decisions/page.tsx:45`**

```typescript
    <div className="container mx-auto max-w-7xl px-6 py-8">
```

- [ ] **Step 8: `projects/[id]/files/page.tsx:37`**

```typescript
    <div className="container mx-auto max-w-7xl px-6 py-8">
```

- [ ] **Step 9: `projects/[id]/memory/page.tsx:95`**

```typescript
    <div className="container mx-auto max-w-7xl px-6 py-8">
```

- [ ] **Step 10: `projects/[id]/page.tsx:91`**

```typescript
    <div className="container mx-auto max-w-7xl px-6 py-8">
```

- [ ] **Step 11: `projects/[id]/roadmap/page.tsx:45`**

```typescript
    <div className="container mx-auto max-w-7xl px-6 py-8">
```

- [ ] **Step 12: Verify every target line matches**

Run: `grep -rn "container mx-auto" src/app/dashboard/page.tsx src/app/organizations/page.tsx "src/app/organizations/[id]/page.tsx" "src/app/organizations/[id]/members/page.tsx" src/app/projects/page.tsx "src/app/projects/[id]/activity/page.tsx" "src/app/projects/[id]/decisions/page.tsx" "src/app/projects/[id]/files/page.tsx" "src/app/projects/[id]/memory/page.tsx" "src/app/projects/[id]/page.tsx" "src/app/projects/[id]/roadmap/page.tsx"`
Expected: all eleven lines read exactly `container mx-auto max-w-7xl px-6 py-8`.

- [ ] **Step 13: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (these are className-only edits, should be a no-op for types).

- [ ] **Step 14: Commit**

```bash
git add src/app/dashboard/page.tsx src/app/organizations/page.tsx "src/app/organizations/[id]/page.tsx" "src/app/organizations/[id]/members/page.tsx" src/app/projects/page.tsx "src/app/projects/[id]/activity/page.tsx" "src/app/projects/[id]/decisions/page.tsx" "src/app/projects/[id]/files/page.tsx" "src/app/projects/[id]/memory/page.tsx" "src/app/projects/[id]/page.tsx" "src/app/projects/[id]/roadmap/page.tsx"
git commit -m "Unify page container width/padding across the app"
```

---

### Task 11: Admin table row hover

**Files:**
- Modify: `src/app/admin/organizations/page.tsx`
- Modify: `src/app/admin/users/page.tsx`
- Modify: `src/app/admin/logs/page.tsx`

`admin/logs/page.tsx` renders a `<ul>` of entries, not a `<table>` — check at implementation time whether it has an equivalent per-row hover already; if its list items already have a hover class, leave it, and only add hover states to the two files below that don't.

- [ ] **Step 1: `admin/organizations/page.tsx`**

Replace the `<tr>` inside `tbody.map` (currently `<tr key={org.id} className="[&>td]:px-4 [&>td]:py-3">`):

```typescript
                  <tr key={org.id} className="[&>td]:px-4 [&>td]:py-3 hover:bg-surface-hover">
```

- [ ] **Step 2: `admin/users/page.tsx`**

Replace the `<tr>` inside `tbody.map` (currently `<tr key={user.id} className="[&>td]:px-4 [&>td]:py-3">`):

```typescript
                  <tr key={user.id} className="[&>td]:px-4 [&>td]:py-3 hover:bg-surface-hover">
```

- [ ] **Step 3: `admin/logs/page.tsx`**

Its entries render as a `<ul className="divide-y divide-border">` of `<li>` elements (not a `<table>`), with no hover class today. Replace the `<li>` (currently `<li key={entry.id} className="flex items-start gap-3 px-4 py-3">`):

```typescript
                  <li key={entry.id} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-hover">
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/organizations/page.tsx src/app/admin/users/page.tsx src/app/admin/logs/page.tsx
git commit -m "Add row hover state to admin tables"
```

---

### Task 12: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Type-check and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: `tsc` clean. `lint` should show the same pre-existing `no-explicit-any` errors and the `Analytics`/`projectColor` unused-var warnings documented in the prior (project-limit) session's audit — no *new* errors introduced by this plan's files. If any of Task 8's five files still import `Card`/`CardContent` unused after the empty-state migration, fix those specific unused-import warnings now.

- [ ] **Step 2: Production build**

```bash
npm run build
```

Expected: builds successfully, same environment requirements as before (`.env.local` already present in this repo).

- [ ] **Step 3: Visual check, if the Browser pane is available**

Start the dev server (`guidon-dev` in `.claude/launch.json`) and check, in both light and dark:
- `/` — landing page renders with the new blue accent and Geist font.
- `/dashboard` — stat numbers render in the mono font; empty state (if no projects) shows the new icon-in-square treatment.
- A project's `/decisions` or `/roadmap` page — empty state (if empty) matches the new treatment; page content is capped at the same width as `/organizations`.
- `/admin/organizations` — table rows highlight on hover.

If the Browser pane's screenshot tool is unavailable in this environment (confirmed unavailable earlier in this project's session — "the Browser pane is not displayed" — this may or may not still be true at execution time), use `read_page`/`get_page_text` to confirm the expected classes and text render, consistent with how the previous (project-limit) plan handled the same constraint.
