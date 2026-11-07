import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { MAX_IMPORT_TASKS } from "@/lib/work/task-import";

const RECEIPT_TTL_MS = 30 * 60_000;
const MAX_RECEIPT_LENGTH = 54_000;

function signature(payload: string): Buffer | null {
  const secret = process.env.AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return secret ? createHmac("sha256", secret).update(`guidon:task-import:v1:${payload}`).digest() : null;
}

export function createImportReceipt(projectId: string, userId: string, taskIds: string[]): string | null {
  if (!taskIds.length || taskIds.length > MAX_IMPORT_TASKS) return null;
  const payload = Buffer.from(JSON.stringify({ projectId, userId, taskIds, expiresAt: Date.now() + RECEIPT_TTL_MS })).toString("base64url");
  const mac = signature(payload);
  return mac ? `${payload}.${mac.toString("base64url")}` : null;
}

export function verifyImportReceipt(receipt: string, projectId: string, userId: string): string[] | null {
  if (typeof receipt !== "string" || receipt.length > MAX_RECEIPT_LENGTH) return null;
  const [payload, mac, extra] = receipt.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const expected = signature(payload);
  const provided = Buffer.from(mac, "base64url");
  if (!expected || expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.projectId !== projectId || data.userId !== userId || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now()) return null;
    if (!Array.isArray(data.taskIds) || !data.taskIds.length || data.taskIds.length > MAX_IMPORT_TASKS
      || !data.taskIds.every((id: unknown) => typeof id === "string")) return null;
    return data.taskIds;
  } catch {
    return null;
  }
}
