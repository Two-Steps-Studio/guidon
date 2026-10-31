# PostHog MCP Analytics Setup Report

## Changes made

- Detected a TypeScript/Next.js stateless Streamable HTTP MCP server using `@modelcontextprotocol/sdk` v1.
- Installed and pinned the beta `@posthog/mcp` SDK at `0.25.0`; retained the existing `posthog-node` dependency.
- Created one module-scope PostHog client using `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST`.
- Wrapped each per-request `McpServer` immediately after construction with `instrument(server, posthog, ...)`.
- Enabled agent intent, self-reported model capture, conversation correlation, exception autocapture, and authenticated-user attribution.
- Added an awaited PostHog flush before each serverless MCP invocation is released.
- Configured the supplied PostHog project token and host in `.env.local`.
- Preserved the existing tool registration, dispatch, authentication, rate limiting, responses, and error behavior.

Once the MCP endpoint handles requests, PostHog will receive events including `$mcp_initialize`, `$mcp_tools_list`, `$mcp_tool_call`, and `$exception` for failed tool calls.

## Files modified or created

- `src/app/api/mcp/route.ts` — PostHog client, MCP wrapper, identity correlation, and flush lifecycle.
- `package.json` — added the exact `@posthog/mcp` dependency.
- `package-lock.json` — recorded the installed dependency tree.
- `.env.local` — added `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST`.
- `posthog-mcp-analytics-report.md` — this report.

## Verification

- Targeted ESLint check passed for `src/app/api/mcp/route.ts`.
- The full production `npm run build` completed successfully, including TypeScript validation and route generation.
- The installed `@posthog/mcp` version supports model capture and conversation IDs on this wrapper path.

## Manual next steps

1. Add `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` to every deployed runtime; local `.env.local` is not a deployment secret/configuration source.
2. Deploy or restart the server, then make a normal authenticated MCP `tools/list` and tool call so the first `$mcp_*` events are emitted.
3. Review MCP analytics in PostHog and confirm model, intent, user, error, and conversation properties are arriving as expected.
4. Treat `@posthog/mcp` as a pre-1.0 dependency and review release notes before upgrading its pinned version.

Reference: [PostHog MCP analytics documentation](https://posthog.com/docs/mcp-analytics).
