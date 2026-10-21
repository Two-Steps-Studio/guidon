import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { Guidon, GuidonError, DEFAULT_BASE_URL, normalizeBaseUrl, type Task } from "@guidon/sdk";
import { configPath, deleteConfig, readConfig, writeConfig } from "./config.js";
import { json, table } from "./format.js";

/** Exit codes - documented in README.md. */
export const EXIT = {
  OK: 0,
  ERROR: 1, // API error not covered below, unexpected failure
  USAGE: 2, // bad command, option or argument
  AUTH: 3, // no API key, invalid key (401) or not allowed (403)
  NOT_FOUND: 4, // 404
  NETWORK: 5, // could not reach the server, timeout
} as const;

export interface Io {
  stdout: { write(chunk: string): unknown; isTTY?: boolean; columns?: number };
  stderr: { write(chunk: string): unknown };
  stdin: NodeJS.ReadableStream & { isTTY?: boolean; setRawMode?: (mode: boolean) => unknown };
  env: NodeJS.ProcessEnv;
}

class UsageError extends Error {}
class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number
  ) {
    super(message);
  }
}

const VERSION: string = (() => {
  try {
    return (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
  } catch {
    return "0.0.0";
  }
})();

const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

const OPTIONS = {
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  "api-key": { type: "string" },
  "base-url": { type: "string" },
  project: { type: "string", short: "p" },
  status: { type: "string", short: "s" },
  title: { type: "string", short: "t" },
  description: { type: "string", short: "d" },
  priority: { type: "string" },
  due: { type: "string" },
  parent: { type: "string" },
  "top-level": { type: "boolean" },
  "idempotency-key": { type: "string" },
  "no-verify": { type: "boolean" },
} as const;

type OptionName = keyof typeof OPTIONS;
type Values = { [K in OptionName]?: (typeof OPTIONS)[K]["type"] extends "boolean" ? boolean : string };

const GLOBAL: OptionName[] = ["json", "help", "version", "api-key", "base-url"];

const HELP = `guidon - command-line client for Guidon (https://useguidon.com)

Usage:
  guidon login [--api-key <key>] [--base-url <url>] [--no-verify]
  guidon logout
  guidon projects list
  guidon tasks list --project <id> [--status <status>[,<status>...]] [--top-level]
  guidon tasks get <taskId>
  guidon tasks create --project <id> --title <title> [--description <text>]
                      [--priority <key>] [--status <key>] [--due <iso-date>] [--parent <taskId>]
  guidon tasks move <taskId> <status>
  guidon tasks comment <taskId> <text...>     (text "-" reads it from stdin)

Global options:
  --json              Print machine-readable JSON instead of a table
  --api-key <key>     API key for this command (default: $GUIDON_API_KEY, then the saved login)
  --base-url <url>    Guidon instance (default: $GUIDON_BASE_URL, then the saved login, then ${DEFAULT_BASE_URL})
  -h, --help          Show help
  -v, --version       Show the version

Write commands also take --idempotency-key <key> (sent as Idempotency-Key).

Exit codes: 0 ok, 1 error, 2 usage, 3 auth/permission, 4 not found, 5 network.
Create an API key in Guidon: Profile -> API keys.`;

interface Command {
  usage: string;
  options: OptionName[];
  run(ctx: Context): Promise<void>;
}

interface Context {
  io: Io;
  values: Values;
  args: string[];
  client(): Promise<Guidon>;
  out(value: unknown, human: () => string): void;
}

function requireArg(value: string | undefined, name: string): string {
  if (!value || !value.trim()) throw new UsageError(`missing ${name}`);
  return value.trim();
}

function checkKey(value: string, what: string): string {
  if (!KEY_RE.test(value)) {
    throw new UsageError(`invalid ${what} "${value}" - use a lowercase key like in_progress (see the project's board settings)`);
  }
  return value;
}

function taskRows(tasks: Task[]): string[][] {
  return tasks.map((t) => [t.id, t.status, t.priority, t.parent_task_id ? `↳ ${t.title}` : t.title]);
}

function describeTask(t: Task): string {
  const lines = [
    `${t.title}`,
    `  id:        ${t.id}`,
    `  project:   ${t.project_id}`,
    `  status:    ${t.status}`,
    `  priority:  ${t.priority}`,
  ];
  if (t.parent_task_id) lines.push(`  parent:    ${t.parent_task_id}`);
  if (t.due_date) lines.push(`  due:       ${t.due_date}`);
  if (t.description) lines.push("", ...t.description.split("\n").map((line) => `  ${line}`));
  return lines.join("\n");
}

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  return Buffer.concat(chunks).toString("utf8");
}

