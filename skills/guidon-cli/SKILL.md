---
name: guidon-cli
description: Use the official Guidon CLI to inspect projects and tasks, create or update tasks, and report progress from a terminal or CI workflow.
compatibility: Requires Node.js 18.11 or newer, network access and a Guidon API key with appropriate scopes.
metadata:
  homepage: https://useguidon.com
  docs: https://github.com/two-steps-studio/guidon/tree/main/packages/cli
---

# Use the Guidon CLI

Install with `npm install -g guidon-cli`. Run `guidon login` and enter an API key created in Guidon Profile. For CI, provide `GUIDON_API_KEY` through the CI secret store.

Common commands:

- `guidon projects list`
- `guidon tasks list --project <project-id> --status todo`
- `guidon tasks get <task-id>`
- `guidon tasks create --project <project-id> --title "..."`
- `guidon tasks move <task-id> in_progress`
- `guidon tasks comment <task-id> "..."`

Use `--json` for scripts and `--idempotency-key` when retrying writes. Avoid passing keys as command-line arguments because shell history and process listings may expose them. See the [CLI guide](https://github.com/two-steps-studio/guidon/tree/main/packages/cli).
