import "server-only";
import { cache } from "react";
import { serviceDataClient } from "@/lib/data-client";
import { DEFAULT_FLAG, flagSchema } from "./flag-policy";

// Request-local memoization keeps subsequent requests responsive to a kill switch.
export const readFeatureFlag = cache(async (key: string) => {
  const { data, error } = await serviceDataClient().from<{ config: unknown }>("platform_feature_flags")
    .select("config").eq("flag_key", key).maybeSingle();
  if (error) return null;
  if (!data) return DEFAULT_FLAG;
  const parsed = flagSchema.safeParse(data.config);
  return parsed.success ? parsed.data : null;
});
