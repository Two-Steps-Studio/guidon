"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminUserRow } from "@/lib/data/admin";
import { searchAdminUsers } from "./actions";
import { ProfileDisclosure } from "./profile-disclosure";

const PAGE_SIZE = 25;
const searchKinds = ["id", "email", "name", "domain", "stripe"] as const;
type SearchKind = typeof searchKinds[number];
type Filter = { kind: SearchKind | "all"; term: string };
const noFilter: Filter = { kind: "all", term: "" };

export function UserDirectory({ initial, canSearch, canReveal }: {
  initial: AdminUserRow[];
  canSearch: boolean;
  canReveal: boolean;
}) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const [kind, setKind] = useState<SearchKind>("id");
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<Filter>(noFilter);
  const [rows, setRows] = useState(initial);
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load(nextFilter: Filter, cursors: (string | null)[]) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await searchAdminUsers(nextFilter.kind, nextFilter.term, cursors.at(-1) ?? null);
        if (result.error || !("rows" in result) || !result.rows) {
          setError(result.error === "invalid" ? t("directory.invalid") : t("directory.unavailable"));
          return;
        }
        setRows(result.rows);
        setFilter(nextFilter);
        setPages(cursors);
      } catch {
        setError(t("directory.unavailable"));
      }
    });
  }

  return <>
    <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
      event.preventDefault();
      load({ kind, term }, [null]);
    }}>
      <label className="grid gap-1 text-sm">
        {t("directory.filter")}
        <select value={kind} onChange={event => { setKind(event.target.value as SearchKind); setTerm(""); }}
          disabled={pending} className="h-9 rounded-md border border-input bg-background px-2">
          {(canSearch ? searchKinds : ["id"] as const).map(key => <option key={key} value={key}>{t(`directory.${key}`)}</option>)}
        </select>
      </label>
      <label className="grid min-w-0 flex-1 gap-1 text-sm">
        {t("directory.value")}
        <Input required maxLength={254} value={term} onChange={event => setTerm(event.target.value)}
          disabled={pending} autoComplete="off" spellCheck={false} />
      </label>
      <Button type="submit" disabled={pending}>{t("directory.submit")}</Button>
      <Button type="button" variant="ghost" disabled={pending} onClick={() => {
        setTerm("");
        load(noFilter, [null]);
      }}>{t("directory.clear")}</Button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {rows.length === 0 ? <p>{t("directory.empty")}</p> : <div className="overflow-x-auto rounded-xl border border-border" aria-busy={pending}>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-muted-foreground [&>th]:p-3">
          <th>{t("pii.userId")}</th><th>{t("pii.profile")}</th><th>{t("colCreated")}</th>
        </tr></thead>
        <tbody className="divide-y">
          {rows.slice(0, PAGE_SIZE).map(user => <tr key={user.id} className="[&>td]:p-3">
            <td><Link className="break-all font-mono underline" href={`/admin/users/${user.id}`}>{user.id}</Link></td>
            <td>{canReveal ? <ProfileDisclosure userId={user.id} /> : t("pii.hidden")}</td>
            <td>{user.created_at ? format.dateTime(new Date(user.created_at), { dateStyle: "medium", timeZone: "UTC" }) : "—"}</td>
          </tr>)}
        </tbody>
      </table>
    </div>}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={pending || pages.length === 1}
        onClick={() => load(filter, pages.slice(0, -1))}>{t("directory.previous")}</Button>
      <Button variant="outline" disabled={pending || rows.length <= PAGE_SIZE}
        onClick={() => load(filter, [...pages, rows[PAGE_SIZE - 1].id])}>{t("directory.next")}</Button>
    </div>
  </>;
}
