<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Guidon repository context

Guidon is context-first project management for development teams. The product
tracks project tasks alongside decisions, knowledge sources, roadmap, and
memory. The hosted product is at <https://useguidon.com>; the public repository
is <https://github.com/two-steps-studio/guidon>.

### Agent integration surfaces

- Product actions: `https://useguidon.com/api/mcp` (Streamable HTTP, OAuth 2.1
  or a user-created API key). All tools and project data require authentication.
- Public documentation search: `https://useguidon.com/api/mcp/docs` (read-only,
  no sign-in). This server cannot read or change a user's projects.
- REST API and OpenAPI: `https://useguidon.com/api/v1` and
  `https://useguidon.com/openapi.json`.
- Agent workflow skills: `skills/guidon-tasks`, `skills/guidon-api`, and
  `skills/guidon-cli`.
- Discovery documents: `https://useguidon.com/llms.txt`,
  `https://useguidon.com/.well-known/ard.json`, and
  `https://useguidon.com/.well-known/mcp.json`.

### Contribution guidance

- Keep authorization in place on product MCP and REST operations. Never make
  protected tools, organization data, or project data available anonymously.
- Keep the product MCP and public docs MCP separate: the former performs
  actions for an authenticated user; the latter only searches and reads public
  documentation.
- Prefer the shared API route handlers and schemas when changing behavior so
  REST and MCP clients receive consistent authorization and validation.
- For user-facing copy, preserve the supported locales in `messages/`.
