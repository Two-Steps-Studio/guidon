import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/data/current-user";
import { getModuleCatalog } from "@/lib/data/module-catalog";
import { ModuleCatalogScreen } from "@/lib/work/module-catalog";

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  const [items, params, t] = await Promise.all([getModuleCatalog(user.id), searchParams, getTranslations("moduleCatalog")]);
  const textParam = (name: string) => typeof params[name] === "string" ? params[name] as string : "";
  const q = textParam("q").slice(0, 100);
  const category = ["planning", "research", "operations"].includes(textParam("category")) ? textParam("category") : "";
  const compatibility = ["compatible", "incompatible"].includes(textParam("compatibility")) ? textParam("compatibility") : "";
  return <AppShell user={user}><ModuleCatalogScreen items={items} filters={{ q, category, compatibility }} labels={{ title: t("title"), description: t("description"), search: t("search"), category: t("category"), all: t("all"), planning: t("planning"), research: t("research"), operations: t("operations"), compatibility: t("compatibility"), compatible: t("compatible"), incompatible: t("incompatible"), empty: t("empty"), details: t("details"), myModules: t("myModules") }} /></AppShell>;
}
