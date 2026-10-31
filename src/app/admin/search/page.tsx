import { getTranslations } from "next-intl/server";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { serviceDataClient } from "@/lib/data-client";
import { weeklySearchCounts, type SearchCounter } from "@/lib/search/search-metrics";

async function loadCounters() {
  const now = new Date();
  const result = await serviceDataClient().from<SearchCounter>("search_quality_counts")
    .select("day,event,count").gte("day", new Date(now.getTime()-56*86400000).toISOString().slice(0,10)).order("day",{ascending:false}).limit(256);
  return {...result, now};
}

export default async function SearchQualityPage() {
  await requireAdminAccess();
  const t = await getTranslations("admin.searchQuality");
  // Cross-tenant aggregates deliberately restricted to administrators.
  const {data,error,now} = await loadCounters();
  return <div className="container mx-auto max-w-5xl space-y-5 px-6 py-8">
    <h1 className="text-2xl font-bold">{t("title")}</h1>
    <p className="text-sm text-muted-foreground">{t("description")}</p>
    {error ? <p role="status">{t("unavailable")}</p> : <div className="overflow-x-auto">
      <table className="w-full text-sm"><caption className="mb-3 text-left text-muted-foreground">{t("scope")}</caption>
        <thead><tr>{(["week","searches","zero","zeroRate","clicks","failed"] as const).map(key=><th key={key} scope="col" className="whitespace-nowrap border-b px-3 py-2 text-left">{t(key)}</th>)}</tr></thead>
        <tbody>{weeklySearchCounts(data,now).map(row=><tr key={row.week}>{[row.week,row.searches,row.zero,row.zeroPercent===null?"-":`${row.zeroPercent}%`,row.clicks,row.failed].map((value,index)=><td key={index} className="whitespace-nowrap border-b px-3 py-2 tabular-nums">{value}</td>)}</tr>)}</tbody>
      </table>
    </div>}
  </div>;
}
