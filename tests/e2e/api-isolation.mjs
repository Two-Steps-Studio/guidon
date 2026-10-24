import assert from "node:assert/strict";
import { request as playwrightRequest } from "playwright";

export async function apiIsolation({origin,fixture,api,client}){
  assert.equal(new URL(origin).hostname,"127.0.0.1","API security tests require this runner's disposable loopback app");
  const http=await playwrightRequest.newContext({baseURL:origin,ignoreHTTPSErrors:true,timeout:15000,maxRedirects:0});
  let assertions=0;
  const [owner,foreign]=fixture.users;
  const [ownTask,foreignTask]=api.tasks;
  async function rest(method,url,key,{data,headers={}}={}){
    return http.fetch(url,{method,data,headers:{...(key?{authorization:`Bearer ${key}`} : {}),...headers}});
  }
  async function status(response,expected){assert.equal(response.status(),expected);assertions++;return response;}
  let rpcId=0;
  async function rpc(key,method,params){
    const response=await rest("POST","/api/mcp",key,{headers:{accept:"application/json, text/event-stream","mcp-protocol-version":"2025-06-18"},data:{jsonrpc:"2.0",id:++rpcId,method,...(params?{params}:{})}});
    await status(response,200);return response.json();
  }
  async function tool(key,name,args,denied=false){
    const body=await rpc(key,"tools/call",{name,arguments:args});
    assert.ok(body.result,"MCP request must reach an actual registered tool");
    assert.equal(Boolean(body.result.isError),denied);assertions++;
    assert.equal(JSON.stringify(body).includes(foreignTask.title),false,"MCP must not disclose a foreign task");
    assert.equal(JSON.stringify(body).includes(foreign.projectName),false,"MCP must not disclose a foreign project");
    return body.result;
  }
  try{
    const discovery=await http.get("/.well-known/oauth-authorization-server");
    await status(discovery,200);
    const metadata=await discovery.json();
    assert.equal(metadata.issuer,origin);
    for(const field of ["authorization_endpoint","token_endpoint","registration_endpoint"])assert.equal(new URL(metadata[field]).origin,origin);
    for(const key of [null,"guidon_invalid_test_key_0000000000000000",api.keys.revoked,api.keys.expired]){
      const denied=await status(await rest("GET","/api/v1/projects",key),401);
      assert.ok(denied.headers()["www-authenticate"]?.includes(origin));
      await status(await rest("POST","/api/mcp",key,{data:{jsonrpc:"2.0",id:1,method:"tools/list"}}),401);
    }
    const projects=await status(await rest("GET","/api/v1/projects",api.keys.owner),200);
    const projectText=await projects.text();assert.ok(projectText.includes(owner.projectId));assert.equal(projectText.includes(foreign.projectId),false);
    const own=await status(await rest("GET",`/api/v1/tasks/${ownTask.id}`,api.keys.owner),200);
    assert.equal((await own.json()).task.title,ownTask.title);
    await status(await rest("GET",`/api/v1/tasks/${foreignTask.id}`,api.keys.foreign),200);
    for(const [method,data] of [["GET",undefined],["PATCH",{title:"UNAUTHORIZED-CHANGE"}],["DELETE",undefined]]){
      const denied=await status(await rest(method,`/api/v1/tasks/${foreignTask.id}`,api.keys.owner,{data}),404);
      assert.equal((await denied.text()).includes(foreignTask.title),false);
    }
    await status(await rest("GET",`/api/v1/projects/${foreign.projectId}/tasks`,api.keys.owner),404);
    await status(await rest("PATCH",`/api/v1/tasks/${ownTask.id}`,api.keys.read,{data:{title:"UNAUTHORIZED-CHANGE"}}),403);
    await status(await rest("PATCH",`/api/v1/tasks/${ownTask.id}`,api.keys.viewer,{data:{title:"UNAUTHORIZED-CHANGE"}}),403);
    await status(await rest("DELETE",`/api/v1/tasks/${ownTask.id}`,api.keys.viewer),403);
    await status(await rest("GET",`/api/v1/tasks/${ownTask.id}`,api.keys.report),403);
    await status(await rest("POST","/api/mcp",api.keys.report,{data:{jsonrpc:"2.0",id:1,method:"tools/list"}}),403);
    for(const originHeader of [undefined,"https://wrong.example.test"]){await status(await rest("GET",`/api/v1/tasks/${ownTask.id}`,api.keys.origin,{headers:originHeader?{origin:originHeader}:{}}),403);}
    await status(await rest("GET",`/api/v1/tasks/${ownTask.id}`,api.keys.origin,{headers:{origin:"https://allowed.example.test"}}),200);
    const listed=await rpc(api.keys.owner,"tools/list");assert.ok(listed.result.tools.some(tool=>tool.name==="get_task_context"));
    await tool(api.keys.owner,"list_projects",{});
    await tool(api.keys.owner,"get_task_context",{task_id:ownTask.id});
    await tool(api.keys.owner,"get_task_context",{task_id:foreignTask.id},true);
    await tool(api.keys.owner,"update_task",{task_id:foreignTask.id,title:"UNAUTHORIZED-CHANGE"},true);
    await tool(api.keys.owner,"delete_task",{task_id:foreignTask.id},true);
    await tool(api.keys.read,"update_task",{task_id:ownTask.id,title:"UNAUTHORIZED-CHANGE"},true);
    await tool(api.keys.viewer,"update_task",{task_id:ownTask.id,title:"UNAUTHORIZED-CHANGE"},true);
    for(const task of api.tasks){assert.equal((await client.query("SELECT title FROM public.tasks WHERE id=$1",[task.id])).rows[0]?.title,task.title,"Denied REST/MCP calls must not mutate/delete actual data");}
    const created=await status(await rest("POST",`/api/v1/projects/${owner.projectId}/tasks`,api.keys.owner,{data:{title:"Allowed E2E API task"}}),200);
    const createdId=(await created.json()).task.id;
    await status(await rest("PATCH",`/api/v1/tasks/${createdId}`,api.keys.owner,{data:{title:"Allowed E2E update"}}),200);
    await status(await rest("DELETE",`/api/v1/tasks/${createdId}`,api.keys.owner),200);
    assert.equal((await client.query("SELECT 1 FROM public.tasks WHERE id=$1",[createdId])).rowCount,0);
    const mcpCreated=await tool(api.keys.owner,"create_task",{project_id:owner.projectId,title:"Allowed MCP task"});
    const mcpCreatedId=JSON.parse(mcpCreated.content.find(item=>item.type==="text").text).task.id;
    await tool(api.keys.owner,"update_task",{task_id:mcpCreatedId,title:"Allowed MCP update"});
    assert.equal((await client.query("SELECT title FROM public.tasks WHERE id=$1",[mcpCreatedId])).rows[0]?.title,"Allowed MCP update");
    await tool(api.keys.owner,"delete_task",{task_id:mcpCreatedId});
    assert.equal((await client.query("SELECT 1 FROM public.tasks WHERE id=$1",[mcpCreatedId])).rowCount,0);
    // Dedicated key, sequential bounded traffic, only this disposable process.
    for(let i=0;i<60;i++)await status(await rest("GET","/api/v1/projects",api.keys.rate),200);
    const limited=await status(await rest("GET","/api/v1/projects",api.keys.rate),429);
    assert.equal(limited.headers()["ratelimit-remaining"],"0");
    const mcpLimited=await rest("POST","/api/mcp",api.keys.rate,{data:{jsonrpc:"2.0",id:1,method:"tools/list"}});
    await status(mcpLimited,429);
    console.log(`pass REST/MCP isolation, scopes, revoked/expired/bound keys, origins, mutation preservation and shared rate limiting (${assertions} checks)`);
    return {outcome:"passed",checks:assertions,mode:"isolated-self-hosted-rest-and-mcp"};
  } finally {await http.dispose();}
}
