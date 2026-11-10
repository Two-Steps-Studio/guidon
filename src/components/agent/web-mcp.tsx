"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";

/**
 * WebMCP (webmachinelearning/webmcp): tools a browser agent - Chrome's,
 * ChatGPT's built-in browser - can call on the page the person has open,
 * as that person, instead of clicking through the UI. Registered with
 * document.modelContext.registerTool() and removed through the
 * registration's AbortSignal; a no-op in browsers without WebMCP.
 */

export interface WebMcpTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; consequentialHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<unknown> | unknown;
}

interface ModelContext {
  registerTool(
    tool: Omit<WebMcpTool, "execute"> & { execute: (input: Record<string, unknown>) => Promise<unknown> },
    options?: { signal?: AbortSignal }
  ): Promise<void>;
}

function modelContext(): ModelContext | null {
  if (typeof document === "undefined") return null;
  return (document as Document & { modelContext?: ModelContext }).modelContext ?? null;
}

/** MCP-style tool result: text for the model, structured data alongside. */
export function toolResult(text: string, data?: unknown) {
  return { content: [{ type: "text", text }], ...(data === undefined ? {} : { structuredContent: data }) };
}

/** Runs a tool and turns a thrown error into an MCP error result. */
function guarded(run: (input: Record<string, unknown>) => Promise<unknown> | unknown) {
  return async (input: Record<string, unknown>) => {
    try {
      return await run(input ?? {});
    } catch (error) {
      return { ...toolResult(error instanceof Error ? error.message : "The tool failed."), isError: true };
    }
  };
}

/**
 * Registers `tools` while the component is mounted. Executors read the
 * latest props through a ref, so the tools are registered once, not on
 * every render.
 */
export function useWebMcpTools(tools: WebMcpTool[]) {
  const latest = useRef(tools);
  useEffect(() => {
    latest.current = tools;
  });
  const names = tools.map((tool) => tool.name).join(",");

  useEffect(() => {
    const context = modelContext();
    if (!context) return;
    const controller = new AbortController();
    for (const tool of latest.current) {
      const { execute: _execute, ...definition } = tool;
      void _execute;
      context
        .registerTool(
          {
            ...definition,
            execute: guarded((input) => latest.current.find((candidate) => candidate.name === tool.name)!.execute(input)),
          },
          { signal: controller.signal }
        )
        .catch(() => undefined);
    }
    return () => controller.abort();
  }, [names]);
}

const PAGES: Record<string, string> = {
  home: "/",
  dashboard: "/dashboard",
  projects: "/projects",
  my_tasks: "/my-tasks",
  organizations: "/organizations",
  profile: "/profile",
  developers: "/developers",
  pricing: "/#pricing",
  about: "/about",
  contact: "/contact",
  sign_in: "/auth/login",
  sign_up: "/auth/signup",
};

/** Tools available on every page: search the docs, open a page. */
export function GlobalWebMcpTools({ user }: { user: { id: string; email?: string; fullName?: string } | null }) {
  const router = useRouter();

  useEffect(() => {
    if (!user) return;

    // This runs once after hydration (and after any authenticated navigation),
    // so browser events and automatically captured errors inherit the stable
    // auth UUID without needing identity at individual event call sites.
    if (posthog.get_property("$user_id") && posthog.get_distinct_id() !== user.id) {
      posthog.reset();
    }
    posthog.identify(user.id, {
      ...(user.email ? { email: user.email } : {}),
      ...(user.fullName ? { name: user.fullName } : {}),
    });
  }, [user]);
  // Written out as literal registerTool() calls (not through useWebMcpTools)
  // so the definitions stay readable in the built bundle: agent-readiness
  // scanners read the tools without running the page.
  useEffect(() => {
    const context = modelContext();
    if (!context) return;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    context
      .registerTool(
        {
          name: "search_guidon_docs",
          title: "Search Guidon docs",
          description:
            "Use this to answer a question about Guidon: the REST API, MCP server, sign-in and API keys, pricing or the agent workflow. " +
            "Returns up to 6 matching documentation sections, each with its title, link and a short excerpt.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "The question or keywords in plain words, e.g. \"how do I connect Claude Code\"." },
            },
            required: ["query"],
          },
          annotations: { readOnlyHint: true },
          execute: guarded(async ({ query }) => {
            const response = await fetch("/ask", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: { text: String(query ?? "") } }),
            });
            const data = (await response.json()) as { results?: { name: string; url: string; description: string }[]; error?: { message: string } };
            if (!data.results?.length) return toolResult(data.error?.message ?? "No matching documentation.");
            return toolResult(data.results.map((r) => `${r.name}\n${r.url}\n${r.description}`).join("\n\n"), data.results);
          }),
        },
        options
      )
      .catch(() => undefined);
    context
      .registerTool(
        {
          name: "open_guidon_page",
          title: "Open a Guidon page",
          description:
            "Use this to take the person to a page of Guidon, such as their projects, tasks, profile, pricing or the developer guide. " +
            "Navigates the current tab and returns the opened path; pages that need an account go through sign-in first.",
          inputSchema: {
            type: "object",
            properties: {
              page: {
                type: "string",
                description: "Which page to open, by the names listed here.",
                // Same names as PAGES below.
                enum: ["home", "dashboard", "projects", "my_tasks", "organizations", "profile", "developers", "pricing", "about", "contact", "sign_in", "sign_up"],
              },
            },
            required: ["page"],
          },
          execute: guarded(async ({ page }) => {
            const path = PAGES[String(page)];
            if (!path) return toolResult(`Unknown page. Use one of: ${Object.keys(PAGES).join(", ")}.`);
            router.push(path);
            return toolResult(`Opened ${path}.`);
          }),
        },
        options
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [router]);
  return null;
}
