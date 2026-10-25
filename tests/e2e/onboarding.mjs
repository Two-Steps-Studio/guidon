import assert from "node:assert/strict";

export async function onboardingCoverage({page,context,origin,fixture,client,browserName}) {
  const email=`signup-${browserName}@guidon.example.test`;
  const user=(await client.query("SELECT id FROM auth.users WHERE email=$1",[email])).rows[0];
  const name=`Onboarding project ${browserName}`,studio=`Onboarding studio ${browserName}`;
  let orgId;
  try {
    await context.clearCookies();await page.goto(`${origin}/auth/login`);await page.waitForLoadState("networkidle");
    await page.locator("#email").fill(email);await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click();await page.waitForURL(url=>url.pathname==="/start");
    await page.getByRole("button",{name:/Website/}).click();
    assert.ok(await page.getByRole("button",{name:"Continue",exact:true}).isDisabled());
    await page.locator("#onboarding-project").fill(name);await page.locator("#onboarding-studio").fill(studio);
    await page.getByRole("button",{name:"Continue",exact:true}).click();
    await page.getByRole("button",{name:"Continue",exact:true}).click();
    await page.getByRole("button",{name:/^Just me/}).click();
    await page.getByRole("button",{name:"Create my workspace",exact:true}).click();
    await page.waitForURL(url=>/^\/projects\/[^/]+\/work$/.test(url.pathname));
    await page.getByRole("heading",{name:"Task board",exact:true}).waitFor();
    await page.getByText(name,{exact:true}).first().waitFor();
    const projectId=new URL(page.url()).pathname.split("/")[2];
    const project=(await client.query("SELECT organization_id,project_type,disabled_modules FROM projects WHERE id=$1",[projectId])).rows[0];orgId=project.organization_id;
    assert.equal(project.project_type,"website");assert.ok(project.disabled_modules.includes("technology"));
    for(const table of ["project_members","organization_members"]){const column=table==="project_members"?"project_id":"organization_id";assert.equal((await client.query(`SELECT role FROM ${table} WHERE ${column}=$1 AND user_id=$2`,[table==="project_members"?projectId:orgId,user.id])).rows[0].role,"owner");}
    assert.equal(await page.evaluate(()=>localStorage.getItem("guidon-onboarding")),null);
    await page.getByRole("button",{name:"Add your first task",exact:true}).click();
    await page.locator("#new-task-title").fill(`First task ${browserName}`);
    await page.getByRole("button",{name:"Create task",exact:true}).click();
    await page.locator("#new-task-title").waitFor({state:"hidden"});
    await page.getByRole("button",{name:`Open task First task ${browserName}`,exact:true}).waitFor();
    await page.reload();await page.getByRole("button",{name:`Open task First task ${browserName}`,exact:true}).waitFor();
    assert.equal((await client.query("SELECT count(*)::int AS n FROM tasks WHERE project_id=$1",[projectId])).rows[0].n,1);
    await page.goto(`${origin}/start/finish`);await page.waitForURL(url=>url.pathname==="/dashboard");
    assert.equal((await client.query("SELECT count(*)::int AS n FROM organizations WHERE created_by=$1",[user.id])).rows[0].n,1,"Finishing again with cleared answers must not duplicate workspaces");
    const foreign=await context.request.get(`${origin}/projects/${fixture.users[0].projectId}/work`);assert.equal((await foreign.text()).includes(fixture.users[0].projectName),false);
    // Current product adds existing accounts; this is not an email invitation
    // or an acceptance-link test. That missing flow remains explicitly open.
    await page.goto(`${origin}/organizations/${orgId}/members`);
    await page.getByRole("button",{name:"Add Member",exact:true}).click();
    const orgDialog=page.getByRole("dialog");
    await orgDialog.locator("#email").fill("missing-onboarding@example.test");
    await orgDialog.getByRole("button",{name:"Add Member",exact:true}).click();
    await orgDialog.getByText("User with this email not found.",{exact:true}).waitFor();
    await orgDialog.locator("#email").fill(fixture.reader.email);
    await orgDialog.getByRole("button",{name:"Add Member",exact:true}).click();await orgDialog.waitFor({state:"hidden"});
    assert.equal((await client.query("SELECT role FROM organization_members WHERE organization_id=$1 AND user_id=$2",[orgId,fixture.reader.id])).rows[0].role,"member");
    await page.goto(`${origin}/projects/${projectId}/members`);
    await page.getByRole("button",{name:"Add member",exact:true}).click();
    const projectDialog=page.getByRole("dialog");
    await projectDialog.locator("#member-role").click();await page.getByRole("menuitem",{name:"Viewer",exact:true}).click();
    await projectDialog.getByRole("button",{name:"Add member",exact:true}).click();await projectDialog.waitFor({state:"hidden"});
    assert.equal((await client.query("SELECT role FROM project_members WHERE project_id=$1 AND user_id=$2",[projectId,fixture.reader.id])).rows[0].role,"viewer");
    await context.clearCookies();await page.goto(`${origin}/auth/login`);await page.waitForLoadState("networkidle");
    await page.locator("#email").fill(fixture.reader.email);await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click();await page.waitForURL(url=>url.pathname==="/dashboard");
    await page.goto(`${origin}/projects/${projectId}/members`);await page.getByRole("heading",{level:1}).waitFor();
    assert.equal(await page.getByRole("button",{name:"Add member",exact:true}).count(),0);
    await page.goto(`${origin}/projects/${projectId}/work`);await page.getByRole("button",{name:`Open task First task ${browserName}`,exact:true}).waitFor();
    assert.equal(await page.getByRole("button",{name:"New task",exact:true}).count(),0);
  } finally {
    await context.clearCookies();
    if(orgId)await client.query("DELETE FROM organizations WHERE id=$1 AND created_by=$2",[orgId,user.id]);
  }
}
