import assert from "node:assert/strict";
import test from "node:test";
import { readLimitedText } from "../src/lib/api/limited-text.ts";

const encoder = new TextEncoder();
const request = (body, headers) => new Request("http://fixture.invalid/", {
  method: "POST",
  body,
  headers,
  duplex: "half",
});

test("decodes a multibyte character split between chunks at the byte limit", async () => {
  const bytes = encoder.encode("żółw");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 1));
      controller.enqueue(bytes.slice(1));
      controller.close();
    },
  });
  assert.deepEqual(await readLimitedText(request(stream), bytes.length), { ok: true, text: "żółw" });
});

for (const headers of [undefined, { "content-length": "1" }]) {
  test(`caps a streaming upload with ${headers ? "an understated" : "no"} length header`, { timeout: 1000 }, async () => {
    let canceled = false;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("abc"));
        controller.enqueue(encoder.encode("def"));
        // A sender need not finish the upload or settle cancellation promptly.
      },
      cancel() {
        canceled = true;
        return new Promise(() => {});
      },
    });
    const req = request(stream, headers);
    assert.deepEqual(await readLimitedText(req, 5), { ok: false, status: 413 });
    assert.equal(canceled, true);
    assert.equal(req.body.locked, false);
  });
}

test("rejects a large declared length without consuming the body", async () => {
  const req = request("abc", { "content-length": "201" });
  assert.deepEqual(await readLimitedText(req, 200), { ok: false, status: 413 });
  assert.equal(req.bodyUsed, false);
});

test("maps a broken body stream to a bad request", async () => {
  const stream = new ReadableStream({
    start(controller) { controller.error(new Error("Connection closed")); },
  });
  assert.deepEqual(await readLimitedText(request(stream), 16), { ok: false, status: 400 });
});
