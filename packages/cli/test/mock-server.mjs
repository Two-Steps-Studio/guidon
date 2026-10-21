import http from "node:http";

/**
 * A tiny programmable HTTP server. `routes` maps "METHOD /path" to a handler
 * `(req) => ({ status, body, headers, raw })`; every request is recorded in
 * `server.requests` with its parsed body.
 */
export async function startMockServer(routes = {}) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    const url = new URL(req.url, "http://localhost");
    let json;
    if ((req.headers["content-type"] ?? "").startsWith("application/json") && rawBody.length) {
      try {
        json = JSON.parse(rawBody.toString("utf8"));
      } catch {
        json = undefined;
      }
    }
    const record = {
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: req.headers,
      rawBody,
      body: json,
    };
    requests.push(record);
    const key = `${req.method} ${url.pathname}`;
    const handler = routes[key] ?? routes["*"];
    const out = handler ? await handler(record, requests) : { status: 404, body: { error: `No mock for ${key}` } };
    const headers = { ...(out.headers ?? {}) };
    let payload = "";
    if (out.raw !== undefined) {
      payload = out.raw;
    } else if (out.body !== undefined) {
      payload = JSON.stringify(out.body);
      headers["content-type"] ??= "application/json";
    }
    res.writeHead(out.status ?? 200, headers);
    res.end(payload);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    routes,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
