import { requireAdminAccess } from "@/lib/data/admin-access";
import { FLAG_KEY } from "@/lib/admin/flag-policy";
import { readFeatureFlag } from "@/lib/admin/feature-flags";
import { Button } from "@/components/ui/button";
import { saveImportFlag } from "./actions";

export default async function FlagsPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  await requireAdminAccess("flags.manage");
  const [flag, { result }] = await Promise.all([readFeatureFlag(FLAG_KEY), searchParams]);
  return <main className="mx-auto max-w-4xl space-y-4 px-4 py-8">
    <h2 className="text-2xl font-bold">Feature flags</h2>
    <p>Invoice history import</p>
    {result === "saved" && <p role="status">Flag saved.</p>}
    {result === "failed" && <p role="alert">The flag could not be saved. Check the JSON values.</p>}
    <p>Set killed to true to disable import for everyone. Explicit user, organization and plan rules grant access before percentage rollout.</p>
    <form action={saveImportFlag} className="space-y-3">
      <label className="grid gap-1">Configuration
        <textarea name="config" rows={12} required maxLength={10000} defaultValue={flag ? JSON.stringify(flag, null, 2) : ""}
          className="rounded-md border bg-background p-3 font-mono text-sm" />
      </label>
      <Button type="submit">Save flag</Button>
    </form>
  </main>;
}
