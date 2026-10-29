# AI module planning and compilation

Project owners/admins find AI Module Builder in the project's Modules page.
The project AI switch applies both to the UI and every builder server action.
The existing organization-aware resolver chooses the organization provider or
the instance fallback; no new provider, credential store or model API is added.

## Flow

1. Describe the module (1-6000 characters). Only that text is sent to the
   configured AI provider, without tasks, records, project name or secrets.
2. Review the proposed entities, typed fields, selection options, bounds,
   views/mappings and exact requested permissions. Answer any questions by
   updating the description and requesting a new plan. Editing the description
   invalidates the previous plan, manifest and approvals.
3. When there are no pending questions, explicitly approve the plan. The server
   validates it again and deterministically compiles Manifest v1. This adds
   engine/version/lifecycle defaults without another model call or an opportunity
   for the model to alter approved fields/scopes. Nothing has been installed.
4. Download the JSON or separately approve its permissions and install it using
   the existing project-scoped module installation action. It starts with empty
   records and never publishes to the catalog automatically.

The AI may propose only module-local text/number/boolean/date/select fields and
the existing five views. Plans are capped at 10 entities and 10 views, bounded
by the existing field limits. Only module-data read/write scopes are supported.
Relations must be empty: cross-entity relations and outside integrations have
no v1 runtime adapter. Requests for these must trigger clarification rather
than fake implementation. The strict schema rejects extra code, dependencies,
unknown capabilities, invalid field mappings and missing runtime permissions.
The UI discloses the relation limitation beside each plan.

## Errors and operational evidence

One request uses at most 6000 output tokens. Invalid/truncated JSON, tool calls
and oversized responses are rejected. There is no eval, script execution,
tool registration, model-controlled endpoint, automatic retry or model-driven
database write. Existing providers enforce their 120-second fetch timeout.
The builder returns fixed error codes for HTTP 429, timeouts, missing provider
and provider failures; raw provider bodies/configuration errors stay private.

Attempts reserve the existing in-memory limiter before provider resolution:
8 per user/project and 40 per organization in five minutes, including failed
attempts. This is a per-process limit, not a durable billing budget: it resets
on restart and is not shared by Vercel instances/replicas. Configure provider
spending limits; a shared atomic quota is required before promising a global
cost cap. Manifest compilation makes no paid call.

The project Activity page shows plan/compile outcomes and attempt IDs. It uses
the existing best-effort deferred activity logger and project read policy.
Only request ID, stage, outcome and planning duration are recorded, not user
prompts, generated output, API keys or raw error bodies. Unauthorized/AI-disabled
calls stop before credential resolution and do not create builder attempts.

No new database migration is required; existing module migrations 080-082 and
organization AI settings must already be installed. Production deployment is
not part of this change.

## Verification and remaining work

`test:modules` includes deterministic mock LLM checks of planning, questions,
approval, compilation, schema validation, unsupported content and errors. The
same tests execute the actual server actions and limiter with fixtures at the
auth/provider/audit-storage boundaries, checking access, AI disable, user/org
limits and log redaction. They do not contact a paid model or production DB.

Authenticated staging/browser E2E remains the Marketplace QA task. The
three-pane editor and persisted drafts/history are documented in
`module-draft-editor.md`. Rich fixture live preview, visual editing and author
publication remain separate roadmap tasks.
