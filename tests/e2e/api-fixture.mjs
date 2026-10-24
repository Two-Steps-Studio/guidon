import { randomBytes, createHash } from "node:crypto";

export async function seedApiFixture(client, fixture) {
  const [owner, foreign] = fixture.users;
  const tasks=[];
  for(const user of [owner,foreign]){
    const task=(await client.query("INSERT INTO public.tasks(project_id,title,created_by) VALUES($1,$2,$3) RETURNING id,title",[user.projectId,`PRIVATE-TASK-${user.email.split("@")[0]}`,user.id])).rows[0];
    tasks.push(task);
  }
  const keys={};
  const configurations={
    owner:{user:owner.id,scopes:["tasks:read","tasks:write","project:read"]},
    foreign:{user:foreign.id,scopes:["tasks:read","tasks:write","project:read"]},
    read:{user:owner.id,scopes:["tasks:read","project:read"]},
    viewer:{user:fixture.reader.id,scopes:["tasks:read","tasks:write","project:read"]},
    revoked:{user:owner.id,scopes:["tasks:read"],revoked:true},
    expired:{user:owner.id,scopes:["tasks:read"],expired:true},
    report:{user:owner.id,scopes:["reports:write"],project:owner.projectId},
    origin:{user:owner.id,scopes:["tasks:read"],origins:["https://allowed.example.test"]},
    rate:{user:owner.id,scopes:["tasks:read","project:read"]},
  };
  for(const [name,config] of Object.entries(configurations)){
    const raw=`guidon_${randomBytes(32).toString("base64url")}`;
    await client.query("INSERT INTO public.api_keys(user_id,name,key_prefix,key_hash,scopes,human_client,revoked_at,expires_at,project_id,allowed_origins) VALUES($1,$2,$3,$4,$5,true,$6,$7,$8,$9)",[
      config.user,`E2E ${name}`,raw.slice(0,12),createHash("sha256").update(raw).digest("hex"),config.scopes,
      config.revoked?new Date():null,config.expired?new Date(Date.now()-60000):null,config.project??null,config.origins??null,
    ]);
    keys[name]=raw;
  }
  return {tasks,keys};
}
