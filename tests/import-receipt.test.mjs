import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createImportReceipt, verifyImportReceipt } from "../src/lib/work/import-receipt.ts";

test("undo receipts are bound to the import, project, account, and expiry", t => {
  const originalSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "disposable-test-import-receipt-secret";
  t.after(() => {
    if (originalSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalSecret;
  });

  const now = t.mock.method(Date, "now", () => 1_000_000);
  const [projectId, userId, taskId, otherId] = Array.from({ length: 4 }, () => randomUUID());
  const receipt = createImportReceipt(projectId, userId, [taskId]);
  assert.ok(receipt);
  assert.deepEqual(verifyImportReceipt(receipt, projectId, userId), [taskId]);
  assert.equal(verifyImportReceipt(receipt, otherId, userId), null);
  assert.equal(verifyImportReceipt(receipt, projectId, otherId), null);

  const [payload, signature] = receipt.split(".");
  const forged = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  forged.taskIds = [otherId];
  const tampered = Buffer.from(JSON.stringify(forged)).toString("base64url");
  assert.equal(verifyImportReceipt(`${tampered}.${signature}`, projectId, userId), null);
  assert.equal(verifyImportReceipt([taskId], projectId, userId), null);

  now.mock.mockImplementation(() => 1_000_000 + 30 * 60_000);
  assert.equal(verifyImportReceipt(receipt, projectId, userId), null);
});
