// No imports: loaded by tests/agent-web.test.mjs with Node's type stripping.

/**
 * Machine-readable descriptions of what agents can use on Guidon, from one
 * place so they can't disagree with each other:
 *
 * - the MCP server card (draft MCP server-card extension) at /api/mcp/server-card
 * - the Agentic Resource Discovery catalog at /.well-known/ard.json (and the
 *   older /.well-known/ai-catalog.json)
 * - the Agent Skills discovery index at /.well-known/agent-skills/index.json
 *   and the skill itself (SKILL.md), also shipped in agent-plugin/
 *
 * Deliberately not published: an A2A agent card (Guidon speaks MCP and REST,
 * not A2A - a card would have to claim a binding that doesn't exist) and a
 * Web Bot Auth key directory (that is for sites that send signed requests).
 */

export const SKILL_NAME = "guidon-tasks";
export const SKILL_DESCRIPTION =
  "Work through tasks in Guidon, the context-first project manager: find the next task, read its full context, claim it, record attempts, comment and hand it back for review. Use when someone asks to work on, update or report on their Guidon tasks.";

/** The skill (agentskills.io SKILL.md format) - served and shipped byte for byte as this string. */
export function skillMarkdown(siteUrl: string): string {
  return `---
name: ${SKILL_NAME}
description: ${JSON.stringify(SKILL_DESCRIPTION)}
compatibility: ${JSON.stringify(`Needs the Guidon MCP server (${siteUrl}/api/mcp) or the REST API (${siteUrl}/api/v1) and network access.`)}
metadata:
  homepage: ${JSON.stringify(siteUrl)}
  docs: ${JSON.stringify(`${siteUrl}/llms.txt`)}
---

# Working on Guidon tasks

Guidon keeps each project's tasks on a board together with the context behind them: decisions, knowledge sources, project memory, the tech stack and previous attempts. Your job is to pick up a task, do it with that context, and hand it back to a person for review - leaving a trail they can follow.

## Connect

- **MCP (preferred):** add the server \`${siteUrl}/api/mcp\` (Streamable HTTP). Clients with OAuth (Claude, ChatGPT, Cursor, VS Code) just sign in; otherwise send \`Authorization: Bearer guidon_...\` with an API key from ${siteUrl}/profile.
- **REST:** same token on \`${siteUrl}/api/v1\` - see ${siteUrl}/openapi.json.

## The loop

1. \`list_projects\` -> pick the project. \`list_columns\` tells you its column keys (projects rename and add columns).
2. \`list_tasks\` -> choose a task in \`todo\` (or what the person named). Pages: pass \`next_cursor\` back as \`cursor\`.
3. \`get_task_context\` -> read everything: description, constraints, verified facts, related decisions, files, pull requests and **previous attempts** - don't repeat an approach that already failed.
4. \`start_task\` -> the board shows you're on it.
5. Do the work.
6. \`record_attempt\` -> what you tried and the outcome (\`succeeded\`, \`partial\`, \`failed\` with the reason). Failed attempts are valuable - record them too.
7. \`comment_on_task\` -> a short summary for the person: what changed, links (PR), anything they must check.
8. \`set_task_status\` with \`review\`. Only use \`complete_task\` when the person asked for it and the project allows it.

## Good practice

- Follow the project's decisions and constraints from the context; if a decision blocks the task, say so in a comment instead of working around it.
- Create follow-up work as new tasks or subtasks (\`create_task\` with \`parent_task_id\`) rather than widening the current one.
- Send an \`Idempotency-Key\` header on REST writes so a retry never creates duplicates.
- On \`403\`, the token lacks a scope or the person lacks the permission - tell them which, don't retry.
- On \`429\`, wait for \`Retry-After\`.

## More

- Guide for agents: ${siteUrl}/llms.txt
- Authentication: ${siteUrl}/auth.md
- Developer guide: ${siteUrl}/developers.md
`;
}

export const SERVER_CARD_SCHEMA = "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json";
export const SERVER_CARD_CONTENT_TYPE = "application/mcp-server-card+json";

