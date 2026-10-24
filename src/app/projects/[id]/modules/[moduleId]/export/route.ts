import { getManagedModule } from "@/lib/data/module-manager";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; moduleId: string }> }) {
  const { id, moduleId } = await params;
  const context = await getManagedModule(id, moduleId);
  if (!context) return new Response("Forbidden", { status: 403 });
  const { current } = context;
  return new Response(JSON.stringify({ exportVersion: 1, manifest: current.manifest, records: current.records, settings: current.settings }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="guidon-${moduleId}.json"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