/** Reads one line from a TTY without echoing it. */
function promptHidden(io: Io, question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = io.stdin;
    io.stderr.write(question);
    let input = "";
    const done = (error?: Error) => {
      stdin.removeListener("data", onData);
      stdin.setRawMode?.(false);
      stdin.pause();
      io.stderr.write("\n");
      if (error) reject(error);
      else resolve(input.trim());
    };
    const onData = (chunk: Buffer | string) => {
      for (const char of chunk.toString()) {
        if (char === "\r" || char === "\n" || char === "\u0004") return done();
        if (char === "\u0003") return done(new CliError("cancelled", EXIT.USAGE));
        if (char === "\u007f" || char === "\b") input = input.slice(0, -1);
        else input += char;
      }
    };
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

const COMMANDS: Record<string, Command> = {
  login: {
    usage: "guidon login [--api-key <key>] [--base-url <url>] [--no-verify]",
    options: ["no-verify"],
    async run({ io, values }) {
      const path = configPath(io.env);
      const existing = await readConfig(path);
      let apiKey = values["api-key"] ?? io.env.GUIDON_API_KEY;
      if (!apiKey) {
        if (io.stdin.isTTY) apiKey = await promptHidden(io, "Guidon API key (Profile -> API keys): ");
        else apiKey = (await readAll(io.stdin)).trim();
      }
      if (!apiKey) throw new CliError("no API key given - pass --api-key, set GUIDON_API_KEY or pipe it on stdin", EXIT.USAGE);
      if (!apiKey.startsWith("guidon_")) io.stderr.write("guidon: warning: Guidon API keys normally start with guidon_\n");

      const rawBase = values["base-url"] ?? io.env.GUIDON_BASE_URL ?? existing.baseUrl;
      let baseUrl: string | undefined;
      if (rawBase) {
        normalizeBaseUrl(rawBase); // validates; throws GuidonError(invalid_base_url)
        baseUrl = rawBase.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
      }

      let warning: string | undefined;
      if (!values["no-verify"]) {
        const client = new Guidon({ apiKey, baseUrl, userAgent: `guidon-cli/${VERSION}`, maxRetries: 1 });
        try {
          await client.projects.list();
        } catch (error) {
          // 403 = a valid key without the tasks:read scope - still a key.
          if (error instanceof GuidonError && error.status === 403) warning = `key accepted, but: ${error.message}`;
          else throw error;
        }
      }

      const config = { ...existing, apiKey, ...(baseUrl ? { baseUrl } : {}) };
      if (!baseUrl) delete config.baseUrl;
      await writeConfig(path, config);
      if (warning) io.stderr.write(`guidon: warning: ${warning}\n`);
      const summary = { configPath: path, baseUrl: baseUrl ?? DEFAULT_BASE_URL, verified: !values["no-verify"] };
      ctxOut(io, values, summary, () => `Logged in to ${summary.baseUrl}. Key saved to ${path}.`);
    },
  },

  logout: {
    usage: "guidon logout",
    options: [],
    async run({ io, values }) {
      const path = configPath(io.env);
      const removed = await deleteConfig(path);
      ctxOut(io, values, { configPath: path, removed }, () => (removed ? `Removed ${path}.` : `Not logged in (${path} doesn't exist).`));
    },
  },

  "projects list": {
    usage: "guidon projects list",
    options: [],
    async run({ client, out }) {
      const projects = await (await client()).projects.list();
      out(projects, () =>
        projects.length ? table(["ID", "NAME"], projects.map((p) => [p.id, p.name])) : "No projects."
      );
    },
  },

  "tasks list": {
    usage: "guidon tasks list --project <id> [--status <status>[,<status>...]] [--top-level]",
    options: ["project", "status", "top-level"],
    async run({ values, client, out, io }) {
      const project = requireArg(values.project, "--project <id>");
      const statuses = values.status
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => checkKey(s, "status"));
      const tasks = await (await client()).tasks.list(project, {
        ...(statuses?.length ? { status: statuses } : {}),
        ...(values["top-level"] ? { parentTaskId: null } : {}),
      });
      out(tasks, () =>
        tasks.length
          ? table(["ID", "STATUS", "PRIORITY", "TITLE"], taskRows(tasks), io.stdout.isTTY ? io.stdout.columns : undefined)
          : "No tasks."
      );
    },
  },

  "tasks get": {
    usage: "guidon tasks get <taskId>",
    options: [],
    async run({ args, client, out }) {
      const task = await (await client()).tasks.get(requireArg(args[0], "<taskId>"));
      out(task, () => describeTask(task));
    },
  },

  "tasks create": {
    usage:
      "guidon tasks create --project <id> --title <title> [--description <text>] [--priority <key>] [--status <key>] [--due <iso-date>] [--parent <taskId>]",
    options: ["project", "title", "description", "priority", "status", "due", "parent", "idempotency-key"],
    async run({ values, client, out }) {
      const project = requireArg(values.project, "--project <id>");
      const title = requireArg(values.title, "--title <title>");
      if (values.due !== undefined && Number.isNaN(Date.parse(values.due))) {
        throw new UsageError(`invalid --due "${values.due}" - use an ISO 8601 date such as 2026-12-31`);
      }
      const task = await (await client()).tasks.create(
        project,
        {
          title,
          ...(values.description !== undefined ? { description: values.description } : {}),
          ...(values.priority !== undefined ? { priority: checkKey(values.priority, "priority") } : {}),
          ...(values.status !== undefined ? { status: checkKey(values.status, "status") } : {}),
          ...(values.due !== undefined ? { due_date: values.due } : {}),
          ...(values.parent !== undefined ? { parent_task_id: values.parent } : {}),
        },
        values["idempotency-key"] ? { idempotencyKey: values["idempotency-key"] } : undefined
      );
      out(task, () => `Created task ${task.id} (${task.status}, ${task.priority}): ${task.title}`);
    },
  },

  "tasks move": {
    usage: "guidon tasks move <taskId> <status>",
    options: ["idempotency-key"],
    async run({ args, values, client, out }) {
      const taskId = requireArg(args[0], "<taskId>");
      const status = checkKey(requireArg(args[1], "<status>"), "status");
      if (args.length > 2) throw new UsageError(`unexpected argument "${args[2]}"`);
      const task = await (await client()).tasks.move(
        taskId,
        status,
        values["idempotency-key"] ? { idempotencyKey: values["idempotency-key"] } : undefined
      );
      out(task, () => `Moved ${task.id} to ${task.status}: ${task.title}`);
    },
  },

  "tasks comment": {
    usage: "guidon tasks comment <taskId> <text...>",
    options: ["idempotency-key"],
    async run({ args, values, client, out, io }) {
      const taskId = requireArg(args[0], "<taskId>");
      let text = args.slice(1).join(" ");
      if (text === "-") text = await readAll(io.stdin);
      text = requireArg(text, "<text>");
      const comment = await (await client()).comments.create(
        taskId,
        text,
        values["idempotency-key"] ? { idempotencyKey: values["idempotency-key"] } : undefined
      );
      out(comment, () => `Commented on ${taskId} (comment ${comment.id}).`);
    },
  },
};