/** MCP server card (draft MCP server-card extension, SEP-2127). No tools list on purpose: clients trust tools/list. */
export function mcpServerCard(siteUrl: string, docsServer = false) {
  if (docsServer) {
    return {
      $schema: SERVER_CARD_SCHEMA,
      name: "com.useguidon/guidon-docs",
      version: "1.0.0",
      title: "Guidon docs",
      description: "Search and read Guidon's public documentation: API, MCP, auth, pricing.",
      websiteUrl: `${siteUrl}/developers`,
      _meta: { "ai.ora/kind": "docs" },
      remotes: [{ type: "streamable-http", url: `${siteUrl}/api/mcp/docs`, supportedProtocolVersions: ["2025-11-25", "2025-06-18", "2025-03-26"] }],
    };
  }
  return {
    $schema: SERVER_CARD_SCHEMA,
    name: "com.useguidon/guidon",
    version: "1.0.0",
    title: "Guidon",
    description: "Guidon project management: find, claim, update and hand back tasks with full context.",
    websiteUrl: siteUrl,
    icons: [{ src: `${siteUrl}/icon.png`, mimeType: "image/png" }],
    _meta: { "ai.ora/kind": "product" },
    remotes: [
      {
        type: "streamable-http",
        url: `${siteUrl}/api/mcp`,
        supportedProtocolVersions: ["2025-11-25", "2025-06-18", "2025-03-26"],
        headers: [
          {
            name: "Authorization",
            description: "OAuth access token (clients that support MCP authorization get one by signing in) or a Guidon API key from Profile > API keys.",
            isRequired: true,
            isSecret: true,
            value: "Bearer {token}",
            variables: { token: { description: "Access token or API key (guidon_...)", isRequired: true, isSecret: true } },
          },
        ],
      },
    ],
  };
}

/**
 * The site's MCP manifest - the informal convention (/.well-known/mcp.json,
 * /.well-known/mcp/manifest.json, /mcp.json) scanners and registries read
 * for a display name, icon and description before any server card. `kind`
 * says which server is the product itself and which only serves docs.
 */
export function mcpManifest(siteUrl: string) {
  const product = {
    name: "Guidon",
    kind: "product",
    description: "Context-first project management for development teams. Agents find a task, read its full context (decisions, knowledge, memory), claim it, record attempts and hand it back for review.",
    icon: `${siteUrl}/icon.png`,
    url: `${siteUrl}/api/mcp`,
    transport: "streamable-http",
    capabilities: { tools: true, resources: true },
    authentication: {
      type: "oauth2",
      protected_resource_metadata: `${siteUrl}/.well-known/oauth-protected-resource/api/mcp`,
      alternative: "Authorization: Bearer guidon_... (API key from Profile > API keys)",
    },
    server_card: `${siteUrl}/api/mcp/server-card`,
    documentation: `${siteUrl}/developers`,
  };
  return {
    ...product,
    servers: [
      product,
      {
        name: "Guidon docs",
        kind: "docs",
        description: "Search and read Guidon's public documentation. No sign-in.",
        icon: `${siteUrl}/icon.png`,
        url: `${siteUrl}/api/mcp/docs`,
        transport: "streamable-http",
        capabilities: { tools: true },
        authentication: { type: "none" },
        server_card: `${siteUrl}/api/mcp/docs/server-card`,
      },
    ],
  };
}

/**
 * A2A Agent Card for the docs agent at /api/a2a (src/app/api/a2a). Carries
 * the v1.0 fields (supportedInterfaces) and the v0.3 ones (url,
 * preferredTransport, protocolVersion) side by side, since clients of both
 * versions are in use; the endpoint answers both method names.
 */
export function a2aAgentCard(siteUrl: string) {
  const url = `${siteUrl}/api/a2a`;
  return {
    name: "Guidon docs agent",
    description: "Answers questions about Guidon - its REST API, MCP server, authentication, pricing and the agent workflow - from the public documentation, with links to the sources. It reads docs only; it can't see or change anyone's projects.",
    version: "1.0.0",
    provider: { organization: "Two Steps Studio", url: siteUrl },
    iconUrl: `${siteUrl}/icon.png`,
    documentationUrl: `${siteUrl}/developers`,
    supportedInterfaces: [{ url, protocolBinding: "JSONRPC", protocolVersion: "1.0" }],
    url,
    preferredTransport: "JSONRPC",
    protocolVersion: "0.3.0",
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/markdown", "text/plain"],
    skills: [
      {
        id: "answer-docs-question",
        name: "Answer a question about Guidon",
        description: "Finds the documentation sections that answer a question and returns them with links.",
        tags: ["documentation", "api", "mcp", "oauth"],
        examples: ["How do I authenticate to the Guidon API?", "What are the rate limits?", "How does an agent claim a task?"],
        inputModes: ["text/plain"],
        outputModes: ["text/markdown"],
      },
    ],
  };
}

