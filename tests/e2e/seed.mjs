import { randomBytes, scryptSync } from "node:crypto";

export async function seedReleaseFixture(client) {
  const password = `E2e-${randomBytes(12).toString("hex")}!`;
  const users=[];
  for(const label of ["alpha","beta"]){
    const salt=randomBytes(16);
    const hash=`scrypt:${salt.toString("hex")}:${scryptSync(password,salt,64).toString("hex")}`;
    const user=(await client.query("INSERT INTO auth.users(email,encrypted_password,email_confirmed_at,raw_user_meta_data) VALUES($1,$2,now(),$3::jsonb) RETURNING id",[`${label}@guidon.example.test`,hash,JSON.stringify({full_name:`E2E ${label}`})])).rows[0];
    await client.query("BEGIN");
    try{
      await client.query("SET LOCAL ROLE authenticated");
      await client.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user.id,role:"authenticated"})]);
      const org=(await client.query("INSERT INTO public.organizations(name,slug) VALUES($1,$2) RETURNING id",[`E2E ${label}`,`e2e-${label}`])).rows[0];
      const project=(await client.query("INSERT INTO public.projects(organization_id,name,visibility) VALUES($1,$2,'private') RETURNING id",[org.id,`PRIVATE-${label.toUpperCase()}-ONLY`])).rows[0];
      await client.query("COMMIT");
      users.push({id:user.id,email:`${label}@guidon.example.test`,organizationId:org.id,projectId:project.id,projectName:`PRIVATE-${label.toUpperCase()}-ONLY`});
    }catch(error){await client.query("ROLLBACK");throw error;}
  }
  const salt=randomBytes(16);
  const hash=`scrypt:${salt.toString("hex")}:${scryptSync(password,salt,64).toString("hex")}`;
  const reader=(await client.query("INSERT INTO auth.users(email,encrypted_password,email_confirmed_at,raw_user_meta_data) VALUES($1,$2,now(),$3::jsonb) RETURNING id",["viewer@guidon.example.test",hash,JSON.stringify({full_name:"E2E viewer"})])).rows[0];
  await client.query("INSERT INTO public.organization_members(organization_id,user_id,role) VALUES($1,$2,'member')",[users[0].organizationId,reader.id]);
  await client.query("INSERT INTO public.project_members(project_id,user_id,role) VALUES($1,$2,'viewer')",[users[0].projectId,reader.id]);
  return {users,password,reader:{id:reader.id,email:"viewer@guidon.example.test"}};
}
