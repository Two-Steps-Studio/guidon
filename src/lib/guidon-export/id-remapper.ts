/**
 * Tracks old-id -> new-id mappings within one import run, so a section
 * processed later (e.g. roadmap, which links to tasks by their old id) can
 * resolve what a section processed earlier (task-board) actually inserted.
 */
export class IdRemapper {
  private readonly map = new Map<string, string>();

  register(oldId: string, newId: string): void {
    this.map.set(oldId, newId);
  }

  resolve(oldId: string): string | null {
    return this.map.get(oldId) ?? null;
  }
}
