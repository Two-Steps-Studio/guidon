import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Bot, Building2, Crown, FolderKanban, Shield, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isAiAccountEmail } from "@/lib/ai-account-email";

export interface TreeMember {
  userId: string;
  role: string;
  name: string;
  email: string;
}

export interface TreeProject {
  id: string;
  name: string;
  /** Project role per user id - only projects the viewer can see (RLS). */
  roles: Map<string, string>;
}

const GROUPS = [
  { key: "owner", icon: Crown },
  { key: "admin", icon: Shield },
  { key: "member", icon: User },
  { key: "ai", icon: Bot },
] as const;

/**
 * The organization as a tree: who's at the top (owner), who manages
 * (admins), who works in it (members), its AI accounts - and under each
 * person the projects they're on, with their role there. Collapsible with
 * plain <details>, so it needs no client code.
 */
export async function MembersTree({
  orgId,
  orgName,
  members,
  projects,
}: {
  orgId: string;
  orgName: string;
  members: TreeMember[];
  projects: TreeProject[];
}) {
  const t = await getTranslations("organizations.members");
  const tCommon = await getTranslations("organizations.common");
  const tRole = await getTranslations("common");

  const groupOf = (member: TreeMember) => (isAiAccountEmail(member.email) ? "ai" : member.role === "owner" || member.role === "admin" ? member.role : "member");

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm sm:p-6">
      <div className="flex flex-wrap items-center gap-2 font-semibold [overflow-wrap:anywhere]">
        <Building2 className="h-4 w-4 shrink-0 text-primary" />
        {orgName}
        <span className="font-normal text-muted-foreground">· {t("treePeople", { count: members.length })}</span>
      </div>

      <ul className="mt-3 space-y-1 border-l border-border pl-4">
        {GROUPS.map(({ key, icon: Icon }) => {
          const people = members.filter((member) => groupOf(member) === key);
          if (people.length === 0) return null;
          return (
            <li key={key}>
              <details open className="group/role">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted [&::-webkit-details-marker]:hidden">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{t(`treeGroup.${key}`)}</span>
                  <span className="text-xs text-muted-foreground">{people.length}</span>
                </summary>
                <ul className="ml-2 space-y-1 border-l border-border pl-4">
                  {people.map((person) => {
                    const onProjects = projects.filter((project) => project.roles.has(person.userId));
                    return (
                      <li key={person.userId}>
                        <details className="group/person">
                          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted [&::-webkit-details-marker]:hidden">
                            <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{person.name}</span>
                            {person.name !== person.email && !isAiAccountEmail(person.email) && (
                              <span className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">{person.email}</span>
                            )}
                            <Badge variant="outline" className="text-[10px]">
                              {tCommon("role", { role: person.role })}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{t("treeProjects", { count: onProjects.length })}</span>
                          </summary>
                          {onProjects.length > 0 && (
                            <ul className="ml-2 space-y-0.5 border-l border-border py-1 pl-4">
                              {onProjects.map((project) => (
                                <li key={project.id} className="flex flex-wrap items-center gap-2 px-1.5 py-0.5">
                                  <FolderKanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  <Link href={`/projects/${project.id}/members`} className="min-w-0 hover:underline [overflow-wrap:anywhere]">
                                    {project.name}
                                  </Link>
                                  <span className="text-xs text-muted-foreground">
                                    {tRole("role", { role: project.roles.get(person.userId) ?? "viewer" })}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>

      {projects.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          {t("treeHint")}{" "}
          <Link href={`/organizations/${orgId}`} className="underline underline-offset-2">
            {t("treeAllProjects")}
          </Link>
        </p>
      )}
    </div>
  );
}