export interface CatalogOptions {
  /** sha256 hex of skillMarkdown(siteUrl), for the skills index digest. */
  skillDigest: string;
}

/** Agentic Resource Discovery manifest (ARD v0.91; also valid as an AI Catalog 1.0 document). */
export function ardCatalog(siteUrl: string) {
  const host = new URL(siteUrl).hostname;
  const urn = (name: string) => `urn:air:${host}:${name}`;
  // ARD 4.5: who stands behind each entry - the publisher's own domain (it
  // must match the URN's), with the documents that govern its use.
  const trustManifest = {
    identity: `did:web:${host}`,
    identityType: "did",
    attestations: [
      { type: "privacy-policy", uri: `${siteUrl}/legal/privacy`, mediaType: "text/html" },
      { type: "terms-of-service", uri: `${siteUrl}/legal/terms`, mediaType: "text/html" },
    ],
  };
  return {
    specVersion: "1.0",
    host: { displayName: "Guidon", identifier: siteUrl, documentationUrl: `${siteUrl}/developers`, logoUrl: `${siteUrl}/icon.png` },
    entries: [
      {
        identifier: urn("mcp:guidon"),
        trustManifest,
        displayName: "Guidon MCP server",
        type: SERVER_CARD_CONTENT_TYPE,
        url: `${siteUrl}/api/mcp/server-card`,
        description: "Find, claim, update and hand back tasks in Guidon projects, with their decisions, knowledge and memory. OAuth 2.1 or API key.",
        capabilities: ["list_projects", "list_tasks", "get_task_context", "start_task", "create_task", "comment_on_task", "record_attempt", "set_task_status"],
        tags: ["project-management", "tasks", "kanban"],
        representativeQueries: [
          "what's the next task in my Guidon project",
          "move my Guidon task to review and comment with the PR link",
          "create a task in Guidon for this bug",
        ],
      },
      {
        identifier: urn("mcp:guidon-docs"),
        trustManifest,
        displayName: "Guidon docs MCP server",
        type: SERVER_CARD_CONTENT_TYPE,
        url: `${siteUrl}/api/mcp/docs/server-card`,
        description: "Search and read Guidon's public documentation over MCP. No sign-in.",
        capabilities: ["search_docs", "read_doc"],
        tags: ["documentation"],
        representativeQueries: ["how do I authenticate to the Guidon API", "Guidon MCP server tools"],
      },
      {
        identifier: urn("a2a:guidon-docs"),
        trustManifest,
        displayName: "Guidon docs agent (A2A)",
        type: "application/a2a-agent-card+json",
        url: `${siteUrl}/.well-known/agent-card.json`,
        description: "A2A agent that answers questions about Guidon from its public documentation. No sign-in.",
        tags: ["a2a", "documentation"],
        representativeQueries: ["ask Guidon how its API authentication works", "which MCP clients can connect to Guidon"],
      },
      {
        identifier: urn("api:rest-v1"),
        trustManifest,
        displayName: "Guidon REST API v1",
        type: "application/vnd.oai.openapi+json",
        url: `${siteUrl}/openapi.json`,
        description: "REST API for Guidon projects, tasks, comments, attempts and project knowledge. OAuth 2.1 or API key.",
        tags: ["rest", "openapi"],
        representativeQueries: ["Guidon API to create a task", "project management REST API with task comments"],
      },
      {
        identifier: urn(`skill:${SKILL_NAME}`),
        trustManifest,
        displayName: SKILL_NAME,
        type: "application/agent-skills+md",
        url: `${siteUrl}/.well-known/agent-skills/${SKILL_NAME}/SKILL.md`,
        description: "How an agent picks up, works on and reports back on Guidon tasks.",
        tags: ["skill"],
        representativeQueries: ["work through my Guidon task list", "report progress on a Guidon task"],
      },
    ],
  };
}

/** Agent Skills discovery index (v0.2.0). */
export function agentSkillsIndex(siteUrl: string, { skillDigest }: CatalogOptions) {
  return {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [
      {
        name: SKILL_NAME,
        type: "skill-md",
        description: SKILL_DESCRIPTION,
        url: `${siteUrl}/.well-known/agent-skills/${SKILL_NAME}/SKILL.md`,
        digest: `sha256:${skillDigest}`,
      },
    ],
  };
}
