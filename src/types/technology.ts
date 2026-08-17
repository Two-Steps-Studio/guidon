// ============================================
// TECHNOLOGY TYPE DEFINITIONS
// ============================================

/**
 * A technology used by a project (Next.js, Unreal Engine, C++, ...).
 *
 * Stored in its own table rather than as an array column on `projects`, so
 * that a technology can later carry a version, a category and relations in
 * the project graph without a schema rewrite.
 */
export interface Technology {
  id: string;
  project_id: string;
  name: string;
  icon_slug: string | null;
  version: string | null;
  /** NOT NULL in the database, defaults to 'other'. */
  category: TechnologyCategory;
  description: string | null;
  sort_order: number | null;
  created_at: string;
}

/**
 * Mirrors the CHECK constraint on technologies.category exactly.
 *
 * `game_engine` requires migration 008; without it the database rejects
 * that value. Every other category works on the pre-008 schema.
 *
 * Do not add values here without a migration widening the constraint first —
 * an unknown value is rejected by the database, not silently stored.
 */
export type TechnologyCategory =
  | "frontend"
  | "backend"
  | "game_engine"
  | "database"
  | "devops"
  | "ai"
  | "other";

export const TECHNOLOGY_CATEGORIES: readonly TechnologyCategory[] = [
  "frontend",
  "backend",
  "game_engine",
  "database",
  "devops",
  "ai",
  "other",
] as const;

/** The column is NOT NULL, so every write needs a concrete category. */
export const DEFAULT_TECHNOLOGY_CATEGORY: TechnologyCategory = "other";

export const TECHNOLOGY_CATEGORY_LABELS: Record<TechnologyCategory, string> = {
  frontend: "Frontend",
  backend: "Backend",
  game_engine: "Game engine",
  database: "Database",
  devops: "DevOps",
  ai: "AI",
  other: "Other",
};

/** Display order on the technology page — engines sit next to the languages. */
export const TECHNOLOGY_CATEGORY_ORDER: readonly TechnologyCategory[] = [
  "game_engine",
  "frontend",
  "backend",
  "database",
  "devops",
  "ai",
  "other",
] as const;

export interface CreateTechnologyData {
  project_id: string;
  name: string;
  icon_slug?: string;
  version?: string;
  category?: TechnologyCategory;
  description?: string;
  sort_order?: number;
}

export interface UpdateTechnologyData {
  id: string;
  name?: string;
  icon_slug?: string;
  version?: string;
  category?: TechnologyCategory;
  description?: string;
  sort_order?: number;
}

/**
 * Best-effort category guess for common stacks, used to prefill the picker
 * when a technology is added by name alone. Purely a convenience — the user
 * can always override it.
 */
const CATEGORY_HINTS: Record<string, TechnologyCategory> = {
  // Frontend
  react: "frontend",
  "next.js": "frontend",
  nextjs: "frontend",
  vue: "frontend",
  nuxt: "frontend",
  svelte: "frontend",
  angular: "frontend",
  astro: "frontend",
  typescript: "frontend",
  javascript: "frontend",
  tailwindcss: "frontend",
  tailwind: "frontend",
  "three.js": "frontend",
  electron: "frontend",

  // Game engines (migration 008)
  unity: "game_engine",
  unreal: "game_engine",
  "unreal engine": "game_engine",
  godot: "game_engine",
  bevy: "game_engine",
  cryengine: "game_engine",

  // Backend — systems languages land here; the constraint has no
  // dedicated 'language' category.
  "node.js": "backend",
  nodejs: "backend",
  express: "backend",
  fastapi: "backend",
  django: "backend",
  laravel: "backend",
  python: "backend",
  rust: "backend",
  go: "backend",
  java: "backend",
  kotlin: "backend",
  swift: "backend",
  "c++": "backend",
  "c#": "backend",
  lua: "backend",

  // Database
  postgresql: "database",
  postgres: "database",
  supabase: "database",
  mysql: "database",
  sqlite: "database",
  redis: "database",
  mongodb: "database",

  // DevOps
  docker: "devops",
  kubernetes: "devops",
  vite: "devops",
  webpack: "devops",
  turbopack: "devops",
  git: "devops",
  eslint: "devops",
  vercel: "devops",
  aws: "devops",
  githubactions: "devops",
  "github actions": "devops",

  // AI
  openai: "ai",
  anthropic: "ai",
  claude: "ai",
  pytorch: "ai",
  tensorflow: "ai",
  langchain: "ai",
};

/**
 * Never returns undefined: the column is NOT NULL, so an unrecognised
 * technology is categorised as 'other' rather than failing the insert.
 */
export function guessTechnologyCategory(name: string): TechnologyCategory {
  return (
    CATEGORY_HINTS[name.trim().toLowerCase()] ?? DEFAULT_TECHNOLOGY_CATEGORY
  );
}

/**
 * simple-icons style slug, used for logo lookup later. Derived rather than
 * asked for, so adding a technology stays a one-field action.
 */
export function technologySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\+/g, "plus")
    .replace(/#/g, "sharp")
    .replace(/[^a-z0-9]+/g, "");
}
