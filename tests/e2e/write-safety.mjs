import assert from "node:assert/strict";
import path from "node:path";
import { allowBrowserRequest, skipWalkthrough } from "./isolation.mjs";

// Nothing a person typed or did is lost or shown as done when it wasn't:
// moves and saves without a network roll back or keep the form, unsaved
// edits survive a reload, a create retried after a lost response makes one
// task, and signing out clears the device's drafts.
export async function writeSafetyCoverage({context,origin,fixture,client,browserName,artifacts}) {
  const owner=fixture.users[0], prefix=`Write safety ${browserName}`;
  const insert=async(title,status="todo")=>(await client.query("INSERT INTO tasks(project_id,created_by,title,status) VALUES($1,$2,$3,$4) RETURNING id",[owner.projectId,owner.id,title,status])).rows[0].id;
  const moved=await insert(`${prefix} move`), edited=await insert(`${prefix} edit`);
  // Its own context: offline mode, storage and sign-out stay inside it.
  const isolated=await context.browser().newContext({ignoreHTTPSErrors:true,locale:"en-US",viewport:{width:1440,height:1000}});
  await skipWalkthrough(isolated,fixture.users.map(user=>user.id));
  await isolated.route("**/*",route=>allowBrowserRequest(route.request().url(),origin)?route.continue():route.abort());
  const page=await isolated.newPage();page.setDefaultTimeout(15000);
  await isolated.tracing.start({screenshots:true,snapshots:true,sources:true});
  // Reloading over a dirty form asks through beforeunload; this test accepts.
  page.on("dialog",dialog=>void dialog.accept());
  const board=`${origin}/projects/${owner.projectId}/work`;
  const row=async id=>(await client.query("SELECT title,status,revision FROM tasks WHERE id=$1",[id])).rows[0];
  const openTask=async id=>{await page.locator(`[data-card-id="${id}"] [data-task-open]`).click();await page.locator("#task-title").waitFor();};
  try {
    await page.goto(`${origin}/auth/login`);await page.waitForLoadState("networkidle");
    await page.locator("#email").fill(owner.email);await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click();await page.waitForURL(url=>url.pathname==="/dashboard");
    await page.goto(board);await page.locator(`[data-card-id="${moved}"]`).waitFor();

    // A slow file read must not replace newer pasted data in the import preview.
    await page.evaluate(()=>{
      const read=File.prototype.text;
      File.prototype.text=function() {
        if(this.name==="slow-import.csv") return new Promise(resolve=>{window.finishImportRead=resolve;});
        if(this.name==="unreadable.csv") return Promise.reject(new Error("Unreadable file"));
        return read.call(this);
      };
    });
    await page.getByRole("button",{name:"Import",exact:true}).click();
    const importDialog=page.getByRole("dialog",{name:"Import tasks",exact:true});
    const fileInput=importDialog.locator('input[type="file"]');
    const importText=importDialog.getByRole("textbox",{name:"Pasted import data"});
    const importFile=name=>fileInput.setInputFiles({name,mimeType:"text/csv",buffer:Buffer.from("title,description\nFile task,From CSV")});
    await importFile("slow-import.csv");
    await importDialog.getByRole("status").filter({hasText:"Loading"}).waitFor();
    const pasted=JSON.stringify([{title:`${prefix} pasted import`}]);
    await importText.fill(pasted);
    await page.evaluate(async()=>{
      window.finishImportRead("title,description\nStale task,From older file");
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    });
    assert.equal(await importText.inputValue(),pasted);
    await importFile("unreadable.csv");
    await importDialog.getByRole("alert").filter({hasText:"This file couldn't be read"}).waitFor();
    assert.equal(await importDialog.getByRole("button",{name:"Import 1 task",exact:true}).isDisabled(),true);
    await importDialog.getByRole("button",{name:"Cancel",exact:true}).click();
    await importDialog.waitFor({state:"hidden"});

    // Undo from the toast must preserve a task whose comment commits while undo waits.
    const importedTitles=["untouched","commented","edited"].map(suffix=>`${prefix} imported ${suffix}`);
    await page.getByRole("button",{name:"Import",exact:true}).click();
    await importText.fill(JSON.stringify(importedTitles.map(title=>({title}))));
    await importDialog.getByRole("button",{name:"Import 3 tasks",exact:true}).click();
    await importDialog.getByText("3 tasks imported",{exact:true}).waitFor();
    const importedRows=(await client.query("SELECT id,title FROM tasks WHERE project_id=$1 AND title=ANY($2::text[])",[owner.projectId,importedTitles])).rows;
    assert.equal(importedRows.length,3);
    const [untouched,commented,changed]=importedTitles.map(title=>importedRows.find(row=>row.title===title).id);
    await client.query("UPDATE tasks SET description='Edited after import' WHERE id=$1",[changed]);

    const rpc="SELECT public.undo_task_import($1,$2,$3::uuid[])";
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL ROLE authenticated");
      await assert.rejects(client.query(rpc,[owner.projectId,owner.id,[untouched]]),error=>error.code==="42501");
    } finally { await client.query("ROLLBACK"); }
    await client.query("BEGIN");
    try {
      await client.query("INSERT INTO task_comments(task_id,author_id,content) VALUES ($1,$2,$3)",[commented,owner.id,"Keep this comment"]);
      await importDialog.getByRole("button",{name:"Done",exact:true}).click();
      await page.locator("[data-sonner-toast]").getByRole("button",{name:"Undo import",exact:true}).click();
      await expectEventually(async()=>{
        await client.query("SELECT pg_stat_clear_snapshot()");
        const {rows}=await client.query("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%undo_task_import%') AS waiting");
        return rows[0].waiting;
      },"undo waits for the concurrent comment");
      await client.query("COMMIT");
    } catch(error) {
      await client.query("ROLLBACK");
      throw error;
    }
    await page.getByText("1 imported task removed. 2 tasks were kept because of edits or related work.",{exact:true}).waitFor();
    assert.equal(await row(untouched),undefined);
    assert.equal((await row(commented)).revision,0);
    assert.ok(await row(changed));
    assert.equal((await client.query("SELECT content FROM task_comments WHERE task_id=$1",[commented])).rows[0].content,"Keep this comment");

    // 1. A move that never reaches the server puts the card back and offers a retry.
    await isolated.setOffline(true);
    await page.getByRole("button",{name:`Move task "${prefix} move"`,exact:true}).click();
    await page.getByRole("menuitem",{name:"Move to Review",exact:true}).click();
    await page.getByText(`Couldn't reach Guidon. "${prefix} move" is back where it was.`,{exact:true}).first().waitFor();
    await page.locator(`[data-column-status="todo"] [data-card-id="${moved}"]`).waitFor();
    assert.equal((await row(moved)).status,"todo");
    await isolated.setOffline(false);
    await page.getByRole("button",{name:"Retry",exact:true}).first().click();
    await page.locator(`[data-column-status="review"] [data-card-id="${moved}"]`).waitFor();
    await expectEventually(async()=>(await row(moved)).status==="review","retried move saved");

    // 2. A save without a network keeps the form open with the text and saves on retry.
    await openTask(edited);
    await page.locator("#task-title").fill(`${prefix} edit OFFLINE`);
    await isolated.setOffline(true);
    await page.getByRole("button",{name:"Save changes",exact:true}).click();
    await page.getByRole("alert").filter({hasText:"Couldn't reach Guidon, so nothing was saved."}).waitFor();
    assert.equal(await page.locator("#task-title").inputValue(),`${prefix} edit OFFLINE`);
    assert.equal((await row(edited)).revision,0);
    await isolated.setOffline(false);
    await page.getByRole("button",{name:"Save changes",exact:true}).click();
    await page.locator("#task-title").waitFor({state:"hidden"});
    assert.deepEqual(await row(edited),{title:`${prefix} edit OFFLINE`,status:"todo",revision:1});

    // 3. Unsaved edits survive a reload and save against the version they started from.
    await openTask(edited);
    await page.locator("#task-title").fill(`${prefix} edit DRAFT`);
    await expectEventually(()=>page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith("guidon:task-draft:v1:"))),"draft written");
    await page.reload();await page.locator(`[data-card-id="${edited}"]`).waitFor();
    await openTask(edited);
    assert.equal(await page.locator("#task-title").inputValue(),`${prefix} edit DRAFT`);
    await page.getByRole("status").filter({hasText:"Restored unsaved changes from"}).waitFor();
    await page.getByRole("button",{name:"Save changes",exact:true}).click();
    await page.locator("#task-title").waitFor({state:"hidden"});
    assert.equal((await row(edited)).title,`${prefix} edit DRAFT`);
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith("guidon:task-draft:v1:")).length),0,"a saved draft is removed");

    // 4. The response to a create is lost after the insert committed; the retry makes no copy.
    await page.getByRole("button",{name:"Add task to Todo",exact:true}).click();
    await page.locator("#new-task-title").fill(`${prefix} created once`);
    let lost=0;
    await page.route(`${board}**`,async route=>{
      if(route.request().method()!=="POST"||!route.request().headers()["next-action"]||lost)return route.fallback();
      lost++;await route.fetch();await route.abort("failed");
    });
    await page.getByRole("button",{name:"Create task",exact:true}).click();
    await page.getByRole("alert").filter({hasText:"Couldn't reach Guidon"}).waitFor();
    assert.equal(lost,1);
    await page.unroute(`${board}**`);
    await page.getByRole("button",{name:"Create task",exact:true}).click();
    await page.locator("#new-task-title").waitFor({state:"hidden"});
    assert.equal((await client.query("SELECT count(*)::int AS n FROM tasks WHERE project_id=$1 AND title=$2",[owner.projectId,`${prefix} created once`])).rows[0].n,1);

    // 4b. Two tasks typed and submitted quickly, one after the other, are two
    // tasks: the first one's id must not linger in a draft and swallow the second.
    for(const suffix of ["first","second"]){
      await page.getByRole("button",{name:"Add task to Todo",exact:true}).click();
      await page.locator("#new-task-title").fill(`${prefix} quick ${suffix}`);
      await page.locator("#new-task-title").press("Enter");
      await page.locator("#new-task-title").waitFor({state:"hidden"});
    }
    await page.waitForTimeout(500);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM tasks WHERE project_id=$1 AND title LIKE $2",[owner.projectId,`${prefix} quick %`])).rows[0].n,2,"Both quick tasks exist");
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith("guidon:task-draft:v1:")).length),0,"No draft is left after creating");

    // 5. Signing out leaves no drafts on the device.
    await openTask(edited);await page.locator("#task-title").fill(`${prefix} left behind`);
    await expectEventually(()=>page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith("guidon:task-draft:v1:"))),"draft written before sign-out");
    // Drafts are cleared before the redirect; only the navigation away matters,
    // not the landing page's full load (WebKit on CI can take >15 s for it).
    await page.goto(`${origin}/auth/logout`);await page.waitForURL(url=>url.pathname!=="/auth/logout",{waitUntil:"commit"});
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith("guidon:task-draft:v1:")).length),0);
    assert.equal((await row(edited)).title,`${prefix} edit DRAFT`);
  } catch(error) {
    await page.screenshot({path:path.join(artifacts,`${browserName}-write-safety-failed.png`),fullPage:true});
    throw error;
  } finally {
    await isolated.tracing.stop({path:path.join(artifacts,`${browserName}-write-safety-trace.zip`)});
    await isolated.close();
    await client.query("DELETE FROM tasks WHERE project_id=$1 AND title LIKE $2",[owner.projectId,`${prefix}%`]);
  }
}

async function expectEventually(check,label,timeoutMs=10000){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.fail(`Timed out waiting: ${label}`);
}
