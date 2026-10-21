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

- JavaScript and TypeScript: `npm install @guidon/sdk`.
- Python: install the package from `sdk/python` in the official repository.
- Command line: `npm install -g guidon-cli`.
- MCP product tools: `https://useguidon.com/api/mcp` (OAuth or API key).
- MCP documentation search: `https://useguidon.com/api/mcp/docs` (public).

Keep credentials out of source control and logs. Request only the scopes the integration needs, use idempotency keys for writes, respect rate-limit headers and pagination cursors, and use the sandbox endpoint for experiments.
