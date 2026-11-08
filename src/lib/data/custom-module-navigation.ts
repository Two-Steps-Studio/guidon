import "server-only";
import { hasDirectDatabase } from "@/lib/db/pool";

/** Keep the Cloud preview out of navigation until it is ready. */
export function showCustomModuleNavigation(): boolean {
  const setting = process.env.GUIDON_SHOW_CUSTOM_MODULE_NAVIGATION;
  return setting === undefined ? hasDirectDatabase() : setting === "true";
}
