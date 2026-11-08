---
name: guidon-api
description: Integrate an application or agent with the Guidon REST API, JavaScript SDK, Python SDK or MCP servers. Use when writing code that connects to Guidon.
compatibility: Needs network access. API writes require a Guidon OAuth token or API key supplied by the user.
metadata:
  homepage: https://useguidon.com
  docs: https://useguidon.com/developers.md
---

# Integrate with Guidon

Use `https://useguidon.com/api/v1` for the REST API. Read the [OpenAPI document](https://useguidon.com/openapi.json) and [authentication guide](https://useguidon.com/auth.md) before implementing an integration.

- JavaScript/TypeScript SDK: `@two_steps_studio/guidon-sdk` on npm after release. Source: `packages/sdk-js/`.
- Python SDK source: `sdk/python/` in the official repository; the PyPI release of `guidon-sdk` is pending (import name: `guidon`).
- CLI: `@two_steps_studio/guidon-cli` on npm after release. Source: `packages/cli/`.
- MCP product tools: `https://useguidon.com/api/mcp` (OAuth or API key).
- MCP documentation search: `https://useguidon.com/api/mcp/docs` (public).

Until the SDK and CLI packages are published, use the REST API with the OpenAPI document or connect through MCP.

Keep credentials out of source control and logs. Request only the scopes the integration needs, use idempotency keys for writes, respect rate-limit headers and pagination cursors, and use the sandbox endpoint for experiments.
