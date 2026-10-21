// No imports: loaded by tests/docs-search.test.mjs with Node's type stripping.

/**
 * Search over Guidon's public documentation (the same Markdown the site
 * serves), for the docs MCP server and the NLWeb /ask endpoint. Plain
 * keyword scoring - the corpus is a few dozen sections, so an index or
 * embeddings would be more machinery than answer.
 */

export interface DocPage {
  /** Stable id, e.g. "developers" - read_doc takes it. */
  id: string;
  title: string;
  url: string;
  markdown: string;
}

export interface DocSection {
  pageId: string;
  title: string;
  url: string;
  text: string;
}

const STOP = new Set(
  "a an and are as at be by can do does for from how i in is it my of on or the to what when where which who why with you your".split(" ")
);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9_:\-/ ]+/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[-:/]+|[-:/]+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** A page split at its `## ` headings; the part before the first one is the page's own section. */
export function splitSections(page: DocPage): DocSection[] {
  const body = page.markdown.replace(/^---\n[\s\S]*?\n---\n/, "");
  const parts = body.split(/^## /m);
  const sections: DocSection[] = [];
  const intro = parts[0].replace(/^# .*\n/, "").trim();
  if (intro) sections.push({ pageId: page.id, title: page.title, url: page.url, text: intro });
  for (const part of parts.slice(1)) {
    const newline = part.indexOf("\n");
    const heading = (newline === -1 ? part : part.slice(0, newline)).trim();
    const text = (newline === -1 ? "" : part.slice(newline + 1)).trim();
    if (!text) continue;
    sections.push({ pageId: page.id, title: `${page.title} - ${heading}`, url: `${page.url}#${slug(heading)}`, text });
  }
  return sections;
}

export interface SearchHit extends DocSection {
  score: number;
  snippet: string;
}

function snippetOf(text: string, terms: string[], length = 280): string {
  // Keep underscores: they're part of names like next_cursor.
  const plain = text.replace(/[`*>#|]/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
  const lower = plain.toLowerCase();
  const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 60);
  return `${start > 0 ? "..." : ""}${plain.slice(start, start + length)}${start + length < plain.length ? "..." : ""}`;
}

/** Best sections for a question, most relevant first; empty when nothing matches. */
export function searchSections(sections: DocSection[], query: string, limit = 5): SearchHit[] {
  const terms = [...new Set(tokens(query))];
  if (terms.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const section of sections) {
    const title = tokens(section.title);
    const body = tokens(section.text);
    let score = 0;
    let matched = 0;
    for (const term of terms) {
      const inTitle = title.filter((t) => t === term || t.startsWith(term)).length;
      const inBody = body.filter((t) => t === term || t.startsWith(term)).length;
      if (inTitle || inBody) matched++;
      score += inTitle * 5 + Math.min(inBody, 8);
    }
    if (score === 0) continue;
    // Sections that cover more of the question beat ones that repeat one word.
    score *= matched / terms.length;
    hits.push({ ...section, score: Math.round(score * 100) / 100, snippet: snippetOf(section.text, terms) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
