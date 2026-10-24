import assert from "node:assert/strict";
import path from "node:path";

async function login(page,origin,email,password){
  await page.goto(`${origin}/auth/login`);
  await page.locator("#email").fill(email);await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url=>url.pathname==="/dashboard");
  await page.getByRole("heading",{level:1}).waitFor();
}

export async function feedbackCoverage({page,context,origin,fixture,client,browserName,artifacts}){
  await page.goto(origin);
  await page.locator("[data-beta-badge]").first().waitFor();
  await login(page,origin,fixture.users[0].email,fixture.password);
  await page.locator("header [data-beta-badge]").waitFor();
  await page.setViewportSize({width:375,height:812});
  await page.getByRole("button",{name:"Toggle sidebar (Ctrl+B)",exact:true}).click();
  await page.getByRole("button",{name:"Send feedback",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Send feedback",exact:true});
  await dialog.waitFor();
  assert.equal(await dialog.getByRole("radio").count(),5);
  const send=dialog.getByRole("button",{name:"Send",exact:true});
  assert.ok(await send.isDisabled());
  const message=`E2E rated feedback ${browserName}`;
  await dialog.getByLabel("Your feedback",{exact:true}).fill(message);
  assert.ok(await send.isDisabled(),"An explicit rating is required");
  await dialog.getByRole("radio",{name:"1 out of 5",exact:true}).focus();
  await page.keyboard.press("ArrowRight");
  assert.ok(await dialog.getByRole("radio",{name:"2 out of 5",exact:true}).isChecked());
  const rating={chromium:1,firefox:3,webkit:5}[browserName];
  const choice=dialog.getByRole("radio",{name:`${rating} out of 5`,exact:true});
  await choice.locator("..").click();assert.ok(await choice.isChecked());
  assert.ok((await dialog.boundingBox()).width<=375);
  await page.screenshot({path:path.join(artifacts,`${browserName}-feedback-mobile.png`)});
  let intercepted=false;
  const inject=async route=>{
    const request=route.request();
    if(request.method()==="POST"&&request.headers()["next-action"]){
      const args=JSON.parse(request.postData());
      if(Array.isArray(args)&&args[0]===message){args[2]=0;intercepted=true;return route.continue({postData:JSON.stringify(args)});}
    }
    return route.continue();
  };
  await page.route(origin+"/dashboard",inject);
  try{
    await send.click();
    await dialog.getByRole("alert").filter({hasText:"Choose a rating from 1 to 5."}).waitFor();
    assert.ok(intercepted,"The invalid score must reach the actual Server Action");
  }finally{await page.unroute(origin+"/dashboard",inject);}
  await client.query("REVOKE INSERT ON public.feedback FROM authenticated");
  try{
    await send.click();
    await dialog.getByRole("alert").filter({hasText:"Failed to send feedback."}).waitFor();
    assert.equal(await dialog.getByLabel("Your feedback",{exact:true}).inputValue(),message);
    assert.ok(await choice.isChecked());
    assert.equal((await client.query("SELECT 1 FROM public.feedback WHERE message=$1",[message])).rowCount,0);
  }finally{await client.query("GRANT INSERT ON public.feedback TO authenticated");}
  await send.click();await dialog.waitFor({state:"hidden"});
  assert.deepEqual((await client.query("SELECT rating,page_url,user_id FROM public.feedback WHERE message=$1",[message])).rows,[{rating,page_url:"/dashboard",user_id:fixture.users[0].id}]);
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${origin}/admin/feedback`);
  await page.getByRole("heading",{name:"Feedback",exact:true}).waitFor();
  await page.getByText(message,{exact:true}).locator("..").getByText(`Rating: ${rating}/5`,{exact:true}).waitFor();
  await page.getByText("Legacy E2E feedback",{exact:true}).locator("..").getByText("No rating",{exact:true}).waitFor();
  await page.goto(`${origin}/auth/logout`);await page.waitForURL(url=>url.pathname==="/");
  await context.clearCookies();await login(page,origin,fixture.reader.email,fixture.password);
  await page.goto(`${origin}/admin/feedback`);await page.waitForURL(url=>url.pathname==="/dashboard");
  assert.equal((await page.locator("body").innerText()).includes(message),false);
  await page.goto(`${origin}/auth/logout`);await page.waitForURL(url=>url.pathname==="/");
}
