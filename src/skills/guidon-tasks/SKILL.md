---
name: guidon-tasks
description: Work through tasks in Guidon, the context-first project manager: find tasks, read project context, claim work, record attempts and hand tasks back for review. Use when asked to work on Guidon tasks.
compatibility: Needs network access and the Guidon MCP server or REST API. The product MCP server requires user authorization.
metadata:
  homepage: https://useguidon.com
  docs: https://useguidon.com/llms.txt
---

# Work through Guidon tasks

Connect to `https://useguidon.com/api/mcp` with OAuth or a user-provided API key. Follow the task's project instructions and inspect its full context before changing code.

1. List projects and tasks, then select the requested task.
2. Read task context, including previous attempts, decisions and project constraints.
3. Start the task before implementation.
4. Make the change in the authorized repository and verify it using the task's acceptance criteria.
5. Record the attempt, comment with a concise summary and set the task to `review` for human review.

Do not mark work complete when the task or project requires human review. Never expose API keys in comments, output or source files.

See [authentication](https://useguidon.com/auth.md) and [developer docs](https://useguidon.com/developers.md).
