import assert from "node:assert/strict";
import { attachmentImageMime, attachmentToolResult, MAX_INLINE_ATTACHMENT_BYTES } from "../src/lib/mcp/http/attachment-content.ts";

const uri="guidon://projects/p/tasks/t/attachments/a";
const png=Buffer.from("89504e470d0a1a0a","hex");
assert.equal(attachmentImageMime(png),"image/png");
assert.equal(attachmentImageMime(Buffer.from([255,216,255,0])),"image/jpeg");
assert.equal(attachmentImageMime(Buffer.from("GIF89a")),"image/gif");
assert.equal(attachmentImageMime(Buffer.from("RIFF0000WEBP")),"image/webp");
assert.equal(attachmentImageMime(Buffer.from("<svg onload='run()'/>")),null);
assert.equal(attachmentToolResult(png,"text/html",uri).content[0].type,"image","Image content uses actual signature, not declared MIME");
const svg=attachmentToolResult(Buffer.from("<svg onload='run()'/>"),"image/svg+xml",uri).content[0];
assert.equal(svg.type,"resource");assert.ok(svg.resource.blob,"Unsupported active image formats stay binary/inert");
assert.equal(attachmentToolResult(Buffer.from("hello"),"text/plain",uri).content[0].resource.text,"hello");
assert.ok(attachmentToolResult(Buffer.from([255,254,0]),"text/plain",uri).content[0].resource.blob,"Invalid UTF-8 cannot masquerade as plain text");
assert.ok(attachmentToolResult(Buffer.from("a\0b"),"text/plain",uri).content[0].resource.blob);
assert.ok(attachmentToolResult(Buffer.from("%PDF-1.7"),"application/pdf",uri).content[0].resource.blob);
assert.equal(attachmentToolResult(Buffer.alloc(MAX_INLINE_ATTACHMENT_BYTES+1),"image/png",uri).isError,true);
console.log("pass attachment image signatures, inert document resources, invalid text and response-size limit");
