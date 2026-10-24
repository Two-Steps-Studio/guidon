import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import {isolatedEnvironment,assertDisposablePath,allowBrowserRequest} from "./isolation.mjs";

const env=isolatedEnvironment({PATH:"safe",DATABASE_URL:"production",AUTH_SECRET:"secret",STRIPE_SECRET_KEY:"live",SUPABASE_SERVICE_ROLE_KEY:"secret",AI_API_KEY:"secret",RESEND_API_KEY:"secret",NODE_OPTIONS:"--require unsafe"},{DATABASE_URL:"isolated",AUTH_SECRET:"ephemeral"});
assert.equal(env.DATABASE_URL,"isolated");assert.equal(env.AUTH_SECRET,"ephemeral");
for(const key of ["STRIPE_SECRET_KEY","SUPABASE_SERVICE_ROLE_KEY","AI_API_KEY","RESEND_API_KEY","NODE_OPTIONS"])assert.equal(env[key],undefined);
assert.equal(assertDisposablePath(path.join(os.tmpdir(),"guidon-e2e-random")),path.join(os.tmpdir(),"guidon-e2e-random"));
assert.throws(()=>assertDisposablePath(os.tmpdir()));
assert.throws(()=>assertDisposablePath(path.resolve(".")));
assert.equal(allowBrowserRequest("https://127.0.0.1:1234/dashboard","https://127.0.0.1:1234"),true);
assert.equal(allowBrowserRequest("https://useguidon.com/dashboard","https://127.0.0.1:1234"),false);
assert.equal(allowBrowserRequest("https://example.supabase.co/rest/v1/projects","https://127.0.0.1:1234"),false);
console.log("pass E2E environment, target and cleanup safety guards");
