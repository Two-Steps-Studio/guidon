"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { isSupportedLocale } from "@/i18n/locales";

const LOCALE_COOKIE = "NEXT_LOCALE";

export async function setLocale(locale: string): Promise<{ error: string | null }> {
  if (!isSupportedLocale(locale)) {
    return { error: "Unsupported language." };
  }

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  // Best-effort: an anonymous visitor changing the switcher before logging
  // in has no profile row to update yet - the cookie alone is enough for
  // them, and this silently no-ops rather than erroring.
  if (hasDirectDatabase()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await withUser(user.id, ({ query }) =>
        query("UPDATE profiles SET locale = $1 WHERE id = $2", [locale, user.id])
      );
    }
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ locale }).eq("id", user.id);
    }
  }

  revalidatePath("/", "layout");
  return { error: null };
}
