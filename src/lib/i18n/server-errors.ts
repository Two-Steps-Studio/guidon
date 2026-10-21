import "server-only";

import { getLocale } from "next-intl/server";
import de from "@/i18n/server-errors/de.json";
import es from "@/i18n/server-errors/es.json";
import pl from "@/i18n/server-errors/pl.json";

/**
 * Error messages Server Actions return to the UI, in the user's language.
 *
 * The actions keep their messages as readable English sentences in the code
 * (`error: await tr("Task not found.")`); this looks the sentence up in
 * src/i18n/server-errors/<locale>.json and falls back to the English when
 * there's no translation (English itself, or a message added later). Kept
 * out of the next-intl message files on purpose: those are sent to the
 * browser on every page, these are only needed on the server.
 *
 * Only for messages a person reads in the app. /api/v1 and MCP answer agents
 * in English, and anything compared by value (codes like "not_found") stays
 * as is.
 */

const CATALOGS: Record<string, Record<string, string>> = { de, es, pl };

export async function tr(message: string): Promise<string> {
  let locale: string;
  try {
    locale = await getLocale();
  } catch {
    return message;
  }
  return CATALOGS[locale]?.[message] ?? message;
}
