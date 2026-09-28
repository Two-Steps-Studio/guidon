"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isSupportedTheme, THEME_COOKIE } from "@/lib/theme";

export async function setTheme(theme: string): Promise<{ error: string | null }> {
  if (!isSupportedTheme(theme)) {
    return { error: "Unsupported theme." };
  }

  // Cookie-only, like NEXT_LOCALE - no profiles column, so this doesn't
  // follow the signed-in user across devices, but it also needs no
  // migration and works identically for a signed-out visitor.
  (await cookies()).set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
  return { error: null };
}
