import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AUDIT_ACTIONS, AUDIT_OUTCOMES, AUDIT_TARGET_TYPES, listAdminAudit } from "@/lib/admin/audit-feed";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { filters, rows, next } = await listAdminAudit(await searchParams);
  const [t, format] = await Promise.all([getTranslations("admin.audit"), getFormatter()]);
  const inputs = ["actor", "target", "request", "from", "through"] as const;
  const selects = [
    { name: "action", options: AUDIT_ACTIONS },
    { name: "type", options: AUDIT_TARGET_TYPES },
    { name: "outcome", options: AUDIT_OUTCOMES },
  ] as const;

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <form action="/admin/audit" method="get" className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
        {inputs.map(name => (
          <label key={name} className="grid gap-1.5 text-sm">
            {t(name)}
            <Input name={name} type={name === "from" || name === "through" ? "date" : "text"}
              defaultValue={filters[name]} maxLength={name === "target" ? 200 : 36} />
          </label>
        ))}
        {selects.map(({ name, options }) => (
          <label key={name} className="grid min-w-0 gap-1.5 text-sm">
            {t(name)}
            <select name={name} defaultValue={filters[name]}
              className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2">
              <option value="">{t("all")}</option>
              {options.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        ))}
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button type="submit">{t("filter")}</Button>
          <Button asChild variant="ghost"><Link href="/admin/audit">{t("clear")}</Link></Button>
        </div>
      </form>
      {rows.length === 0 ? <p className="text-muted-foreground">{t("empty")}</p> : (
        <ol className="divide-y divide-border rounded-xl border border-border">
          {rows.map(event => {
            const timestamp = new Date(event.created_at);
            return (
              <li key={event.id} className="space-y-2 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 break-all font-semibold">{event.action} · {t(event.outcome)}</p>
                  <time className="text-muted-foreground" dateTime={timestamp.toISOString()}>
                    {format.dateTime(timestamp, { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" })} UTC
                  </time>
                </div>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 break-all">
                  <dt>{t("actor")}</dt>
                  <dd><Link className="underline" href={`/admin/audit?actor=${encodeURIComponent(event.actor_id)}`}>{event.actor_id}</Link></dd>
                  <dt>{t("target")}</dt>
                  <dd>{event.target_type}{event.target_id && (
                    <> · <Link className="underline" href={`/admin/audit?${new URLSearchParams({ type: event.target_type, target: event.target_id })}`}>{event.target_id}</Link></>
                  )}</dd>
                  <dt>{t("request")}</dt>
                  <dd><Link className="underline" href={`/admin/audit?request=${encodeURIComponent(event.request_id)}`}>{event.request_id}</Link></dd>
                  {event.before_state && <><dt>{t("before")}</dt><dd><code>{JSON.stringify(event.before_state)}</code></dd></>}
                  {event.after_state && <><dt>{t("after")}</dt><dd><code>{JSON.stringify(event.after_state)}</code></dd></>}
                </dl>
              </li>
            );
          })}
        </ol>
      )}
      {next && <Button asChild variant="outline"><Link href={`/admin/audit?${next}`}>{t("older")}</Link></Button>}
    </div>
  );
}
