import assert from "node:assert/strict";
import path from "node:path";
import { allowBrowserRequest } from "./isolation.mjs";

export async function taskEditingCoverage({page,context,origin,fixture,client,browserName,artifacts}) {
  const owner=fixture.users[0], title=`Concurrent editing ${browserName}`;
  const task=(await client.query("INSERT INTO tasks(project_id,created_by,title,description) VALUES($1,$2,$3,'Original description') RETURNING id",[owner.projectId,owner.id,title])).rows[0];
  const second=await context.browser().newContext({ignoreHTTPSErrors:true,locale:"en-US",viewport:{width:1440,height:1000},acceptDownloads:true,recordVideo:{dir:path.join(artifacts,`${browserName}-task-second-session`)}});
  await second.tracing.start({screenshots:true,snapshots:true,sources:true});
  const other=await second.newPage();other.setDefaultTimeout(15000);
  let unexpectedDialogs=0;
  for(const p of [page,other])p.on("dialog",dialog=>{unexpectedDialogs++;void dialog.dismiss();});
  await second.route("**/*",route=>allowBrowserRequest(route.request().url(),origin)?route.continue():route.abort());
  const root=`${origin}/projects/${owner.projectId}/work`;
  async function openTask(p){
    await p.goto(`${origin}/auth/login`);await p.waitForLoadState("networkidle");
    await p.locator("#email").fill(owner.email);await p.locator("#password").fill(fixture.password);
    await p.locator('button[type="submit"]').click();await p.waitForURL(url=>url.pathname==="/dashboard");
    await p.goto(root);await p.locator(`[data-card-id="${task.id}"] [data-task-open]`).click();await p.locator("#task-title").waitFor();
  }
  try {
    await context.clearCookies();await openTask(page);await openTask(other);
    // Independent sessions loaded the same row, then submit distinct snapshots.
    await page.locator("#task-title").fill(`${title} FIRST`);
    await other.locator("#task-title").fill(`${title} SECOND`);
    await Promise.all([page.getByRole("button",{name:"Save changes",exact:true}).click(),other.getByRole("button",{name:"Save changes",exact:true}).click()]);
    // One save closes its dialog; the loser keeps its form and recovery actions.
    await Promise.all([page.waitForLoadState("networkidle"),other.waitForLoadState("networkidle")]);
    await Promise.race([page.getByRole("alert").filter({hasText:"This task changed or is no longer available."}).waitFor(),other.getByRole("alert").filter({hasText:"This task changed or is no longer available."}).waitFor()]);
    const loser=await page.locator("#task-title").isVisible()?page:other;
    const winner=loser===page?other:page;
    assert.equal(await winner.locator("#task-title").count(),0);
    const localText=await loser.locator("#task-title").inputValue();
    const row=(await client.query("SELECT title,description,revision FROM tasks WHERE id=$1",[task.id])).rows[0];
    assert.equal(row.revision,1);assert.notEqual(row.title,localText);assert.equal(row.description,"Original description");
    const download=loser.waitForEvent("download");await loser.getByRole("button",{name:"Download my edits",exact:true}).click();
    const downloaded=await download;const draftPath=path.join(artifacts,`${browserName}-conflicting-task-draft.json`);await downloaded.saveAs(draftPath);
    const {readFile}=await import("node:fs/promises");const backup=JSON.parse(await readFile(draftPath,"utf8"));assert.equal(backup.edits.title,localText);assert.equal(backup.revision,0);
    await loser.getByRole("button",{name:"Reload latest task",exact:true}).click();
    const confirm=loser.getByRole("dialog",{name:"Confirm action",exact:true});await confirm.waitFor();
    await confirm.getByRole("button",{name:"Cancel",exact:true}).click();assert.equal(await loser.locator("#task-title").inputValue(),localText);
    await loser.screenshot({path:path.join(artifacts,`${browserName}-task-edit-conflict.png`),fullPage:true});
    await loser.getByRole("button",{name:"Reload latest task",exact:true}).click();
    await Promise.all([
      loser.waitForEvent("framenavigated",{predicate:frame=>frame===loser.mainFrame()}),
      confirm.getByRole("button",{name:"Discard changes",exact:true}).click(),
    ]);
    await loser.waitForLoadState("networkidle");
    await loser.locator(`[data-card-id="${task.id}"] [data-task-open]`).waitFor();
    assert.equal(unexpectedDialogs,0,"An explicitly confirmed reload must not ask again through beforeunload");
    await loser.locator(`[data-card-id="${task.id}"] [data-task-open]`).click();assert.equal(await loser.locator("#task-title").inputValue(),row.title);
    await loser.locator("#task-title").fill(`${title} AFTER REFRESH`);await loser.getByRole("button",{name:"Save changes",exact:true}).click();await loser.locator("#task-title").waitFor({state:"hidden"});
    assert.equal((await client.query("SELECT revision FROM tasks WHERE id=$1",[task.id])).rows[0].revision,2);
    // The same actual task continues through comments, subtasks, attachments,
    // assignment, filters, status changes and deletion, with reload checks.
    await loser.locator(`[data-card-id="${task.id}"] [data-task-open]`).click();await loser.locator("#task-title").waitFor();
    await loser.getByRole("textbox",{name:"Add a comment",exact:true}).fill(`Persisted comment ${browserName}`);
    await loser.getByRole("button",{name:"Post comment",exact:true}).click();await loser.getByText(`Persisted comment ${browserName}`,{exact:true}).waitFor();
    await loser.getByRole("textbox",{name:"Add a subtask",exact:true}).fill(`Persisted subtask ${browserName}`);
    await loser.getByRole("button",{name:"Add subtask",exact:true}).click();
    await loser.getByRole("textbox",{name:`Subtask title: Persisted subtask ${browserName}`,exact:true}).waitFor();
    const attachments=loser.getByRole("region",{name:"Attachments",exact:true});
    await attachments.locator('input[type="file"]').setInputFiles({name:`proof-${browserName}.txt`,mimeType:"text/plain",buffer:Buffer.from("Disposable E2E attachment")});
    await attachments.getByText(`proof-${browserName}.txt`,{exact:true}).waitFor();
    await loser.locator("#task-priority").click();await loser.getByRole("menuitem",{name:"High",exact:true}).click();
    await loser.locator("#task-assignee").click();await loser.getByRole("menuitem",{name:"E2E alpha",exact:true}).click();
    await loser.locator("#task-tags").fill("regression");
    await loser.getByRole("button",{name:"Save changes",exact:true}).click();await loser.locator("#task-title").waitFor({state:"hidden"});
    await loser.reload();
    const saved=(await client.query("SELECT priority,assignee_id,tags FROM tasks WHERE id=$1",[task.id])).rows[0];
    assert.equal(saved.priority,"high");assert.equal(saved.assignee_id,owner.id);assert.deepEqual(saved.tags,["regression"]);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM task_comments WHERE task_id=$1 AND content=$2",[task.id,`Persisted comment ${browserName}`])).rows[0].n,1);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM tasks WHERE parent_task_id=$1",[task.id])).rows[0].n,1);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM task_attachments WHERE task_id=$1",[task.id])).rows[0].n,1);
    await loser.getByRole("button",{name:/^Filter by priority:/}).click();await loser.getByRole("menuitem",{name:"Low",exact:true}).click();
    await loser.getByRole("menu").waitFor({state:"hidden"});
    assert.equal(await loser.locator(`[data-card-id="${task.id}"]`).count(),0);
    await loser.getByRole("button",{name:/^Filter by priority:/}).click();await loser.getByRole("menuitem",{name:"All priorities",exact:true}).click();
    await loser.getByRole("menu").waitFor({state:"hidden"});
    const card=loser.locator(`[data-card-id="${task.id}"]`);await card.getByRole("button",{name:`Move task "${title} AFTER REFRESH"`,exact:true}).click();
    await loser.getByRole("menuitem",{name:"Move to Review",exact:true}).click();
    await loser.getByRole("status").filter({hasText:`${title} AFTER REFRESH`}).waitFor();
    await loser.reload();assert.equal((await client.query("SELECT status FROM tasks WHERE id=$1",[task.id])).rows[0].status,"review");
    await loser.locator(`[data-card-id="${task.id}"] [data-task-open]`).click();await loser.locator("#task-title").waitFor();
    await loser.getByRole("button",{name:"Delete",exact:true}).click();await loser.getByRole("dialog",{name:"Confirm action",exact:true}).getByRole("button",{name:"Delete",exact:true}).click();
    await loser.locator("#task-title").waitFor({state:"hidden"});assert.equal((await client.query("SELECT 1 FROM tasks WHERE id=$1",[task.id])).rowCount,0);
  } catch(error) {
    await Promise.all([page.screenshot({path:path.join(artifacts,`${browserName}-task-first-failed.png`),fullPage:true}),other.screenshot({path:path.join(artifacts,`${browserName}-task-second-failed.png`),fullPage:true})]);
    throw error;
  } finally {
    // Discard only this fixture's windows and task; all targets are disposable.
    await second.tracing.stop({path:path.join(artifacts,`${browserName}-task-second-session-trace.zip`)});
    await second.close();await context.clearCookies();
    page.removeAllListeners("dialog");page.on("dialog",dialog=>void dialog.accept());await page.goto(origin);page.removeAllListeners("dialog");
    await client.query("DELETE FROM tasks WHERE id=$1 AND project_id=$2",[task.id,owner.projectId]);
  }
}
