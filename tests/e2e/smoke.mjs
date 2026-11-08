import assert from "node:assert/strict";

export async function releaseSmoke({page,context,origin,fixture}) {
  const [own,foreign]=fixture.users;
  const landing=await context.request.get(`${origin}/`);
  assert.equal(landing.headers()["x-powered-by"],undefined,"The stack must not be advertised");
  assert.equal(landing.headers()["cross-origin-opener-policy"],"same-origin");
  assert.equal(landing.headers()["cross-origin-resource-policy"],"same-origin");
  const scriptSrc=landing.headers()["content-security-policy"].split("; ").find(part=>part.startsWith("script-src "));
  assert.match(scriptSrc,/'nonce-[^']+' 'strict-dynamic'/);assert.doesNotMatch(scriptSrc,/unsafe-inline|unsafe-eval/,"Pages run scripts by nonce only");
  assert.equal((await context.request.get(`${origin}/widget/report.js`)).headers()["cross-origin-resource-policy"],"cross-origin","Sites embedding the report widget must be able to load it");
  // API answers stay out of shared caches; the public server card keeps its hour.
  assert.equal((await context.request.get(`${origin}/api/v1/projects`)).headers()["cache-control"],"private, no-store");
  assert.equal((await context.request.get(`${origin}/api/mcp/server-card`)).headers()["cache-control"],"public, max-age=3600");
  const redirectToLogin=await context.request.get(`${origin}/dashboard`,{maxRedirects:0});
  assert.equal(redirectToLogin.status(),307);
  assert.equal(redirectToLogin.headers()["cache-control"],"private, no-store");
  const staticPage=await context.newPage();
  await staticPage.route("**/_next/static/**/*.js",route=>route.abort());
  await staticPage.goto(`${origin}/auth/login`);
  assert.ok(await staticPage.locator("#email").isDisabled(),"SSR controls must wait for hydration");
  assert.ok(await staticPage.locator("#password").isDisabled());
  assert.ok(await staticPage.locator('button[type="submit"]').isDisabled());
  await staticPage.close();
  await page.goto(`${origin}/dashboard`);
  await page.waitForURL(url=>url.pathname==="/auth/login");
  await page.locator("#email").fill(own.email);
  await page.locator("#password").fill("wrong-password-for-fixture");
  await page.locator('button[type="submit"]').click();
  await page.getByRole("alert").filter({hasText:"Invalid email or password."}).waitFor();
  assert.equal((await context.cookies()).some(cookie=>cookie.name==="guidon-session"),false);
  await page.locator("#password").fill(fixture.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url=>url.pathname==="/dashboard");
  await page.getByRole("heading",{level:1}).waitFor();
  const session=(await context.cookies()).find(cookie=>cookie.name==="guidon-session");
  assert.ok(session?.httpOnly && session?.secure,"Production login must retain HttpOnly and Secure cookies");
  assert.notEqual(session.sameSite,"None","A cross-site form must not carry the session");
  const redirectFromLogin=await context.request.get(`${origin}/auth/login`,{maxRedirects:0});
  assert.equal(redirectFromLogin.status(),307);
  assert.equal(redirectFromLogin.headers()["cache-control"],"private, no-store");
  // CORS (docs/audits/cors-2026-11-02.md): public documents are readable from
  // any site; nothing answers a foreign Origin with credentials allowed, and
  // signed-in routes don't answer it at all - even with a live session cookie.
  const evil={Origin:"https://evil.example"};
  for (const pathname of ["/api/mcp/server-card","/auth.md","/openapi.json","/.well-known/oauth-authorization-server"]) {
    const headers=(await context.request.get(origin+pathname,{headers:evil})).headers();
    assert.equal(headers["access-control-allow-origin"],"*",`${pathname} is a public document`);
    assert.equal(headers["access-control-allow-credentials"],undefined);
  }
  for (const [method,pathname] of [["GET","/api/v1/search?q=a"],["GET","/api/v1/projects"],["POST","/api/mcp"],["POST","/api/ai/chat"],["OPTIONS","/api/v1/projects"],["OPTIONS","/api/mcp"]]) {
    const headers=(await context.request.fetch(origin+pathname,{method,maxRedirects:0,headers:{...evil,"Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"authorization,content-type"}})).headers();
    assert.equal(headers["access-control-allow-origin"],undefined,`${method} ${pathname} must not be readable from another site`);
    assert.equal(headers["access-control-allow-credentials"],undefined);
  }
  await page.goto(`${origin}/projects`);
  await page.getByText(own.projectName,{exact:true}).first().waitFor();
  assert.equal((await page.locator("body").innerText()).includes(foreign.projectName),false);
  await page.reload();await page.getByText(own.projectName,{exact:true}).first().waitFor();
  await page.goto(`${origin}/dashboard`);
  assert.equal((await page.locator("body").innerText()).includes(foreign.projectName),false);
  const denied=await context.request.get(`${origin}/projects/${foreign.projectId}`);
  assert.equal((await denied.text()).includes(foreign.projectName),false,"Foreign project name must not leak in HTML/RSC");
  const ownResponse=await context.request.get(`${origin}/projects/${own.projectId}`);
  assert.equal(ownResponse.ok(),true);
  assert.ok((await ownResponse.text()).includes(own.projectName));
  await page.goto(`${origin}/auth/logout`);
  await page.waitForURL(url=>url.pathname==="/");
  await page.goto(`${origin}/dashboard`);await page.waitForURL(url=>url.pathname==="/auth/login");
  assert.equal((await context.cookies()).some(cookie=>cookie.name==="guidon-session"),false);
}
