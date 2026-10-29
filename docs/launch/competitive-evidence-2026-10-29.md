# Competitive evidence register - 2026-10-29

Task: `ceacdbc2-ca14-4911-895c-7bd26293dc77`. This is desk research, not a completed hands-on benchmark or five user interviews. No competitor accounts were created and no private workspace was accessed. Official documentation establishes advertised capabilities, not their speed, usability or reliability.

## Evidence

All entries checked on 2026-10-29. Frequency is an observation count within this small, deliberately selected sample, never market share or a user complaint rate. Severity and opportunity below are hypotheses to test in the pilot.

| Product / segment | Evidence and source | Type / sample | Implication for Guidon |
| --- | --- | --- | --- |
| ClickUp / teams with tasks and docs | [Official MCP](https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server) documents task operations and search across work content. [CSV export](https://help.clickup.com/hc/en-us/articles/6310551109527-Export-task-data) supports selected hierarchy locations. | Official; 2 documents; no hands-on run | MCP presence alone is not a differentiator. Test the effort required to deliver a reviewed task with its decisions and sources. |
| Notion / document-centric teams | [Notion MCP](https://www.notion.com/help/notion-mcp) connects AI tools to workspace pages. [Workspace export](https://www.notion.com/help/workspace-settings) includes HTML, Markdown and database CSV; export excludes inaccessible content. | Official; 2 documents; no hands-on run | Compare decision/source traceability and portability, rather than claiming competitors lack agent access. |
| Jira / teams on Atlassian Cloud | [Rovo MCP](https://developer.atlassian.com/cloud/rovo-mcp/) documents searching and updating Jira and related work under existing user permissions. | Official; 1 document; no hands-on run | Hypothesis: a small team's setup may be simpler in Guidon. Measure it; do not claim a speed advantage yet. |
| Linear / product and development teams | [Issue creation](https://linear.app/docs/creating-issues), [MCP](https://linear.app/docs/mcp) and [exports](https://linear.app/docs/exporting-data) document issue workflows, agent access including read-only options, and CSV/Markdown export. | Official; 3 documents; no hands-on run | Test context-to-task handoff and review. Read-only access and export are baseline expectations, not novelty claims. |
| Asana / coordinated team work | [MCP integration](https://developers.asana.com/docs/integrating-with-asanas-mcp-server) documents OAuth client pre-registration and existing user permissions. MCP-issued tokens are separate from ordinary API tokens. | Official; 1 document; no hands-on run | Compare first connection and revoke. Do not equate a documented setup requirement with measured user difficulty. |
| monday.com / board-based operations | [MCP setup](https://support.monday.com/hc/en-us/articles/28515034903314-Get-started-with-monday-MCP) documents per-user OAuth access constrained by the user's permissions and granted scopes. | Official; 1 document; no hands-on run | Test whether Guidon's task history and decisions make review clearer for a small team. |

Two user-supplied anecdotal sources were also opened: [ClickUp performance thread](https://www.reddit.com/r/clickup/comments/1qgdr84/you_should_not_add_any_new_features_for_the_next/) and [Notion mobile thread](https://www.reddit.com/r/Notion/comments/1rm22u6/why_is_notions_mobile_app_still_so_bad_in_2026/). Their titles express dissatisfaction. Sample: two selected threads, zero verified interviews. They motivate performance/mobile tests; they do not establish prevalence, representative sentiment or comparative performance.

## Hands-on benchmark protocol

Use the same fictional project and task on each product, on the same device/network. Record plan, version/date, browser, viewport, role and whether an existing account was required. Do not upload customer data. Record blocked/not-supported separately from failure. Run the sequence without coaching, then repeat once to separate discovery from repeated use.

1. Start from a public landing page and create an empty project/workspace.
2. Create a task with title, description, assignee and due date; edit its description and reload.
3. Find that task by title and a phrase from its description.
4. On a phone, open the task, read its context and leave a review decision.
5. Connect a supported agent, retrieve the task plus a source/decision, propose an update, review the result, then revoke access and verify a denied request.
6. Export the project; inspect whether title, description, status, references and comments survive. An export button alone is not a successful portability test.

| Product | Start | Task | Search | Mobile | Agent context / revoke | Export |
| --- | --- | --- | --- | --- | --- | --- |
| ClickUp | Not run | Not run | Not run | Not run | Not run | Documented; not run |
| Notion | Not run | Not run | Not run | Not run | Not run | Documented; not run |
| Jira | Not run | Not run | Not run | Not run | Not run | Not checked |
| Linear | Not run | Not run | Not run | Not run | Not run | Documented; not run |
| Asana | Not run | Not run | Not run | Not run | Not run | Not checked |
| monday.com | Not run | Not run | Not run | Not run | Not run | Not checked |

Capture elapsed seconds, completion, assistance, exact blocker and evidence location for every cell. Keep medians descriptive of this sample only. No ranking until comparable runs exist.

## Five interviews still required

Recruit five consenting people who currently use these tools. Reuse [the pilot](pilot.md) for Guidon onboarding, rather than creating a competing test process. Use participant IDs P1-P5; do not put names, emails, credentials or private recordings in Git.

Ask for a recent concrete task: What was the last time context was missing? What did you do? Which device? How often in the last week, and out of how many tasks? What was the observable consequence? How do you review an agent's change and revoke access today? Ask them to demonstrate with fictional data if comfortable. Avoid leading questions about whether Guidon is better.

All P1-P5 sessions: not recruited, not scheduled, no responses collected. No invitation has been sent. Owner provides participants; record consent before any recording.

## Recommendations

| Order | Recommendation | Impact / effort / confidence | Basis |
| --- | --- | --- | --- |
| P0 | Repair the missing production task revision schema through a reviewed migration plan. | High / medium / high | Direct Guidon database probe, not competitor sentiment. A save flow must work before recruitment. |
| P0 | Finish Google/GitHub connection and revoke/session verification. | High / medium / medium | Actual Google local session test passed; GitHub still needs owner 2FA. |
| P1 | Run the existing 3-5 person pilot and this equal-task benchmark. | High / medium / medium | Competitors already document MCP. A clearer first result is a hypothesis requiring observed users. |
| Later | Publish measured claims only after the pilot; keep new integrations/modules in Backlog under the focus rule. | Medium / low / high for avoiding unsupported claims | No comparative speed, success-rate or preference evidence exists yet. |

Repeat this register once after beta using dated new evidence. Do not silently replace the pre-beta observations.
