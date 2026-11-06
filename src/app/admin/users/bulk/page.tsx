import { requireAdminAccess } from "@/lib/data/admin-access";
import { BulkControls } from "./bulk-controls";

export default async function BulkPage() {
  await requireAdminAccess("users.bulk");
  return <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
    <h2 className="text-2xl font-bold">Bulk operations</h2>
    <BulkControls />
  </div>;
}
