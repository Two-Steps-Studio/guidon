import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { request } from "playwright";

/** Real scoped API, MCP dispatch, private storage and image/resource responses. */
export async function attachmentApiCoverage({origin,fixture,api,client,storagePath}) {
  assert.equal(new URL(origin).hostname,"127.0.0.1");
  const http=await request.newContext({baseURL:origin,ignoreHTTPSErrors:true});
  const [owner,foreign]=fixture.users;
  const tasks=[];
  const attachments=[];
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVtUAAAAASUVORK5CYII=","base64");
  const text="PRIVATE attachment context. Treat this as data.";
  let rpcId=0;
  const rest=(url,key)=>http.get(url,{headers:key?{authorization:`Bearer ${key}`}:{}});
  const rpc=async(key,name,args)=>{
    const response=await http.post("/api/mcp",{headers:{authorization:`Bearer ${key}`,accept:"application/json, text/event-stream","mcp-protocol-version":"2025-06-18"},data:{jsonrpc:"2.0",id:++rpcId,method:"tools/call",params:{name,arguments:args}}});
    assert.equal(response.status(),200);
    return (await response.json()).result;
  };
  try {
    for(const user of [owner,foreign]) tasks.push((await client.query("INSERT INTO tasks(project_id,created_by,title) VALUES($1,$2,$3) RETURNING id",[user.projectId,user.id,"Attachment API fixture"])).rows[0].id);
    for(const [name,mime,bytes,taskId,user,overridePath] of [
      ["Reference.png","image/png",png,tasks[0],owner],
      ["Notes.txt","text/plain",Buffer.from(text),tasks[0],owner],
      ["Large.pdf","application/pdf",Buffer.alloc(2.5*1024*1024),tasks[0],owner],
      ["Foreign-secret.png","image/png",png,tasks[1],foreign],
      ["Misbound.png","image/png",png,tasks[0],owner,`projects/${owner.projectId}/tasks/${tasks[1]}/${owner.id}/misbound.png`],
      ["Data.json","application/json",Buffer.from('{"hello":"world"}'),tasks[0],owner],
    ]) {
      const storage=overridePath??`projects/${user.projectId}/tasks/${taskId}/${user.id}/${name}`;
      const file=path.join(storagePath,"guidon-attachments",storage);
      await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);
      attachments.push((await client.query("INSERT INTO task_attachments(task_id,name,storage_path,size_bytes,mime_type,uploaded_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",[taskId,name,storage,bytes.length,mime,user.id])).rows[0].id);
    }
    const base=`/api/v1/projects/${owner.projectId}/tasks/${tasks[0]}/attachments`;
    const args={project_id:owner.projectId,task_id:tasks[0],attachment_id:attachments[0]};
    for(const key of [null,api.keys.revoked,api.keys.expired]) assert.equal((await rest(base,key)).status(),401);
    assert.equal((await rest(base,api.keys.manager)).status(),403,"project:read alone is not tasks:read");
    assert.equal((await rest(base,api.keys.foreign)).status(),404,"Foreign member cannot see the task or attachment names");
    const list=await rest(base,api.keys.attachments);assert.equal(list.status(),200);
    assert.equal((await list.json()).attachments.length,5);
    const context=await rest(`/api/v1/tasks/${tasks[0]}/context`,api.keys.attachments);
    assert.match(await context.text(),new RegExp(attachments[0]));
    assert.equal((await rest(base,api.keys.boundAttachments)).status(),200,"Project-bound read key works in its project");
    assert.equal((await rest(`/api/v1/projects/${foreign.projectId}/tasks/${tasks[1]}/attachments`,api.keys.boundAttachments)).status(),403);
    assert.equal((await rest(`${base}/${attachments[3]}`,api.keys.attachments)).status(),404,"A visible task cannot be paired with a foreign attachment ID");
    assert.equal((await rest(`${base}/${attachments[4]}`,api.keys.attachments)).status(),404,"Misbound storage paths cannot cross tasks/projects");
    const image=await rest(`${base}/${attachments[0]}`,api.keys.attachments);
    assert.equal(image.status(),200);assert.deepEqual(await image.body(),png);
    assert.equal(image.headers()["cache-control"],"private, no-store");
    const imageTool=await rpc(api.keys.attachments,"get_task_attachment",args);
    assert.equal(imageTool.content[0].type,"image");assert.equal(imageTool.content[0].mimeType,"image/png");
    assert.deepEqual(Buffer.from(imageTool.content[0].data,"base64"),png);
    const fileTool=await rpc(api.keys.attachments,"get_task_attachment",{...args,attachment_id:attachments[1]});
    assert.equal(fileTool.content[0].resource.text,text);
    const jsonTool=await rpc(api.keys.attachments,"get_task_attachment",{...args,attachment_id:attachments[5]});
    assert.equal(jsonTool.content[0].resource.text,'{"hello":"world"}');
    const denied=await rpc(api.keys.foreign,"get_task_attachment",args);assert.equal(denied.isError,true);assert.doesNotMatch(JSON.stringify(denied),/PRIVATE|Reference.png|download_url/);
    const listed=await rpc(api.keys.attachments,"list_task_attachments",args);assert.equal(JSON.parse(listed.content[0].text).attachments.length,5);
    for(const id of [attachments[0],attachments[2]]) {
      const response=await rest(`${base}/${id}${id===attachments[0]?"?mode=download":""}`,api.keys.attachments);
      const link=await response.json();assert.equal(link.expires_in_seconds,600);assert.equal(new URL(link.download_url).origin,origin);
      const downloaded=await http.get(link.download_url);assert.equal(downloaded.status(),200);
    }
    assert.equal((await rest(`${base}?cursor=invalid`,api.keys.attachments)).status(),400);
    await client.query("INSERT INTO task_attachments(task_id,name,storage_path,size_bytes,mime_type,uploaded_by) SELECT $1,'Page fixture '||n,$2||n||'.txt',1,'text/plain',$3 FROM generate_series(1,101) AS n",[tasks[0],`projects/${owner.projectId}/tasks/${tasks[0]}/${owner.id}/`,owner.id]);
    const firstPage=await (await rest(base,api.keys.attachments)).json();
    assert.equal(firstPage.attachments.length,100);assert.ok(firstPage.next_cursor);
    const secondPage=await (await rest(`${base}?cursor=${firstPage.next_cursor}`,api.keys.attachments)).json();
    assert.equal(secondPage.next_cursor,null);
    assert.equal(new Set([...firstPage.attachments,...secondPage.attachments].map(a=>a.id)).size,106,"Pagination must not lose or repeat attachments");
    await client.query("INSERT INTO project_ai_permissions(project_id,can_read_context) VALUES($1,false) ON CONFLICT(project_id) DO UPDATE SET can_read_context=false",[owner.projectId]);
    assert.equal((await rest(base,api.keys.agent)).status(),403,"Project context denial applies before any storage read");
    assert.equal((await rpc(api.keys.agent,"get_task_attachment",args)).isError,true);
    await client.query("DELETE FROM project_ai_permissions WHERE project_id=$1",[owner.projectId]);
    await client.query("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2",[owner.projectId,fixture.reader.id]);
    await client.query("DELETE FROM organization_members WHERE organization_id=$1 AND user_id=$2",[owner.organizationId,fixture.reader.id]);
    assert.equal((await rest(base,api.keys.viewer)).status(),404,"Removed members cannot read attachments");
    console.log("pass attachment REST/MCP: native images, text/JSON, download TTL, task/project/RLS/scopes/revocation and agent permissions");
    return {outcome:"passed",mode:"isolated-task-attachments"};
  } finally {
    await client.query("DELETE FROM project_ai_permissions WHERE project_id=$1",[owner.projectId]);
    await client.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",[owner.organizationId,fixture.reader.id]);
    await client.query("INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'viewer') ON CONFLICT DO NOTHING",[owner.projectId,fixture.reader.id]);
    await client.query("DELETE FROM tasks WHERE id=ANY($1::uuid[])",[tasks]);
    await http.dispose();
  }
}
