"use server";

import { revalidatePath } from "next/cache";
import {
  createAiAccount,
  createAiAccountKey,
  disableAiAccount,
  revokeAiAccountKey,
} from "@/lib/data/ai-accounts";

// Thin wrappers: the permission checks live in lib/data/ai-accounts.ts.

const refresh = (orgId: string) => {
  revalidatePath(`/organizations/${orgId}/ai-accounts`);
  revalidatePath(`/organizations/${orgId}/members`);
};

export async function createAiAccountAction(
  orgId: string,
  input: { name: string; description: string; projects: { projectId: string; role: string }[] }
) {
  const result = await createAiAccount(orgId, input);
  if (!result.error) refresh(orgId);
  return result;
}

export async function createAiAccountKeyAction(orgId: string, userId: string, name: string) {
  const result = await createAiAccountKey(orgId, userId, name);
  if (!result.error) refresh(orgId);
  return result;
}

export async function revokeAiAccountKeyAction(orgId: string, userId: string, keyId: string) {
  const result = await revokeAiAccountKey(orgId, userId, keyId);
  if (!result.error) refresh(orgId);
  return result;
}

export async function disableAiAccountAction(orgId: string, userId: string) {
  const result = await disableAiAccount(orgId, userId);
  if (!result.error) refresh(orgId);
  return result;
}
