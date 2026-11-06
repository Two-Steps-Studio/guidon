import { serviceDataClient } from "@/lib/data-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateSupportRecord } from "./support-actions";
import { requireAdminAccess } from "@/lib/data/admin-access";

export async function SupportRecord({ userId, result }: { userId: string; result?: string }) {
  await requireAdminAccess("users.support.manage");
  const db = serviceDataClient();
  const [notes, tags] = await Promise.all([
    db.from<{ id: string; author_id: string; body: string; pinned: boolean; created_at: string }>("platform_admin_notes")
      .select("id, author_id, body, pinned, created_at").eq("user_id", userId).order("pinned", { ascending: false })
      .order("created_at", { ascending: false }).limit(50),
    db.from<{ tag: string }>("platform_admin_user_tags").select("tag").eq("user_id", userId).order("tag").limit(100),
  ]);
  if (notes.error || tags.error) throw new Error("Could not load private support records");
  const action = updateSupportRecord.bind(null, userId);
  return <section className="space-y-3 rounded-xl border p-4">
    <h3 className="text-lg font-semibold">Private support records</h3>
    {result === "saved" && <p role="status">Support record saved.</p>}
    {result === "failed" && <p role="alert">The support record could not be saved.</p>}
    <form action={action} className="space-y-2">
      <input type="hidden" name="operation" value="note" />
      <label className="grid gap-1">Private note
        <textarea name="value" required maxLength={2000} className="min-h-20 rounded-md border bg-background p-2" />
      </label>
      <Button type="submit" size="sm">Add note</Button>
    </form>
    <ul className="divide-y">{notes.data.map(note => <li key={note.id} className="space-y-2 py-2">
      <p className="whitespace-pre-wrap break-words">{note.body}</p>
      <p className="break-all text-xs text-muted-foreground">{note.author_id} · {new Date(note.created_at).toISOString().slice(0, 10)}</p>
      <form action={action}>
        <input type="hidden" name="value" value={note.id} />
        <Button name="operation" value={note.pinned ? "unpin" : "pin"} type="submit" size="sm" variant="outline">
          {note.pinned ? "Unpin note" : "Pin note"}
        </Button>
      </form>
    </li>)}</ul>
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="operation" value="tag" />
      <label className="grid gap-1">Account tag<Input name="value" required maxLength={40} pattern="[a-z0-9][a-z0-9\-]{0,39}" /></label>
      <Button type="submit" size="sm">Add tag</Button>
    </form>
    <ul className="flex flex-wrap gap-2">{tags.data.map(({ tag }) => <li key={tag}>
      <form action={action} className="flex items-center gap-2 rounded border px-2 py-1">
        <input type="hidden" name="value" value={tag} />
        <span>{tag}</span><Button name="operation" value="untag" type="submit" variant="ghost" size="sm">Remove</Button>
      </form>
    </li>)}</ul>
  </section>;
}
