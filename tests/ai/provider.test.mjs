#!/usr/bin/env node
/**
 * Tests the AI provider factory's pure logic — env-var resolution,
 * validation, and request-shaping — without a live API key or network
 * access (TODO.md §6/§7).
 *
 *   npm run test:ai
 *
 * src/lib/ai/provider.ts and src/lib/ai/providers/*.ts start with
 * `import "server-only"`, which throws when loaded outside Next.js's
 * react-server build condition (see node_modules/server-only/index.js) —
 * the same reason tests/db/compat.test.mjs mirrors src/lib/db/session.ts
 * instead of importing it directly. The functions below mirror the real
 * implementation's env-resolution and request-building logic for the same
 * reason: they are NOT imported from src/. If provider.ts or
 * providers/*.ts change shape, update this file too.
 */

let pass = 0;
let fail = 0;

function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`    pass  ${label}`);
  } else {
    fail++;
    console.log(`    FAIL  ${label}${detail ? `  -> ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n  ${title}`);
}

function throws(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}

// ============================================
// Mirrors src/lib/ai/provider.ts
// ============================================

const VALID_PROVIDER_NAMES = [
  "anthropic",
  "openai",
  "openrouter",
  "ollama",
  "azure-openai",
  "custom",
];

function resolveProviderName(env) {
  const configured = env.AI_PROVIDER?.trim().toLowerCase();
  if (!configured) return null;
  if (VALID_PROVIDER_NAMES.includes(configured)) return configured;
  throw new Error(
    `Unknown AI_PROVIDER "${configured}". Expected one of: ${VALID_PROVIDER_NAMES.join(", ")}.`
  );
}

function requireEnv(env, name, providerName) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`AI_PROVIDER=${providerName} requires ${name} to be set. See .env.example.`);
  }
  return value;
}

function requireModel(env, providerName) {
  return requireEnv(env, "AI_MODEL", providerName);
}

// ============================================
// Mirrors src/lib/ai/providers/anthropic.ts
// ============================================

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_DEFAULT_MAX_TOKENS = 1024;

function buildAnthropicRequest(env, input) {
  const apiKey = requireEnv(env, "ANTHROPIC_API_KEY", "anthropic");
  const model = requireModel(env, "anthropic");
  return {
    url: ANTHROPIC_API_URL,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: {
      model,
      ...(input.system ? { system: input.system } : {}),
      messages: input.messages,
      max_tokens: input.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    },
  };
}

// ============================================
// Mirrors src/lib/ai/providers/openai-compatible.ts
// ============================================

function buildOpenAICompatRequest(baseUrl, apiKey, model, input) {
  const headers = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const messages = input.system
    ? [{ role: "system", content: input.system }, ...input.messages]
    : input.messages;

  return {
    url: `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    headers,
    body: {
      model,
      messages,
      ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    },
  };
}

function resolveOllamaBaseUrl(env) {
  const base = env.AI_BASE_URL?.trim() || "http://localhost:11434";
  return `${base.replace(/\/$/, "")}/v1`;
}

// ============================================
// Mirrors src/lib/ai/providers/azure-openai.ts
// ============================================

const AZURE_DEFAULT_API_VERSION = "2024-10-21";

