import { dataClient } from "@/lib/data-client";
import type { ProjectId } from "@/types/index";

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

export async function getWhiteboards(projectId: ProjectId) {
  return await dataClient(projectId).from("whiteboards").select("*").order("created_at", { ascending: false });
}

export async function createWhiteboard(projectId: ProjectId, name: string) {
  const { data, error } = await dataClient(projectId)
    .from("whiteboards")
    .insert({ project_id: projectId, name })
    .select()
    .single();

  if (error) throw new Error(`Failed to create whiteboard: ${error.message}`);
  return data;
}

export async function deleteWhiteboard(boardId: string, projectId: ProjectId) {
  // Note: Cascade delete in DB handles elements
  const { error } = await dataClient(projectId)
    .from("whiteboards")
    .delete()
    .eq("id", boardId);

  if (error) throw new Error(`Failed to delete whiteboard: ${error.message}`);
}

export async function getElements(boardId: string, projectId: ProjectId) {
  return await dataClient(projectId).from("whiteboard_elements").select("*").eq("board_id", boardId);
}

export async function upsertElement(projectId: ProjectId, element: Partial<WhiteboardElement>) {
  const { data, error } = await dataClient(projectId)
    .from("whiteboard_elements")
    .upsert(element)
    .select()
    .single();

  if (error) throw new Error(`Failed to upsert element: ${error.message}`);
  return data;
}

export async function deleteElements(projectId: ProjectId, ids: string[]) {
  const { error } = await dataClient(projectId)
    .from("whiteboard_elements")
    .delete()
    .in("id", ids);

  if (error) throw new Error(`Failed to delete elements: ${error.message}`);
}
