"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Bot, Check, Copy, KeyRound, Loader2, Plus, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectMenu } from "@/components/ui/select-menu";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AiAccount } from "@/lib/data/ai-accounts";
import {
  createAiAccountAction,
  createAiAccountKeyAction,
  disableAiAccountAction,
  revokeAiAccountKeyAction,
} from "./actions";

const ROLES = ["developer", "tester", "viewer"] as const;

export function AiAccountsManager({
  orgId,
  siteUrl,
  accounts,
  projects,
}: {
  orgId: string;
  siteUrl: string;
  accounts: AiAccount[];
  projects: { id: string; name: string }[];
}) {
  const t = useTranslations("aiAccounts");
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<{ account: string; key: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const active = accounts.filter((account) => !account.disabledAt);
  const disabled = accounts.filter((account) => account.disabledAt);

  const run = (work: () => Promise<{ error: string | null }>, done?: () => void) =>
    startTransition(async () => {
      const result = await work();
      if (result.error) toast.error(result.error);
      else {
        done?.();
        router.refresh();
      }
    });

  const addKey = (account: AiAccount) =>
    startTransition(async () => {
      const result = await createAiAccountKeyAction(orgId, account.userId, t("defaultKeyName"));
      if (result.error || !result.data) toast.error(result.error ?? t("failed"));
      else {
        setNewKey({ account: account.name, key: result.data.fullKey });
        router.refresh();
      }
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
        <p className="flex max-w-2xl gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          {t("responsibility")}
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("create")}
        </Button>
      </div>

      {active.length === 0 ? (
        <EmptyState icon={Bot} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        active.map((account) => (
          <Card key={account.userId}>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold">
                    <Bot className="h-4 w-4 text-primary" />
                    {account.name}
                    <Badge variant="outline">AI</Badge>
                  </p>
                  {account.description && <p className="mt-1 text-sm text-muted-foreground">{account.description}</p>}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(t("disableConfirm", { name: account.name }))) {
                      run(() => disableAiAccountAction(orgId, account.userId), () => toast.success(t("disabledToast")));
                    }
                  }}
                >
                  <Power className="mr-1.5 h-3.5 w-3.5" />
                  {t("disable")}
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5 text-xs">
                {account.projects.length === 0 ? (
                  <span className="text-muted-foreground">{t("noProjects")}</span>
                ) : (
                  account.projects.map((project) => (
                    <Badge key={project.id} variant="secondary">
                      {project.name} · {t(`role_${project.role}` as "role_developer")}
                    </Badge>
                  ))
                )}
              </div>

              <div className="rounded-lg border border-border">
                <div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    {t("keys")}
                  </span>
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => addKey(account)}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {t("newKey")}
                  </Button>
                </div>
                {account.keys.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">{t("noKeys")}</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {account.keys.map((key) => (
                      <li key={key.id} className="flex items-center gap-3 px-3 py-2">
                        <code className="font-mono text-xs">{key.key_prefix}…</code>
                        <span className="flex-1 truncate text-muted-foreground">{key.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {key.last_used_at
                            ? t("lastUsed", { date: new Date(key.last_used_at).toLocaleDateString() })
                            : t("neverUsed")}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={pending}
                          onClick={() => run(() => revokeAiAccountKeyAction(orgId, account.userId, key.id))}
                        >
                          {t("revoke")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {disabled.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">{t("disabledTitle")}</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {disabled.map((account) => (
              <li key={account.userId} className="flex items-center gap-2">
                <Bot className="h-3.5 w-3.5" />
                {account.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {creating && (
        <CreateAiAccountDialog
          orgId={orgId}
          projects={projects}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            toast.success(t("createdToast"));
            router.refresh();
          }}
        />
      )}

      <Dialog open={newKey !== null} onOpenChange={(open) => !open && setNewKey(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("keyCreatedTitle", { name: newKey?.account ?? "" })}</DialogTitle>
            <DialogDescription>{t("keyCreatedDescription")}</DialogDescription>
          </DialogHeader>
          {newKey && (
            <div className="space-y-3">
              <CopyBlock label={t("keyLabel")} value={newKey.key} />
              <CopyBlock
                label={t("mcpLabel")}
                value={`claude mcp add --transport http --scope user guidon ${siteUrl}/api/mcp --header "Authorization: Bearer ${newKey.key}"`}
              />
              <p className="text-xs text-muted-foreground">{t("otherClients")}</p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setNewKey(null)}>{t("done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  const t = useTranslations("aiAccounts");
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">{value}</code>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("copy")}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function CreateAiAccountDialog({
  orgId,
  projects,
  onClose,
  onCreated,
}: {
  orgId: string;
  projects: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("aiAccounts");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createAiAccountAction(orgId, {
        name,
        description,
        projects: Object.entries(roles).map(([projectId, role]) => ({ projectId, role })),
      });
      if (result.error) setError(result.error);
      else onCreated();
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" data-save-shortcut>
          <div className="space-y-2">
            <Label htmlFor="ai-name">{t("nameLabel")}</Label>
            <Input id="ai-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} maxLength={80} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-description">{t("descriptionLabel")}</Label>
            <Textarea
              id="ai-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              maxLength={500}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("projectsLabel")}</Label>
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noOrgProjects")}</p>
            ) : (
              <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {projects.map((project) => {
                  const role = roles[project.id];
                  return (
                    <li key={project.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <label className="flex flex-1 items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={!!role}
                          onChange={(e) =>
                            setRoles((current) => {
                              const next = { ...current };
                              if (e.target.checked) next[project.id] = "developer";
                              else delete next[project.id];
                              return next;
                            })
                          }
                        />
                        {project.name}
                      </label>
                      {role && (
                        <SelectMenu
                          aria-label={t("roleLabel", { project: project.name })}
                          value={role}
                          options={ROLES.map((value) => ({ value, label: t(`role_${value}`) }))}
                          onValueChange={(value) => setRoles((current) => ({ ...current, [project.id]: value }))}
                          className="h-8 w-32 text-xs"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">{t("projectsHelp")}</p>
          </div>
          <label className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            {t("acceptResponsibility")}
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !accepted || !name.trim()}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("createSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
