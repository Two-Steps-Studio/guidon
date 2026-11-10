/**
 * S3 request signing (src/lib/storage/s3-sigv4.ts), offline.
 * Run: npm run test:s3
 *
 * The expected signatures are AWS's own worked examples from "Signature
 * Version 4: Authenticating Requests (AWS Signature Version 4)" in the S3 API
 * reference - if these match, any S3-compatible store accepts our requests.
 */
import { encode, sha256, signRequest } from "../../src/lib/storage/s3-sigv4.ts";

let failed = 0;
function check(name, ok) {
  console.log(`    ${ok ? "pass" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}

const creds = { region: "us-east-1", accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" };
const at = new Date("2013-05-24T00:00:00Z");
const EMPTY = sha256("");
const signatureOf = (headers) => /Signature=([0-9a-f]+)/.exec(headers.authorization)?.[1];

console.log("\n  AWS SigV4 examples");
const get = signRequest(creds, { method: "GET", url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"), payloadHash: EMPTY, headers: { Range: "bytes=0-9" } }, at);
check("GET object", signatureOf(get) === "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
check("signed headers listed", get.authorization.includes("SignedHeaders=host;range;x-amz-content-sha256;x-amz-date"));
check("date header", get["x-amz-date"] === "20130524T000000Z");

const body = "Welcome to Amazon S3.";
const put = signRequest(creds, {
  method: "PUT",
  url: new URL(`https://examplebucket.s3.amazonaws.com/${encode("test$file.text")}`),
  payloadHash: sha256(body),
  headers: { Date: "Fri, 24 May 2013 00:00:00 GMT", "x-amz-storage-class": "REDUCED_REDUNDANCY" },
}, at);
check("PUT object", signatureOf(put) === "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd");

const list = new URL("https://examplebucket.s3.amazonaws.com/");
list.searchParams.set("max-keys", "2");
list.searchParams.set("prefix", "J");
check("GET bucket (list)", signatureOf(signRequest(creds, { method: "GET", url: list, payloadHash: EMPTY }, at)) === "34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7");

console.log("\n  encoding");
check("RFC 3986: !'()* are escaped", encode("a!'()*b") === "a%21%27%28%29%2Ab");
check("spaces are %20", encode("a b") === "a%20b");

console.log(`\n  ${failed ? `${failed} failed` : "all passed"}`);
process.exit(failed ? 1 : 0);
