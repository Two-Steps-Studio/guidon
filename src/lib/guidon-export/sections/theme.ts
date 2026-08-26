import "server-only";

import { z } from "zod";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";
import type { GuidonSection } from "../types";

const ThemeSchema = z.object({
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable(),
});

export type ThemeData = z.infer<typeof ThemeSchema>;

export const themeSection: GuidonSection<ThemeData> = {
  key: "theme",
  schema: ThemeSchema,

  async exportData(projectId, userId) {
    if (hasDirectDatabase()) {
      const result = await withUser(userId, ({ query }) =>
        query("SELECT color FROM projects WHERE id = $1", [projectId])
      );
      return { primaryColor: result.rows[0]?.color ?? null };
    }

    const supabase = await createClient();
    const { data } = await supabase.from("projects").select("color").eq("id", projectId).maybeSingle();
    return { primaryColor: data?.color ?? null };
  },

  async importData(projectId, userId, data) {
    if (hasDirectDatabase()) {
      await withUser(userId, ({ query }) =>
        query("UPDATE projects SET color = $1 WHERE id = $2", [data.primaryColor, projectId])
      );
      return;
    }

    const supabase = await createClient();
    await supabase.from("projects").update({ color: data.primaryColor }).eq("id", projectId);
  },
};
