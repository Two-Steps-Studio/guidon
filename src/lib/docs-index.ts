import "server-only";

import en from "../../messages/en.json";
import { homepageMarkdown } from "@/lib/agent-web";
import { developersMarkdown } from "@/lib/developers-doc";
import { aboutMarkdown, contactMarkdown, signInMarkdown, signUpMarkdown } from "@/lib/company-pages";
import { authMarkdown } from "@/lib/oauth/oauth-core";
import { skillMarkdown } from "@/lib/agent-discovery";
import { splitSections, type DocPage, type DocSection } from "@/lib/docs-search-core";
import { SITE_URL } from "@/lib/site-url";

/** Every public Markdown page the site serves, as the docs MCP server and /ask see them. */
export function docPages(siteUrl = SITE_URL): DocPage[] {
  return [
    { id: "home", title: "Guidon", url: `${siteUrl}/`, markdown: homepageMarkdown(en.landing, siteUrl) },
    { id: "developers", title: "Developer guide", url: `${siteUrl}/developers`, markdown: developersMarkdown(siteUrl) },
    { id: "auth", title: "Authentication", url: `${siteUrl}/auth.md`, markdown: authMarkdown(siteUrl) },
    { id: "agent-skill", title: "Working on Guidon tasks (agent skill)", url: `${siteUrl}/.well-known/agent-skills/guidon-tasks/SKILL.md`, markdown: skillMarkdown(siteUrl) },
    { id: "about", title: "About Guidon", url: `${siteUrl}/about`, markdown: aboutMarkdown(siteUrl) },
    { id: "contact", title: "Contact", url: `${siteUrl}/contact`, markdown: contactMarkdown(siteUrl) },
    { id: "sign-in", title: "Sign in", url: `${siteUrl}/auth/login`, markdown: signInMarkdown(siteUrl) },
    { id: "sign-up", title: "Sign up", url: `${siteUrl}/auth/signup`, markdown: signUpMarkdown(siteUrl) },
  ];
}

let cached: DocSection[] | null = null;

export function docSections(): DocSection[] {
  cached ??= docPages().flatMap(splitSections);
  return cached;
}
