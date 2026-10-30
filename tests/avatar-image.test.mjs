import assert from "node:assert/strict";
import { register } from "node:module";
// Next injects its image config into production client bundles; the actual
// optimizer enforces remotePatterns. This unit exercises only the URL builder.
process.env.NODE_ENV="production";
register('data:text/javascript,'+encodeURIComponent('export function resolve(s,c,n){return n(s==="next/image"?"next/image.js":s,c)}'),import.meta.url);
const { optimizedAvatarProps }=await import("../src/lib/avatar-image.ts");
const origin="https://avatars.example.test";
const result=optimizedAvatarProps(origin+"/storage/v1/object/public/avatars/user/photo.jpg",64,64,"",origin);
assert.ok(result.src.startsWith("/_next/image?"));assert.ok(result.srcSet.includes("128"));
for(const src of [origin+"/storage/v1/object/sign/guidon-attachments/private.jpg?token=private",origin+"/storage/v1/object/public/other/photo.jpg",origin+"/storage/v1/object/public/avatars/photo.jpg?token=private","https://other.example.test/storage/v1/object/public/avatars/photo.jpg","/api/storage?public=1",new Blob()])assert.equal(optimizedAvatarProps(src,64,64,"",origin),undefined);
assert.equal(optimizedAvatarProps(origin+"/storage/v1/object/public/avatars/photo.jpg",64,64,"",""),undefined);
console.log("pass owned public-avatar optimization and private/foreign/signed URL exclusions");
