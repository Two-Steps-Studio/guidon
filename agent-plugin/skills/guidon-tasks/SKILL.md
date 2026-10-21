---
name: guidon-tasks
description: "Work through tasks in Guidon, the context-first project manager: find the next task, read its full context, claim it, record attempts, comment and hand it back for review. Use when someone asks to work on, update or report on their Guidon tasks."
compatibility: "Needs the Guidon MCP server (https://useguidon.com/api/mcp) or the REST API (https://useguidon.com/api/v1) and network access."
metadata:
  homepage: "https://useguidon.com"
  docs: "https://useguidon.com/llms.txt"
---

# Working on Guidon tasks

Guidon keeps each project's tasks on a board together with the context behind them: decisions, knowledge sources, project memory, the tech stack and previous attempts. Your job is to pick up a task, do it with that context, and hand it back to a person for review - leaving a trail they can follow.

## Connect

- **MCP (preferred):** add the server `https://useguidon.com/api/mcp` (Streamable HTTP). Clients with OAuth (Claude, ChatGPT, Cursor, VS Code) just sign in; otherwise send `Authorization: Bearer guidon_...` with an API key from https://useguidon.com/profile.
- **REST:** same token on `https://useguidon.com/api/v1` - see https://useguidon.com/openapi.json.

## The loop

1. `list_projects` -> pick the project. `list_columns` tells you its column keys (projects rename and add columns).
2. `list_tasks` -> choose a task in `todo` (or what the person named). Pages: pass `next_cursor` back as `cursor`.
3. `get_task_context` -> read everything: description, constraints, verified facts, related decisions, files, pull requests and **previous attempts** - don't repeat an approach that already failed.
4. `start_task` -> the board shows you're on it.
5. Do the work.
6. `record_attempt` -> what you tried and the outcome (`succeeded`, `partial`, `failed` with the reason). Failed attempts are valuable - record them too.
7. `comment_on_task` -> a short summary for the person: what changed, links (PR), anything they must check.
8. `set_task_status` with `review`. Only use `complete_task` when the person asked for it and the project allows it.

## Good practice

- Follow the project's decisions and constraints from the context; if a decision blocks the task, say so in a comment instead of working around it.
- Create follow-up work as new tasks or subtasks (`create_task` with `parent_task_id`) rather than widening the current one.
- Send an `Idempotency-Key` header on REST writes so a retry never creates duplicates.
- On `403`, the token lacks a scope or the person lacks the permission - tell them which, don't retry.
- On `429`, wait for `Retry-After`.

## More

- Guide for agents: https://useguidon.com/llms.txt
- Authentication: https://useguidon.com/auth.md
- Developer guide: https://useguidon.com/developers.md
