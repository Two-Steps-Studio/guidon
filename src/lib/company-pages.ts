// No imports: loaded by tests/agent-web.test.mjs with Node's type stripping.

// Same values as lib/project-links.ts (test:agent-web checks they match).
const GITHUB_REPO_URL = "https://github.com/two-steps-studio/guidon";
const SUPPORT_EMAIL = "guidon.support@gmail.com";

/**
 * /about and /contact: one Markdown source each for the HTML page and its
 * Markdown twin (/about.md, /contact.md). Plain facts only - these are the
 * pages agents and people read to check who runs Guidon.
 */
export function aboutMarkdown(siteUrl: string): string {
  return `# About Guidon

Guidon is context-first project management for development teams. Every project gets a Kanban task board, and next to it the things that usually get lost: the decisions behind the work and why they were made, the sources and documents a team relies on, the technologies in use, a roadmap, and a project memory that keeps verified facts in one place. When someone - a new teammate, a reviewer, or an AI agent - picks up a task, the reason the task exists and everything needed to do it are already there.

## Who makes it

Guidon is built by **Two Steps Studio**, an independent studio from Poland. It started as the tool we needed ourselves: game and software projects move fast, and the "why" behind a change disappears into chats and memory long before the task is done. Guidon Cloud (${siteUrl}) is operated by Two Steps Studio; the company is not yet formally incorporated - see the [Terms of Service](${siteUrl}/legal/terms) for what that means for you.

## What makes it different

- **Built for people and AI agents together.** Agents connect through an [MCP server and a REST API](${siteUrl}/developers): they find a task, read its full context, claim it, record what they tried and hand the work back to a human for review.
- **Open source and self-hostable.** The code is public on [GitHub](${GITHUB_REPO_URL}); you can run Guidon on your own server with plain PostgreSQL, with no limits from our side.
- **Made for game studios too.** Plugins for Unity, Unreal Engine, Godot and Blender, in-game bug reports, and Guidon Desktop.

## Get in touch

Questions, feedback or a problem with your account: [contact us](${siteUrl}/contact) or write to [${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL}).
`;
}

export function contactMarkdown(siteUrl: string): string {
  return `# Contact Guidon

Guidon is made by Two Steps Studio - messages to the address below reach the people who build it.

## Support and general questions

Email **[${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL})** for help with your account, billing, a bug, a feature idea, or anything else about Guidon. Please include the organization or project name and, for a bug, what you did and what you expected to happen.

## Privacy and your data

You can delete your account yourself at any time: Profile → Delete account on the website, or Settings → Delete account in the mobile app. Other requests about personal data - a copy of your data or a correction - go to the same address. The [Privacy Policy](${siteUrl}/legal/privacy) explains what we store and why.

## Bugs and code

Guidon is open source. Bug reports and pull requests are welcome on [GitHub](${GITHUB_REPO_URL}/issues). Please don't post security vulnerabilities publicly - email them instead and we'll get back to you before anything is disclosed.

## Developers and AI agents

The API, the MCP server and API keys are documented on the [developers page](${siteUrl}/developers); the [llms.txt](${siteUrl}/llms.txt) guide is written for AI agents.

## Who we are

Guidon is operated by Two Steps Studio, Poland - more on the [About page](${siteUrl}/about).
`;
}

/** /sandbox and /sandbox.md - the test environment for the API, MCP and agents (src/lib/api/sandbox.ts). */
export function sandboxMarkdown(siteUrl: string): string {
  return `# Guidon sandbox

The sandbox is a test environment for the Guidon API, the MCP server and AI agents: a separate organization, flagged as a sandbox, with one project of example tasks across the board's columns. Point an agent or a script at it to try things - create, move, comment, delete - without touching real work. It is free and counts toward no paid plan.

## Get one

- **In the browser:** [open your sandbox](${siteUrl}/sandbox/start) (sign in or [create a free account](${siteUrl}/auth/signup) first). One click creates it; after that the page opens its board.
- **Over the API:** with an API key or OAuth token, \`POST ${siteUrl}/api/v1/sandbox\`. The answer has \`organization_id\`, \`project_id\` and \`board_url\`; \`GET /api/v1/sandbox\` returns the same later.

\`\`\`bash
curl -X POST ${siteUrl}/api/v1/sandbox -H "Authorization: Bearer guidon_..."
\`\`\`

## Reset it

\`POST /api/v1/sandbox\` with \`{"reset": true}\` replaces the sandbox project with fresh example tasks, so every test run can start from the same data. The **Reset** button on [your sandbox page](${siteUrl}/sandbox/start) does the same.

## What it is for

- Trying the [REST API](${siteUrl}/developers) and the [OpenAPI spec](${siteUrl}/openapi.json) with real responses.
- Connecting an MCP client (Claude, ChatGPT, Cursor and others) to \`${siteUrl}/api/mcp\` and letting the agent claim and finish example tasks.
- Testing async jobs (\`POST /api/v1/projects/{id}/tasks/import\` answers 202 with a \`Location\` to poll), batching, idempotency keys and webhooks.

## Rules

The sandbox is an ordinary organization: the same permissions, rate limits (60 requests per minute per key) and API behave exactly as in production. Only you are a member. Delete it like any organization when you no longer need it.
`;
}

/** /auth/login.md - what the sign-in page offers, and the way in for an agent (which can't use a password form). */
export function signInMarkdown(siteUrl: string): string {
  return `# Sign in to Guidon

People sign in at [${siteUrl}/auth/login](${siteUrl}/auth/login) with an email and password, or with Google or Discord where those are enabled. Forgot the password? [Reset it](${siteUrl}/auth/forgot-password) - a link arrives by email.

No account yet? [Create one](${siteUrl}/auth/signup) or [start with a project](${siteUrl}/start) - the account comes last.

## AI agents and scripts

Agents don't use this form. A Guidon user creates an API key in [Profile → API keys](${siteUrl}/profile) and the agent sends it as \`Authorization: Bearer guidon_...\` to the [REST API](${siteUrl}/openapi.json) or the [MCP server](${siteUrl}/api/mcp). Everything about authentication is in the [developer guide](${siteUrl}/developers#authentication).
`;
}

/** /auth/signup.md */
export function signUpMarkdown(siteUrl: string): string {
  return `# Create a Guidon account

Sign up at [${siteUrl}/auth/signup](${siteUrl}/auth/signup) with an email and password (or Google/Discord where enabled), then confirm the email. Guidon Cloud has a free plan - see [pricing](${siteUrl}/pricing.md). Prefer to answer a few questions about your project first? [Start here](${siteUrl}/start).

Signing up means accepting the [Terms of Service](${siteUrl}/legal/terms) and the [Privacy Policy](${siteUrl}/legal/privacy).

Already have an account? [Sign in](${siteUrl}/auth/login). Building an integration or an AI agent? Read the [developer guide](${siteUrl}/developers).
`;
}