function ctxOut(io: Io, values: Values, value: unknown, human: () => string) {
  const text = values.json ? json(value) : human();
  if (text) io.stdout.write(`${text}\n`);
}

function commandHelp(name: string, cmd: Command): string {
  const opts = cmd.options.length ? `\nOptions: ${cmd.options.map((o) => `--${o}`).join(", ")}` : "";
  return `Usage: ${cmd.usage}${opts}\nGlobal options: --json, --api-key, --base-url, --help\nRun \`guidon --help\` for all commands.${
    name === "login" ? "\nThe key is read from --api-key, $GUIDON_API_KEY, or stdin (prompted without echo on a terminal)." : ""
  }`;
}

function exitCodeFor(error: GuidonError): number {
  if (error.status === 401 || error.status === 403 || error.code === "missing_api_key") return EXIT.AUTH;
  if (error.status === 404) return EXIT.NOT_FOUND;
  if (error.code === "network_error" || error.code === "timeout") return EXIT.NETWORK;
  if (error.code === "invalid_base_url") return EXIT.USAGE;
  return EXIT.ERROR;
}

function hintFor(error: GuidonError): string | undefined {
  if (error.code === "missing_api_key") return "run `guidon login` or set GUIDON_API_KEY";
  if (error.status === 401) return "the API key is invalid or revoked - create a new one in Profile -> API keys and run `guidon login`";
  if (error.status === 429) return "rate limited - wait a moment and try again";
  if (error.code === "network_error") return "check your connection and --base-url / GUIDON_BASE_URL";
  return error.hint;
}

