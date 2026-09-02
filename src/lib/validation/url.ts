import "server-only";

/**
 * True only for a syntactically valid http(s) URL. Used to gate any
 * free-text "link" field (a PR URL, a knowledge/context source link) before
 * it's stored - these fields end up interpolated straight into an <a href>
 * for every project member who views the page, with no server-side scheme
 * check otherwise. The <input type="url"> on the corresponding form is a
 * client-side hint only, trivially bypassed by calling the Server Action
 * directly, so a value like `javascript:fetch(...)` or a `data:text/html,...`
 * URI would otherwise be stored and executed in a teammate's session on
 * click - `target="_blank" rel="noreferrer"` stops tab-nabbing, not
 * javascript:/data: URI execution.
 */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
