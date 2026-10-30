import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { request } from "playwright";

/** Real authenticated image delivery; no hosted data or external storage. */
export async function lighthouseReportCoverage({page,origin,fixture,client,storagePath,authSecret,browserName}) {
  const [owner,foreign]=fixture.users;
  const previous=(await client.query("SELECT avatar_url FROM profiles WHERE id=$1",[owner.id])).rows[0].avatar_url;
  const tasks=[],files=[];
  const anonymous=await request.newContext({baseURL:origin,ignoreHTTPSErrors:true});
  const login=async user=>{
    await page.context().clearCookies();await page.goto(origin+"/auth/login");
    await page.locator("#email").fill(user.email);await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click();await page.waitForURL(url=>url.pathname==="/dashboard");
  };
  try {
    const pixels=Buffer.alloc(1600*800*3);let seed=381;
    for(let i=0;i<pixels.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;pixels[i]=seed&255;}
    const source=await sharp(pixels,{raw:{width:1600,height:800,channels:3}}).png().toBuffer();
    const paths=[];
    for(let i=0;i<4;i++){
      const user=i===3?foreign:owner;
      const task=(await client.query("INSERT INTO tasks(project_id,created_by,title,status,sort_order) VALUES($1,$2,$3,'backlog',$4) RETURNING id",[user.projectId,user.id,`Lighthouse image ${browserName} ${i}`,-400+i*100])).rows[0].id;tasks.push(task);
      const objectPath=`projects/${user.projectId}/tasks/${task}/${user.id}/legacy-${browserName}.png`;
      const filePath=path.join(storagePath,"guidon-attachments",objectPath);files.push(filePath);paths.push(objectPath);
      await mkdir(path.dirname(filePath),{recursive:true});await writeFile(filePath,source);
      await client.query("INSERT INTO task_attachments(task_id,name,storage_path,size_bytes,mime_type,uploaded_by) VALUES($1,'legacy.png',$2,$3,'image/png',$4)",[task,objectPath,source.length,user.id]);
    }
    const avatarPath=`${owner.id}/lighthouse-${browserName}.png`;
    const avatarFile=path.join(storagePath,"avatars",avatarPath);files.push(avatarFile);
    await mkdir(path.dirname(avatarFile),{recursive:true});await writeFile(avatarFile,source);
    const expires=Math.floor(Date.now()/1000)+3600;
    const signature=createHmac("sha256",authSecret).update(`avatars:${avatarPath}:${expires}:public`).digest("hex");
    const avatar="/api/storage?"+new URLSearchParams({bucket:"avatars",path:avatarPath,expires:String(expires),signature,public:"1"});
    await client.query("UPDATE profiles SET avatar_url=$2 WHERE id=$1",[owner.id,avatar]);
    await page.goto(`${origin}/projects/${owner.projectId}/work`);
    const cover=page.locator(`[data-card-id="${tasks[0]}"] img`);
    assert.equal(await cover.getAttribute("loading"),"eager");assert.equal(await cover.getAttribute("fetchpriority"),"high");
    assert.equal(await page.locator(`[data-card-id="${tasks[1]}"] img`).getAttribute("loading"),"lazy");
    assert.equal(await page.locator('img[fetchpriority="high"]').count(),1,"Only one likely visible cover has elevated priority");
    const url=await cover.getAttribute("src");assert.ok(url.startsWith("/api/task-cover?"));
    const response=await page.request.get(origin+url);assert.equal(response.status(),200);
    assert.equal(response.headers()["cache-control"],"private, no-store");assert.equal(response.headers()["x-content-type-options"],"nosniff");
    const bytes=await response.body(),metadata=await sharp(bytes).metadata();
    assert.equal(metadata.format,"webp");assert.equal(metadata.width,520);assert.equal(metadata.height,224);assert.ok(bytes.length<source.length/4,"A legacy original is delivered at card size");
    assert.deepEqual(await readFile(files[0]),source,"Previewing never overwrites the original");
    assert.equal((await anonymous.get(origin+url)).status(),401,"A warm preview cache never skips authentication");
    assert.equal((await page.request.get(origin+"/api/task-cover?path="+encodeURIComponent(paths[3]))).status(),404,"Foreign attachment is hidden");
    assert.equal((await page.request.get(origin+"/api/task-cover?path=../private.png")).status(),400);
    const proxy=await anonymous.get(origin+"/_next/image?"+new URLSearchParams({url,w:"640",q:"75"}));
    assert.notEqual(proxy.status(),200,"Private previews cannot enter the public image optimizer");
    const avatarImage=page.locator('[data-sidebar="sidebar"] a[href="/profile"] img');await avatarImage.waitFor();
    const avatarSource=await avatarImage.getAttribute("src");assert.equal(avatarSource,avatar,"Signed local storage retains its working URL without relaxing Next's query restrictions");
    assert.equal((await anonymous.get(origin+avatarSource)).status(),200);
    await login(foreign);assert.equal((await page.request.get(origin+url)).status(),404,"Another signed-in user cannot read a cached preview");
    await login(owner);
    await client.query("DELETE FROM task_attachments WHERE task_id=$1",[tasks[0]]);
    assert.equal((await page.request.get(origin+url)).status(),404,"Deleting attachment metadata revokes cached preview access");
    const robots=await anonymous.get(origin+"/robots.txt"),body=await robots.text();
    for(const line of body.split(/\r?\n/).filter(line=>line.trim()&&!line.trim().startsWith("#")))assert.ok(/^(User-agent|Allow|Disallow|Sitemap):/i.test(line),"robots contains only standard directives");
    assert.ok(body.includes("Disallow: /projects"));assert.ok(robots.headers().link.includes('rel="ard"'));
    const skill=await anonymous.get(origin+"/.well-known/agent-skills/guidon-tasks/SKILL.md");
    assert.ok(skill.headers()["content-type"].includes('profile="urn:air:agent-skills"'));
    console.log(`pass ${browserName} private legacy covers, local avatar fallback, image priority and discovery headers`);
  } finally {
    await client.query("UPDATE profiles SET avatar_url=$2 WHERE id=$1",[owner.id,previous]);
    if(tasks.length)await client.query("DELETE FROM tasks WHERE id=ANY($1::uuid[])",[tasks]);
    for(const file of files)await rm(file,{force:true});
    await anonymous.dispose();
  }
}
