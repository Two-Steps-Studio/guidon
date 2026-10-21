/**
 * Project language (migration 070): the language Guidon writes in for a
 * project - AI assistant replies, memory insights, what it learns from
 * finished tasks. null = automatic (the language of the question or task).
 */

/** Offered in project settings; any ISO 639-1 code (+ region) passes the DB check. */
export const PROJECT_LANGUAGES = ["en", "pl", "de", "es", "fr", "it", "pt", "pt-BR", "nl", "cs", "uk", "ru", "tr", "sv", "ja", "ko", "zh"] as const;

const LANGUAGE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;

export function normalizeProjectLanguage(value: unknown): string | null {
  return typeof value === "string" && LANGUAGE_RE.test(value) ? value : null;
}

/** The language's English name, for prompts ("Polish"). */
export function languageName(code: string, inLocale = "en"): string {
  try {
    return new Intl.DisplayNames([inLocale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * One sentence for an AI system prompt, or "" when the project has no fixed
 * language (the model then follows the conversation, as before).
 */
export function languageInstruction(code: string | null | undefined): string {
  const language = normalizeProjectLanguage(code);
  return language ? ` Always write in ${languageName(language)}, whatever language you are addressed in.` : "";
}
