# guidon-cli

Official command-line client for [Guidon](https://useguidon.com): list projects
and tasks, create and move tasks, comment - from a terminal, a script or CI.
Built on [`@guidon/sdk`](../sdk-js); Node 18.11+.

## Install

The npm release is pending. The command below will work after `guidon-cli` is published.

```bash
npm install -g guidon-cli
guidon --help
```

## Log in

Create an API key in Guidon (**Profile -> API keys**), then:

```bash
guidon login                       # prompts for the key (hidden input)
echo "$KEY" | guidon login         # or pipe it
GUIDON_API_KEY=guidon_... guidon login
guidon login --base-url https://guidon.example.com   # self-hosted instance
```

`login` checks the key against the API (skip with `--no-verify`) and saves it to
`~/.config/guidon/config.json` (`$XDG_CONFIG_HOME/guidon/config.json` if set),
readable only by you (mode 0600). `guidon logout` deletes that file.

Without logging in, every command also reads `GUIDON_API_KEY` and
`GUIDON_BASE_URL` - convenient in CI. Precedence: `--api-key` / `--base-url`
flags, then the environment, then the saved login; the base URL defaults to
`https://useguidon.com`. Avoid `--api-key` on shared machines - it ends up in
your shell history.

## Commands

```bash
guidon projects list
guidon tasks list --project <id> [--status todo,in_progress] [--top-level]
guidon tasks get <taskId>
guidon tasks create --project <id> --title "Fix the jump" [--description ...] [--priority high] [--status todo] [--due 2026-12-31] [--parent <taskId>]
guidon tasks move <taskId> <status>
guidon tasks comment <taskId> Looks good to me
git log -1 --format=%B | guidon tasks comment <taskId> -     # "-" reads the text from stdin
```

Status and priority are the project's column/priority keys (built-in:
`backlog todo in_progress ai_working review done` and `low medium high critical`).

Write commands accept `--idempotency-key <key>` (sent as `Idempotency-Key`), so a
retried CI step doesn't create the same task twice.

Text that starts with `-` can follow `--`: `guidon tasks comment <id> -- "-1 from me"`.

### Output

Human-readable tables by default; `--json` prints the API objects as JSON on
stdout everywhere, and errors as `{"error": {"status", "code", "message"}}` on
stderr:

```bash
guidon tasks list --project "$PROJECT" --status review --json | jq -r '.[].title'
```

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | API or unexpected error (e.g. 400 validation, 429, 5xx) |
| 2 | Usage error: unknown command/option, missing or invalid argument |
| 3 | Not logged in, invalid key (401) or not allowed (403: missing scope/role) |
| 4 | Not found (404) |
| 5 | Network error or timeout |

## Development

```bash
npm ci                                            # from the repository root
npm run build --workspace @guidon/sdk              # builds the linked local SDK
npm test --workspace guidon-cli                    # build + local mock-server tests
node packages/cli/dist/bin.js --help
```

Links: [Homepage](https://useguidon.com) - [Source](https://github.com/Two-Steps-Studio/guidon/tree/main/packages/cli)

## License

MIT - see [LICENSE](LICENSE). This licence covers this SDK/CLI package, not the Guidon service or the rest of the application.
