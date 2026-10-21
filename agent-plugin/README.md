# Guidon agent plugin

An [Agent Plugin](https://agent-plugins.org/specification) (spec 1.0.0) that gives an agent Guidon:

- `mcp.json` - Guidon's MCP server (`https://useguidon.com/api/mcp`, Streamable HTTP). No key in the file: clients sign in with OAuth 2.1 on first use (see https://useguidon.com/auth.md).
- `skills/guidon-tasks/SKILL.md` - how to work through Guidon tasks: find, read context, claim, record attempts, comment, hand back for review.

`SKILL.md` is generated from `src/lib/agent-discovery.ts` (the same text is served at https://useguidon.com/.well-known/agent-skills/guidon-tasks/SKILL.md); `npm run test:agent-web` fails if the two differ. To regenerate:

```bash
node --experimental-strip-types -e 'import("./src/lib/agent-discovery.ts").then(m => require("fs").writeFileSync("agent-plugin/skills/guidon-tasks/SKILL.md", m.skillMarkdown("https://useguidon.com")))'
```

Listing it on [skills.sh](https://skills.sh): `npx skills add two-steps-studio/guidon` from a machine logged in to the repository's owner account.
