"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyBulkTag, exportMaskedUsers, previewBulkTag } from "./actions";

export function BulkControls() {
  const [filter, setFilter] = useState("");
  const [ids, setIds] = useState("");
  const [tag, setTag] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewBulkTag>>>(null);
  const [report, setReport] = useState<Awaited<ReturnType<typeof previewBulkTag>>>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function run(work: () => Promise<void>) {
    setMessage("");
    startTransition(async () => {
      try { await work(); }
      catch { setMessage("The operation could not be confirmed."); }
    });
  }

  function resetPreview() {
    setPreview(null);
    setReport(null);
    setConfirmation("");
  }

  return <>
    <form className="space-y-2 rounded-xl border p-4" onSubmit={event => {
      event.preventDefault();
      run(async () => {
        const result = await exportMaskedUsers(filter.trim());
        if (result.error || !("csv" in result) || !result.csv) return setMessage("Export failed.");
        const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "guidon-masked-users.csv";
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (result.truncated) setMessage("Export contains the first 500 matching accounts.");
      });
    }}>
      <h3 className="font-semibold">Masked CSV export</h3>
      <label className="grid gap-1">Optional tag filter
        <Input maxLength={40} value={filter} disabled={pending} onChange={event => setFilter(event.target.value)} />
      </label>
      <Button type="submit" disabled={pending}>Download CSV</Button>
    </form>
    <section className="space-y-2 rounded-xl border p-4">
      <h3 className="font-semibold">Bulk account tag</h3>
      <label className="grid gap-1">Up to 25 account IDs, separated by spaces or commas
        <textarea value={ids} disabled={pending} maxLength={2000} className="rounded-md border bg-background p-2"
          onChange={event => { setIds(event.target.value); resetPreview(); }} />
      </label>
      <label className="grid gap-1">Tag<Input maxLength={40} value={tag} disabled={pending}
        onChange={event => { setTag(event.target.value); resetPreview(); }} /></label>
      <Button type="button" variant="outline" disabled={pending || !ids || !tag} onClick={() => run(async () => {
        resetPreview();
        const rows = await previewBulkTag(ids, tag.trim());
        if (rows) setPreview(rows);
        else setMessage("Enter valid account IDs and a tag.");
      })}>Preview changes</Button>
      {(report ?? preview)?.map(row => <p key={row.id} className="break-all text-sm">{row.id} · {row.status}</p>)}
      {preview && <div className="space-y-2">
        <label className="grid gap-1">Type APPLY to confirm
          <Input maxLength={5} value={confirmation} disabled={pending} onChange={event => setConfirmation(event.target.value)} />
        </label>
        <Button type="button" disabled={pending || confirmation !== "APPLY" || !preview.some(row => row.status === "ready")}
          onClick={() => run(async () => {
            const result = await applyBulkTag(ids, tag.trim(), confirmation);
            if ("rows" in result && result.rows) setReport(result.rows);
            else setMessage("Bulk update failed.");
            setPreview(null);
            setConfirmation("");
          })}>Apply tag</Button>
      </div>}
    </section>
    {message && <p role="status">{message}</p>}
  </>;
}