function buildAzureRequest(env, input) {
  const endpoint = requireEnv(env, "AZURE_OPENAI_ENDPOINT", "azure-openai").replace(/\/$/, "");
  const deployment = requireEnv(env, "AZURE_OPENAI_DEPLOYMENT", "azure-openai");
  const apiKey = requireEnv(env, "AZURE_OPENAI_API_KEY", "azure-openai");
  const apiVersion = env.AZURE_OPENAI_API_VERSION?.trim() || AZURE_DEFAULT_API_VERSION;

  const messages = input.system
    ? [{ role: "system", content: input.system }, ...input.messages]
    : input.messages;

  return {
    url: `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
    headers: { "content-type": "application/json", "api-key": apiKey },
    body: {
      messages,
      ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
    },
  };
}

// ============================================
// TESTS
// ============================================

section("factory: env-var resolution");

check(
  "no AI_PROVIDER resolves to null (AI disabled, a legitimate state)",
  resolveProviderName({}) === null
);

check(
  "AI_PROVIDER=anthropic resolves",
  resolveProviderName({ AI_PROVIDER: "anthropic" }) === "anthropic"
);

check(
  "AI_PROVIDER is trimmed and lowercased",
  resolveProviderName({ AI_PROVIDER: "  Ollama  " }) === "ollama"
);

{
  const err = throws(() => resolveProviderName({ AI_PROVIDER: "bedrock" }));
  check("unknown AI_PROVIDER value throws", err instanceof Error);
  check("unknown AI_PROVIDER error names the bad value", /bedrock/.test(err?.message ?? ""));
}

section("factory: missing required config throws actionable errors");

{
  const err = throws(() => requireEnv({}, "ANTHROPIC_API_KEY", "anthropic"));
  check("AI_PROVIDER=anthropic with no ANTHROPIC_API_KEY throws", err instanceof Error);
  check(
    "error names both the provider and the missing var",
    /anthropic/.test(err.message) && /ANTHROPIC_API_KEY/.test(err.message)
  );
}

{
  const err = throws(() =>
    requireEnv({ AI_MODEL: "gpt-4o" }, "AZURE_OPENAI_ENDPOINT", "azure-openai")
  );
  check(
    "AI_PROVIDER=azure-openai with no AZURE_OPENAI_ENDPOINT throws",
    err instanceof Error && /AZURE_OPENAI_ENDPOINT/.test(err.message)
  );
}

{
  const err = throws(() => requireModel({}, "openai"));
  check(
    "missing AI_MODEL throws for a provider that requires it",
    err instanceof Error && /AI_MODEL/.test(err.message)
  );
}

section("factory: ollama base URL defaulting");

check(
  "ollama resolves the default base URL when AI_BASE_URL is unset",
  resolveOllamaBaseUrl({}) === "http://localhost:11434/v1"
);

check(
  "ollama respects a configured AI_BASE_URL and appends /v1",
  resolveOllamaBaseUrl({ AI_BASE_URL: "http://ollama:11434" }) === "http://ollama:11434/v1"
);

check(
  "ollama base URL strips a trailing slash before appending /v1",
  resolveOllamaBaseUrl({ AI_BASE_URL: "http://ollama:11434/" }) === "http://ollama:11434/v1"
);

section("request shaping: anthropic");

{
  const req = buildAnthropicRequest(
    { ANTHROPIC_API_KEY: "sk-ant-test", AI_MODEL: "claude-sonnet-4-6" },
    { system: "Be terse.", messages: [{ role: "user", content: "hi" }], maxTokens: 256 }
  );
  check("anthropic hits the Messages API endpoint", req.url === ANTHROPIC_API_URL);
  check(
    "anthropic auth uses x-api-key, not Authorization",
    req.headers["x-api-key"] === "sk-ant-test" && !("authorization" in req.headers)
  );
  check("anthropic sends the version header", req.headers["anthropic-version"] === ANTHROPIC_VERSION);
  check("anthropic puts system as a top-level field", req.body.system === "Be terse.");
  check(
    "anthropic does not fold system into the messages array",
    req.body.messages.length === 1 && req.body.messages[0].role === "user"
  );
  check("anthropic forwards maxTokens as max_tokens", req.body.max_tokens === 256);
  check("anthropic model matches AI_MODEL", req.body.model === "claude-sonnet-4-6");
}

{
  const req = buildAnthropicRequest(
    { ANTHROPIC_API_KEY: "sk-ant-test", AI_MODEL: "claude-sonnet-4-6" },
    { messages: [{ role: "user", content: "hi" }] }
  );
  check("anthropic omits system when not provided", !("system" in req.body));
  check(
    "anthropic defaults max_tokens when unset",
    req.body.max_tokens === ANTHROPIC_DEFAULT_MAX_TOKENS
  );
}

section("request shaping: openai-compatible");

{
  const req = buildOpenAICompatRequest(
    "https://api.openai.com/v1",
    "sk-test",
    "gpt-4o-mini",
    { system: "Be terse.", messages: [{ role: "user", content: "hi" }] }
  );
  check("openai hits {base}/chat/completions", req.url === "https://api.openai.com/v1/chat/completions");
  check("openai uses Bearer auth", req.headers.authorization === "Bearer sk-test");
  check(
    "openai folds system into the messages array as role: system",
    req.body.messages[0].role === "system" && req.body.messages[0].content === "Be terse."
  );
  check("openai preserves the user message after system", req.body.messages[1].content === "hi");
}

{
  // ollama: no API key configured — self-hosted, no data leaves the machine.
  const req = buildOpenAICompatRequest("http://localhost:11434/v1", undefined, "qwen3", {
    messages: [{ role: "user", content: "hi" }],
  });
  check(
    "ollama sends no Authorization header when no key is configured",
    !("authorization" in req.headers)
  );
  check(
    "ollama still hits the OpenAI-shaped endpoint",
    req.url === "http://localhost:11434/v1/chat/completions"
  );
}

section("request shaping: azure-openai");

{
  const req = buildAzureRequest(
    {
      AZURE_OPENAI_ENDPOINT: "https://my-resource.openai.azure.com/",
      AZURE_OPENAI_DEPLOYMENT: "gpt-4o-deployment",
      AZURE_OPENAI_API_KEY: "az-key",
    },
    { messages: [{ role: "user", content: "hi" }] }
  );
  check(
    "azure builds a deployment-scoped URL with the default api-version",
    req.url ===
      "https://my-resource.openai.azure.com/openai/deployments/gpt-4o-deployment/chat/completions?api-version=2024-10-21"
  );
  check("azure trims a trailing slash on the endpoint before joining", !req.url.includes("azure.com//"));
  check(
    "azure auth uses api-key, not Authorization",
    req.headers["api-key"] === "az-key" && !("authorization" in req.headers)
  );
  check("azure body has no top-level model field (the deployment implies it)", !("model" in req.body));
}

{
  const req = buildAzureRequest(
    {
      AZURE_OPENAI_ENDPOINT: "https://my-resource.openai.azure.com",
      AZURE_OPENAI_DEPLOYMENT: "gpt-4o-deployment",
      AZURE_OPENAI_API_KEY: "az-key",
      AZURE_OPENAI_API_VERSION: "2025-01-01-preview",
    },
    { messages: [{ role: "user", content: "hi" }] }
  );
  check(
    "azure respects a configured AZURE_OPENAI_API_VERSION",
    req.url.endsWith("api-version=2025-01-01-preview")
  );
}

// ============================================
// SUMMARY
// ============================================

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
