import { MessageSquare } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { listFeedbackForAdmin, resolveProfilesForAdmin, type AdminActorProfile } from "@/lib/data/admin";

function nameFor(profile: AdminActorProfile | undefined, anonymous: string): string {
  if (!profile) return anonymous;
  return profile.full_name || profile.email;
}

/**
 * Instance-wide feedback inbox - same shape as /admin/logs (read-only,
 * service-role, cross-tenant by design). Submitted from the profile menu's
 * "Send feedback" dialog (src/components/layout/feedback-dialog.tsx ->
 * src/app/feedback/actions.ts) on any page, so page_url is shown when
 * present but never assumed.
 */
export default async function AdminFeedbackPage() {
  await requireAdminAccess();
  const t = await getTranslations("admin");

  const entries = await listFeedbackForAdmin();

  // user_id references profiles(id) ON DELETE SET NULL - resolved
  // separately, same pattern as the logs page.
  const userIds = Array.from(new Set(entries.map((entry) => entry.user_id).filter((id): id is string => !!id)));
  const profilesData = await resolveProfilesForAdmin(userIds);
  const profilesById = new Map(profilesData.map((p) => [p.id, p]));

  return (
    <div className="container mx-auto max-w-7xl space-y-4 px-6 py-8">
      <div>
        <h2 className="text-2xl font-bold">{t("feedbackTitle")}</h2>
        <p className="text-muted-foreground">{t("feedbackDescription")}</p>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={t("feedbackEmptyTitle")}
          description={t("feedbackEmptyDescription")}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {entries.map((entry) => {
                const author = entry.user_id ? profilesById.get(entry.user_id) : undefined;

                return (
                  <li key={entry.id} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-hover">
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="whitespace-pre-wrap text-sm">{entry.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("feedbackFrom", { name: nameFor(author, t("feedbackAnonymous")) })}
                        {" · "}
                        {new Date(entry.created_at).toLocaleString()}
                        {entry.page_url && <> · {t("feedbackPageContext", { page: entry.page_url })}</>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
