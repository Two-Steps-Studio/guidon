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

        <nav aria-label={t("title")} className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-primary">
          <a href="#profile-details" className="underline underline-offset-2">{t("title")}</a>
          <a href="#profile-api-keys" className="underline underline-offset-2">{t("apiKeysTitle")}</a>
          <a href="#profile-connected-apps" className="underline underline-offset-2">{t("connectedApps.title")}</a>
          <a href="#profile-integrations" className="underline underline-offset-2">{t("integrationsTitle")}</a>
        </nav>
        <div id="profile-details" className="scroll-mt-16"><ProfileForm user={user} /></div>
        <AiPreferenceSection hideAi={await getHideAi(user.id)} />
        <div id="profile-api-keys" className="scroll-mt-16"><ApiKeysSection initialKeys={apiKeys} /></div>
        <div id="profile-connected-apps" className="scroll-mt-16"><ConnectedAppsSection initialApps={connectedApps} now={now} /></div>
        <div id="profile-integrations" className="scroll-mt-16"><IntegrationsSection /></div>
        <DeleteAccountSection email={user.email ?? ""} plan={deletionPlan} />
      </div>
    </AppShell>
  );
}
