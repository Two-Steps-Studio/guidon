"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

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
            execute: async (input) => {
              const current = latest.current.find((candidate) => candidate.name === tool.name);
              try {
                return await current!.execute(input ?? {});
              } catch (error) {
                return { ...toolResult(error instanceof Error ? error.message : "The tool failed."), isError: true };
              }
            },
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
export function GlobalWebMcpTools() {
  const router = useRouter();
  useWebMcpTools([
    {
      name: "search_guidon_docs",
      title: "Search Guidon docs",
      description: "Search Guidon's public documentation (API, MCP server, authentication, pricing, the agent workflow). Returns matching sections with links.",
      inputSchema: { type: "object", properties: { query: { type: "string", description: "The question, in plain words." } }, required: ["query"] },
      annotations: { readOnlyHint: true },
      async execute({ query }) {
        const response = await fetch("/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: { text: String(query ?? "") } }),
        });
        const data = (await response.json()) as { results?: { name: string; url: string; description: string }[]; error?: { message: string } };
        if (!data.results?.length) return toolResult(data.error?.message ?? "No matching documentation.");
        return toolResult(data.results.map((r) => `${r.name}\n${r.url}\n${r.description}`).join("\n\n"), data.results);
      },
    },
    {
      name: "open_guidon_page",
      title: "Open a Guidon page",
      description: `Navigate to a page of Guidon. Pages: ${Object.keys(PAGES).join(", ")}. Pages that need an account go through sign-in first.`,
      inputSchema: { type: "object", properties: { page: { type: "string", enum: Object.keys(PAGES) } }, required: ["page"] },
      async execute({ page }) {
        const path = PAGES[String(page)];
        if (!path) return toolResult(`Unknown page. Use one of: ${Object.keys(PAGES).join(", ")}.`);
        router.push(path);
        return toolResult(`Opened ${path}.`);
      },
    },
  ]);
  return null;
}
