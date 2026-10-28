import { getNow, getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/data/current-user";
import { ProfileForm } from "./profile-form";
import { ApiKeysSection } from "./api-keys";
import { IntegrationsSection } from "./integrations-section";
import { listApiKeys } from "./api-keys-actions";
import { ConnectedAppsSection } from "./connected-apps";
import { getConnectedApps } from "./connected-apps-actions";
import { DeleteAccountSection } from "./delete-account";
import { getMyDeletionPlan } from "./delete-account-actions";
import { AiPreferenceSection } from "./ai-preference";
import { getHideAi } from "@/lib/data/ai-preference";

export default async function ProfilePage() {
  const [user, apiKeys, connectedApps, deletionPlan, now] = await Promise.all([
    getCurrentUser(),
    listApiKeys(),
    getConnectedApps(),
    getMyDeletionPlan(),
    getNow(),
  ]);
  const t = await getTranslations("profile");

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>

        <ProfileForm user={user} />
        <AiPreferenceSection hideAi={await getHideAi(user.id)} />
        <ApiKeysSection initialKeys={apiKeys} />
        <ConnectedAppsSection initialApps={connectedApps} now={now} />
        <IntegrationsSection />
        <DeleteAccountSection email={user.email ?? ""} plan={deletionPlan} />
      </div>
    </AppShell>
  );
}
