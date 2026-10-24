// Loaded only by the disposable test application's Node process.
const allowed = new Set(["127.0.0.1","localhost","[::1]"]);
const originalFetch = globalThis.fetch;
globalThis.fetch = async function(input,options) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (!allowed.has(url.hostname)) {
    console.error(`[e2e-network] blocked external origin ${url.origin}`);
    throw new Error("External network is disabled in application E2E tests");
  }
  return originalFetch(input,options);
};
