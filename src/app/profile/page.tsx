import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/data/current-user";
import { ProfileForm } from "./profile-form";
import { ApiKeysSection } from "./api-keys";
import { listApiKeys } from "./api-keys-actions";

export default async function ProfilePage() {
  const [user, apiKeys] = await Promise.all([getCurrentUser(), listApiKeys()]);

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Profile</h1>
          <p className="text-muted-foreground">Manage your account details</p>
        </div>

        <ProfileForm user={user} />
        <ApiKeysSection initialKeys={apiKeys} />
      </div>
    </AppShell>
  );
}
