import assert from "node:assert/strict";

async function login(page,origin,email,password,destination="/dashboard"){
  await page.goto(`${origin}/auth/login`);
  // Finish the login document's hydration/autofocus before WebKit inserts
  // credentials; a late autofocus can otherwise redirect its text insertion.
  await page.waitForLoadState("networkidle");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  assert.equal(await page.locator("#email").inputValue(),email);
  assert.equal(await page.locator("#password").inputValue(),password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url=>url.pathname===destination);
  await page.getByRole("heading",{level:1}).waitFor();
}

export async function authenticationCoverage({page,context,origin,fixture,browserName,invalidSessions}){
  const [owner,foreign]=fixture.users;
  await context.clearCookies();
  for(const value of invalidSessions){
    // Keep the browser cookie itself alive, so rejection proves the app checks
    // the signed payload/expiry instead of relying on browser cookie expiry.
    await context.addCookies([{name:"guidon-session",value,url:origin,httpOnly:true,secure:true,sameSite:"Lax",expires:Math.floor(Date.now()/1000)+600}]);
    await page.goto(`${origin}/dashboard`);
    await page.waitForURL(url=>url.pathname==="/auth/login");
    await context.clearCookies();
  }
  // Recovery pages intentionally do not exist in direct-Postgres mode.
  for(const route of ["/auth/forgot-password","/auth/reset-password"]){
    await page.goto(origin+route);await page.waitForURL(url=>url.pathname==="/auth/login");
  }
  await login(page,origin,owner.email,fixture.password);
  await page.goto(`${origin}/projects/${owner.projectId}/modules`);
  await page.locator("[data-module-editor]").waitFor();
  await page.goto(`${origin}/auth/logout`);await page.waitForURL(url=>url.pathname==="/");
  await login(page,origin,fixture.reader.email,fixture.password);
  await page.goto(`${origin}/projects/${owner.projectId}/modules`);
  await page.locator("main h1").waitFor();
  assert.equal(await page.locator("[data-module-editor]").count(),0,"Viewer must not receive an owner's draft editor");
  const denied=await context.request.get(`${origin}/projects/${foreign.projectId}`);
  assert.equal((await denied.text()).includes(foreign.projectName),false);
  await page.goto(`${origin}/auth/logout`);await page.waitForURL(url=>url.pathname==="/");

  const staticPage=await context.newPage();
  await staticPage.route("**/_next/static/**/*.js",route=>route.abort());
  await staticPage.goto(`${origin}/auth/signup`);
  for(const selector of ["#fullName","#email","#password",'button[type="submit"]'])assert.ok(await staticPage.locator(selector).isDisabled(),"Signup must wait for hydration");
  await staticPage.close();
  // Bypass only browser minlength to prove that the real Server Action refuses
  // weak passwords independently. No application validation is disabled.
  await page.goto(`${origin}/auth/signup`);
  await page.locator("#fullName").fill("E2E rejected signup");
  await page.locator("#email").fill(`weak-${browserName}@guidon.example.test`);
  await page.locator("#password").fill("short");
  await page.locator("#password").evaluate(input=>input.removeAttribute("minlength"));
  await page.locator('button[type="submit"]').click();
  await page.getByRole("alert").filter({hasText:"Password must be at least 6 characters."}).waitFor();
  assert.equal((await context.cookies()).some(cookie=>cookie.name==="guidon-session"),false);

  await page.goto(`${origin}/auth/signup`);
  await page.locator("#fullName").fill("E2E duplicate signup");
  await page.locator("#email").fill(owner.email);
  await page.locator("#password").fill(fixture.password);
  await page.locator('button[type="submit"]').click();
  await page.getByRole("alert").filter({hasText:"Invalid email or password."}).waitFor();
  assert.equal((await context.cookies()).some(cookie=>cookie.name==="guidon-session"),false);

  const newEmail=`signup-${browserName}@guidon.example.test`;
  await page.goto(`${origin}/auth/signup?redirect=${encodeURIComponent("https://outside.example.test/")}`);
  await page.locator("#fullName").fill(`E2E signup ${browserName}`);
  await page.locator("#email").fill(newEmail);
  await page.locator("#password").fill(fixture.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url=>url.pathname==="/start");
  await page.getByRole("heading",{level:1}).waitFor();
  assert.equal(new URL(page.url()).origin,origin,"Untrusted redirect must stay on this origin");
  const session=(await context.cookies()).find(cookie=>cookie.name==="guidon-session");
  assert.ok(session?.secure&&session?.httpOnly);
  assert.equal((await page.locator("body").innerText()).includes(owner.projectName),false);
  await page.goto(`${origin}/auth/logout`);await page.waitForURL(url=>url.pathname==="/");
  await login(page,origin,newEmail,fixture.password,"/start");
  await page.goto(`${origin}/auth/logout`);await page.waitForURL(url=>url.pathname==="/");
}