/** Runs the CLI and returns the process exit code. */
export async function main(argv: string[], io: Io): Promise<number> {
  let values: Values = {};
  try {
    let parsed;
    try {
      parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
    } catch (error) {
      throw new UsageError((error as Error).message.replace(/\. To specify a positional.*$/s, ""));
    }
    values = parsed.values as Values;
    const positionals = parsed.positionals;

    if (values.version) {
      io.stdout.write(`${VERSION}\n`);
      return EXIT.OK;
    }

    const [first, second] = positionals;
    const name = first && COMMANDS[first] ? first : first && second && COMMANDS[`${first} ${second}`] ? `${first} ${second}` : undefined;

    if (!name) {
      if (values.help || positionals.length === 0) {
        (positionals.length === 0 && !values.help ? io.stderr : io.stdout).write(`${HELP}\n`);
        return values.help ? EXIT.OK : EXIT.USAGE;
      }
      const known = Object.keys(COMMANDS).filter((c) => c.startsWith(`${first} `));
      throw new UsageError(
        known.length
          ? `unknown command "${positionals.slice(0, 2).join(" ")}" - try: ${known.map((c) => `guidon ${c}`).join(", ")}`
          : `unknown command "${first}"`
      );
    }

    const cmd = COMMANDS[name]!;
    if (values.help) {
      io.stdout.write(`${commandHelp(name, cmd)}\n`);
      return EXIT.OK;
    }
    const allowed = new Set<OptionName>([...GLOBAL, ...cmd.options]);
    for (const key of Object.keys(values) as OptionName[]) {
      if (!allowed.has(key)) throw new UsageError(`option --${key} is not valid for \`guidon ${name}\``);
    }
    const args = positionals.slice(name.split(" ").length);
    if (name !== "tasks comment" && name !== "tasks move" && name !== "tasks get" && args.length > 0) {
      throw new UsageError(`unexpected argument "${args[0]}"`);
    }

    const ctx: Context = {
      io,
      values,
      args,
      async client() {
        const stored = await readConfig(configPath(io.env));
        const apiKey = values["api-key"] ?? io.env.GUIDON_API_KEY ?? stored.apiKey;
        if (!apiKey) throw new CliError("not logged in - run `guidon login` or set GUIDON_API_KEY", EXIT.AUTH);
        const baseUrl = values["base-url"] ?? io.env.GUIDON_BASE_URL ?? stored.baseUrl;
        return new Guidon({ apiKey, baseUrl, userAgent: `guidon-cli/${VERSION}` });
      },
      out: (value, human) => ctxOut(io, values, value, human),
    };
    await cmd.run(ctx);
    return EXIT.OK;
  } catch (error) {
    let code: number;
    let report: Record<string, unknown>;
    let message: string;
    if (error instanceof UsageError) {
      code = EXIT.USAGE;
      message = `${error.message}\nRun \`guidon --help\` for usage.`;
      report = { code: "usage", message: error.message };
    } else if (error instanceof CliError) {
      code = error.exitCode;
      message = error.message;
      report = { code: code === EXIT.AUTH ? "not_logged_in" : "error", message };
    } else if (error instanceof GuidonError) {
      code = exitCodeFor(error);
      const hint = hintFor(error);
      message = `${error.message}${error.status ? ` (HTTP ${error.status}, ${error.code})` : ` (${error.code})`}${hint ? `\nhint: ${hint}` : ""}`;
      report = { status: error.status, code: error.code, message: error.message };
    } else {
      code = EXIT.ERROR;
      message = (error as Error)?.message ?? String(error);
      report = { code: "error", message };
    }
    io.stderr.write(values.json ? `${json({ error: report })}\n` : `guidon: error: ${message}\n`);
    return code;
  }
}
