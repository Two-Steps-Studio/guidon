import { Check, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { PROJECT_CAPABILITIES, PROJECT_ROLES, roleCan, type ProjectCapability } from "@/lib/project-permissions";
import type { ProjectRole } from "@/types/project";

const ROLE_LABEL_KEYS = {
  owner: "roleOwner",
  admin: "roleAdmin",
  developer: "roleDeveloper",
  tester: "roleTester",
  viewer: "roleViewer",
} as const satisfies Record<ProjectRole, string>;

const CAPABILITIES = Object.keys(PROJECT_CAPABILITIES) as ProjectCapability[];

/**
 * "What each role can do", read from the same table the permission checks
 * use - before someone picks a role, not after a refused action. The
 * person's own role is highlighted.
 */
export function RoleMatrix({ myRole }: { myRole: ProjectRole | null }) {
  const t = useTranslations("members");
  return (
    <details className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">{t("matrix.title")}</summary>
      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">{t("matrix.title")}</caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-2 font-medium">{t("matrix.action")}</th>
              {PROJECT_ROLES.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className={`px-2 py-2 text-center font-medium ${role === myRole ? "bg-primary/10 text-foreground" : ""}`}
                >
                  {t(ROLE_LABEL_KEYS[role])}
                  {role === myRole && <span className="block text-[10px] font-normal">{t("you")}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {CAPABILITIES.map((capability) => (
              <tr key={capability}>
                <th scope="row" className="px-4 py-2 text-left font-normal">{t(`matrix.${capability}`)}</th>
                {PROJECT_ROLES.map((role) => (
                  <td key={role} className={`px-2 py-2 text-center ${role === myRole ? "bg-primary/10" : ""}`}>
                    {roleCan(role, capability) ? (
                      <Check className="mx-auto h-4 w-4 text-primary" aria-label={t("matrix.yes")} />
                    ) : (
                      <Minus className="mx-auto h-4 w-4 text-muted-foreground/60" aria-label={t("matrix.no")} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{t("matrix.note")}</p>
    </details>
  );
}
