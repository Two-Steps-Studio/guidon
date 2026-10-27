"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { submitKeepingValues } from "@/lib/forms/submit-keeping-values";
import { MODULE_LICENSES } from "@/lib/work/module-review";
import type { PublishSource } from "@/lib/data/module-registry";
import { publishModule, type PublishState } from "./actions";

const initial: PublishState = { error: null };

export function PublishForm({ projectId, source, defaults, back }: { projectId: string; source: PublishSource; defaults: { version: string; author: string }; back: string }) {
  const t = useTranslations("moduleRegistry");
  const [state, action, pending] = useActionState(publishModule.bind(null, projectId, source), initial);
  if (state.done) return <div role="status" className="space-y-3 rounded-lg border bg-card p-4">
    <p className="font-medium">{state.done.status === "published" ? t("publishedNow", { version: state.done.version }) : t("submittedForReview", { version: state.done.version })}</p>
    <div className="flex flex-wrap gap-3 text-sm"><Link href="/my-modules#published" className="text-primary underline">{t("toDashboard")}</Link><Link href={back} className="text-primary underline">{t("back")}</Link></div>
  </div>;
  return <form onSubmit={(event) => submitKeepingValues(event, action)} className="space-y-4 rounded-lg border bg-card p-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor="publish-version">{t("version")}</Label><Input id="publish-version" name="version" required maxLength={128} defaultValue={defaults.version} aria-describedby="publish-version-hint" /><p id="publish-version-hint" className="text-xs text-muted-foreground">{t("versionHint")}</p></div>
      <div className="space-y-1"><Label htmlFor="publish-author">{t("author")}</Label><Input id="publish-author" name="author" required maxLength={100} defaultValue={defaults.author} /></div>
    </div>
    <fieldset className="space-y-2"><legend className="text-sm font-medium">{t("visibility")}</legend>
      {(["private", "organization", "public"] as const).map((value) => <label key={value} className="flex items-start gap-2 text-sm"><input type="radio" name="visibility" value={value} defaultChecked={value === "private"} required className="mt-1" /><span><span className="font-medium">{t(`visibilityOption.${value}`)}</span><span className="block text-xs text-muted-foreground">{t(`visibilityHint.${value}`)}</span></span></label>)}
    </fieldset>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor="publish-category">{t("category")}</Label><Select id="publish-category" name="category" defaultValue="planning">{(["planning", "research", "operations"] as const).map((value) => <option key={value} value={value}>{t(`categoryOption.${value}`)}</option>)}</Select></div>
      <div className="space-y-1"><Label htmlFor="publish-license">{t("license")}</Label><Select id="publish-license" name="license" defaultValue="MIT">{MODULE_LICENSES.map((value) => <option key={value} value={value}>{value}</option>)}</Select></div>
    </div>
    <div className="space-y-1"><Label htmlFor="publish-description">{t("description")}</Label><Textarea id="publish-description" name="description" required maxLength={2000} rows={3} /></div>
    <div className="space-y-1"><Label htmlFor="publish-changelog">{t("changelog")}</Label><Textarea id="publish-changelog" name="changelog" maxLength={4000} rows={3} /></div>
    {state.error && <div role="alert" className="space-y-1 text-sm text-destructive"><p>{t(`error.${state.error}`)}</p>{state.findings?.length ? <ul className="list-inside list-disc">{state.findings.map((finding) => <li key={finding}><code>{finding}</code></li>)}</ul> : null}</div>}
    <Button type="submit" disabled={pending}>{pending ? t("publishing") : t("publish")}</Button>
  </form>;
}
