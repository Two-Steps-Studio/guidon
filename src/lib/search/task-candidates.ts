import type { DataClient } from "../data-client/index";
import { likePattern, taskRefBounds } from "./task-search-core";

export interface TaskCandidate {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  project_id: string;
  updated_at: string;
}

export const TASK_CANDIDATES = 2000;
const COLUMNS = "id, title, status, priority, project_id, updated_at";

/** The supplied client must already carry the caller's RLS identity. */
export async function taskCandidates(db: DataClient, query: string, projectId: string | null) {
  const scoped = (columns = COLUMNS) => {
    const builder = db.from<TaskCandidate>("tasks").select(columns);
    return projectId ? builder.eq("project_id", projectId) : builder;
  };
  const pattern = likePattern(query);
  const ref = taskRefBounds(query);
  const [recent, exact, byTitle, byDescription, byId] = await Promise.all([
    scoped().order("updated_at", { ascending: false }).order("id").limit(TASK_CANDIDATES),
    // Separate exact lookup prevents 50 substring matches from crowding it out.
    scoped().ilike("title", pattern.slice(1, -1)).order("updated_at", {ascending:false}).order("id").limit(10),
    scoped().ilike("title", pattern).order("updated_at", {ascending:false}).order("id").limit(50),
    scoped("id, title, description, status, priority, project_id, updated_at").ilike("description", pattern).order("updated_at", {ascending:false}).order("id").limit(50),
    ref ? scoped().gte("id", ref.lower).lte("id", ref.upper).order("updated_at", {ascending:false}).order("id").limit(50)
      : Promise.resolve({data:[],error:null}),
  ]);
  if ([recent, exact, byTitle, byDescription, byId].some(result => result.error)) {
    // Driver errors can contain a query or private row content.
    throw new Error("Could not load search candidates");
  }
  const merged = new Map<string, TaskCandidate>();
  for (const row of [...(byDescription.data ?? []), ...(byId.data ?? []), ...(exact.data ?? []), ...(byTitle.data ?? []), ...(recent.data ?? [])]) {
    if (!merged.has(row.id)) merged.set(row.id, row);
  }
  return {
    tasks: [...merged.values()],
    // Signals bounded selection, not proof that this particular search missed a row.
    limited: (recent.data?.length ?? 0) >= TASK_CANDIDATES ||
      [byTitle, byDescription, byId].some(result => (result.data?.length ?? 0) >= 50),
  };
}
