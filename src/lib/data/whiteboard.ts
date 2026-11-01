import { dataClient } from "@/lib/data-client";
import type { ProjectId } from "@/types/index";

/**
 * Warstwa danych modułu whiteboard. Każda funkcja przyjmuje `userId`
 * wywołującego i przekazuje go do dataClient(userId): w trybie self-hosted
 * zapytania idą w sesji RLS tego użytkownika, w trybie Supabase klient i tak
 * korzysta z sesji ciasteczkowej.
 */

export interface Whiteboard {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface WhiteboardElement {
  id: string;
  board_id: string;
  type: "sticky" | "text" | "shape" | "arrow";
  x: number;
  y: number;
  width: number;
  height: number;
  content: any;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhiteboardEdge {
  id: string;
  project_id: string;
  board_id: string;
  source_id: string;
  target_id: string;
  label: string | null;
  type: string;
  created_at: string;
  updated_at: string;
}

export async function getWhiteboards(userId: string, projectId: ProjectId) {
  return await dataClient(userId).from("whiteboards").select("*").order("created_at", { ascending: false });
}

export async function createWhiteboard(userId: string, projectId: ProjectId, name: string) {
  const { data, error } = await dataClient(userId)
    .from("whiteboards")
    .insert({ project_id: projectId, name })
    .select()
    .single();

  if (error) throw new Error(`Failed to create whiteboard: ${error.message}`);
  return data;
}

export async function deleteWhiteboard(userId: string, boardId: string, projectId: ProjectId) {
  // Note: Cascade delete in DB handles elements
  const { error } = await dataClient(userId)
    .from("whiteboards")
    .delete()
    .eq("id", boardId);

  if (error) throw new Error(`Failed to delete whiteboard: ${error.message}`);
}

export async function getElements(userId: string, boardId: string, projectId: ProjectId) {
  return await dataClient(userId).from("whiteboard_elements").select("*").eq("board_id", boardId);
}

export async function upsertElement(userId: string, projectId: ProjectId, element: Partial<WhiteboardElement>) {
  const id = element.id;
  if (!id) throw new Error("Element ID is required for upsert");
  // Kolumna top-level `color` nie istnieje - kolor stoi w content.color.
  const { color: _ignoredColor, ...elementWithoutColor } = element as Partial<WhiteboardElement> & { color?: string };

  const result = await dataClient(userId).upsertRow("whiteboard_elements", {
    key: { id },
    set: elementWithoutColor,
  });

  if (result.error) throw new Error(`Failed to upsert element: ${result.error.message}`);

  const { data, error } = await dataClient(userId)
    .from("whiteboard_elements")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(`Failed to fetch updated element: ${error.message}`);
  return data;
}

export async function deleteElements(userId: string, projectId: ProjectId, ids: string[]) {
  const { error } = await dataClient(userId)
    .from("whiteboard_elements")
    .delete()
    .in("id", ids);

  if (error) throw new Error(`Failed to delete elements: ${error.message}`);
}

export async function getEdges(userId: string, boardId: string, projectId: ProjectId) {
  return await dataClient(userId).from("whiteboard_edges").select("*").eq("board_id", boardId);
}

export async function upsertEdge(userId: string, projectId: ProjectId, edge: Partial<WhiteboardEdge>) {
  const id = edge.id;
  if (!id) throw new Error("Edge ID is required for upsert");

  const result = await dataClient(userId).upsertRow("whiteboard_edges", {
    key: { id },
    set: edge,
  });

  if (result.error) throw new Error(`Failed to upsert edge: ${result.error.message}`);

  const { data, error } = await dataClient(userId)
    .from("whiteboard_edges")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(`Failed to fetch updated edge: ${error.message}`);
  return data;
}

export async function deleteEdges(userId: string, projectId: ProjectId, ids: string[]) {
  const { error } = await dataClient(userId)
    .from("whiteboard_edges")
    .delete()
    .in("id", ids);

  if (error) throw new Error(`Failed to delete edges: ${error.message}`);
}
