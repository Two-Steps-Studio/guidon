import { dataClient } from "@/lib/data-client";
import { isValidUuid } from "@/lib/api/validate-id";

/**
 * Warstwa danych modułu whiteboard. Każde zapytanie idzie przez
 * dataClient(userId) (RLS wywołującego, migracja 107) i jest zawężone do
 * projektu albo zweryfikowanej tablicy tego projektu - sam `id` z
 * przeglądarki nigdy nie wystarcza.
 */

export type WhiteboardElementType = "sticky" | "shape";
export type ShapeKind = "rectangle" | "circle";

export interface WhiteboardElement {
  id: string;
  board_id: string;
  type: WhiteboardElementType;
  x: number;
  y: number;
  content: { text?: string; shape?: ShapeKind; color?: string } | null;
}

export interface WhiteboardEdge {
  id: string;
  source_id: string;
  target_id: string;
  label: string | null;
  type: string;
}

/** What the canvas sends to save one element; parsed before it reaches the database. */
export type ElementInput = Pick<WhiteboardElement, "id" | "type" | "x" | "y"> & {
  content: { text?: string; shape?: ShapeKind; color?: string };
};
export type EdgeInput = Pick<WhiteboardEdge, "id" | "source_id" | "target_id" | "label">;

const TEXT_MAX = 5000;
const LABEL_MAX = 200;
const COLOR = /^#[0-9a-f]{6}$/i;

function parseElement(raw: ElementInput): ElementInput {
  const { id, type, x, y, content } = raw;
  if (!isValidUuid(id)) throw new Error("Invalid element id");
  if (type !== "sticky" && type !== "shape") throw new Error("Invalid element type");
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Invalid element position");
  const text = typeof content?.text === "string" ? content.text.slice(0, TEXT_MAX) : undefined;
  const shape = content?.shape === "circle" || content?.shape === "rectangle" ? content.shape : undefined;
  const color = typeof content?.color === "string" && COLOR.test(content.color) ? content.color : undefined;
  return { id, type, x, y, content: { text, shape, color } };
}

function parseEdge(raw: EdgeInput): EdgeInput {
  if (![raw.id, raw.source_id, raw.target_id].every(isValidUuid)) throw new Error("Invalid edge");
  return {
    id: raw.id,
    source_id: raw.source_id,
    target_id: raw.target_id,
    label: typeof raw.label === "string" ? raw.label.slice(0, LABEL_MAX) : null,
  };
}

/** The project's board (the first one), created on first use with `defaultName`. */
export async function getOrCreateBoard(userId: string, projectId: string, defaultName: string) {
  const db = dataClient(userId);
  const { data, error } = await db
    .from<{ id: string; name: string }>("whiteboards")
    .select("id, name")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`Failed to load the board: ${error.message}`);
  if (data[0]) return data[0];

  const created = await db
    .from<{ id: string; name: string }>("whiteboards")
    .insert({ project_id: projectId, name: defaultName })
    .select("id, name")
    .single();
  if (created.error || !created.data) throw new Error(`Failed to create the board: ${created.error?.message}`);
  return created.data;
}

/** Throws unless `boardId` is a board of `projectId` the caller can see. */
async function requireBoard(userId: string, projectId: string, boardId: string) {
  if (!isValidUuid(boardId)) throw new Error("Invalid board id");
  const { data } = await dataClient(userId)
    .from<{ id: string }>("whiteboards")
    .select("id")
    .eq("id", boardId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) throw new Error("Board not found");
}

export async function getBoardContent(userId: string, projectId: string, boardId: string) {
  await requireBoard(userId, projectId, boardId);
  const db = dataClient(userId);
  const [elements, edges] = await Promise.all([
    db.from<WhiteboardElement>("whiteboard_elements").select("id, board_id, type, x, y, content").eq("board_id", boardId),
    db.from<WhiteboardEdge>("whiteboard_edges").select("id, source_id, target_id, label, type").eq("project_id", projectId).eq("board_id", boardId),
  ]);
  if (elements.error) throw new Error(`Failed to load the board: ${elements.error.message}`);
  if (edges.error) throw new Error(`Failed to load the board: ${edges.error.message}`);
  return { elements: elements.data, edges: edges.data };
}

export async function saveElements(userId: string, projectId: string, boardId: string, inputs: ElementInput[]) {
  await requireBoard(userId, projectId, boardId);
  const db = dataClient(userId);
  // Independent rows: saved in parallel. RLS (107) refuses a viewer or a board of another project.
  const results = await Promise.all(
    inputs.map(parseElement).map((element) =>
      db.upsertRow("whiteboard_elements", { key: { id: element.id }, set: { ...element, board_id: boardId } })
    )
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(`Failed to save the board: ${failed.error.message}`);
}

export async function saveEdges(userId: string, projectId: string, boardId: string, inputs: EdgeInput[]) {
  await requireBoard(userId, projectId, boardId);
  const db = dataClient(userId);
  const results = await Promise.all(
    inputs.map(parseEdge).map((edge) =>
      db.upsertRow("whiteboard_edges", { key: { id: edge.id }, set: { ...edge, project_id: projectId, board_id: boardId } })
    )
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(`Failed to save the board: ${failed.error.message}`);
}

/** Deletes notes and the arrows that touch them, on this board only. */
export async function deleteElements(userId: string, projectId: string, boardId: string, ids: string[]) {
  await requireBoard(userId, projectId, boardId);
  const valid = ids.filter(isValidUuid);
  if (valid.length === 0) return;
  // Arrows go with their notes (ON DELETE CASCADE on source/target).
  const { data, error } = await dataClient(userId)
    .from<{ id: string }>("whiteboard_elements")
    .delete()
    .eq("board_id", boardId)
    .in("id", valid)
    .select("id");
  if (error) throw new Error(`Failed to delete: ${error.message}`);
  if (data.length !== valid.length) throw new Error("Some notes could not be deleted");
}
