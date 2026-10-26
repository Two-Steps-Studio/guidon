"use server";

import { revalidatePath } from "next/cache";
import { canManageOrg, getOrgAccess } from "@/lib/data/org-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import {
  MAX_WEBHOOKS_PER_ORGANIZATION,
  createOrganizationWebhook,
  deleteOrganizationWebhook,
  getWebhookTarget,
  listOrganizationWebhooks,
  recordWebhookDelivery,
  setOrganizationWebhookEnabled,
} from "@/lib/data/organization-webhooks";
import { deliverWebhook } from "@/lib/webhooks/dispatch";
import { retryDelivery } from "@/lib/webhooks/deliveries";
import { dataClient } from "@/lib/data-client";
import { isWebhookEventType } from "@/lib/webhooks/events";
import { checkWebhookUrl } from "@/lib/webhooks/security";
import { tr } from "@/lib/i18n/server-errors";

export type CreateWebhookState = { error: string | null; secret: string | null };

const NO_PERMISSION = "Only organization owners and admins can manage webhooks.";

// Mirrors organization_webhooks' RLS (050): owner/admin only. Checked here
// too for a readable error - RLS is what actually enforces it.
async function managerAccess(organizationId: string) {
  const access = await getOrgAccess(organizationId);
  return access && canManageOrg(access.role) ? access : null;
}

export async function createWebhook(
  organizationId: string,
  _prevState: CreateWebhookState,
  formData: FormData
): Promise<CreateWebhookState> {
  const access = await managerAccess(organizationId);
  if (!access) return { error: NO_PERMISSION, secret: null };

  const rawUrl = formData.get("url");
  const rawDescription = formData.get("description");
  const events = formData.getAll("events").filter(isWebhookEventType);

  if (typeof rawUrl !== "string" || !rawUrl.trim()) return { error: await tr("URL is required."), secret: null };
  const description = typeof rawDescription === "string" && rawDescription.trim() ? rawDescription.trim() : null;
  if (description && description.length > 200) {
    return { error: await tr("Description can be at most 200 characters."), secret: null };
  }
  if (events.length === 0) return { error: await tr("Choose at least one event."), secret: null };

  const urlCheck = await checkWebhookUrl(rawUrl.trim(), { allowPrivate: hasDirectDatabase() });
  if (!urlCheck.ok) return { error: urlCheck.reason, secret: null };

  try {
    const existing = await listOrganizationWebhooks(organizationId, access.userId);
    if (existing.length >= MAX_WEBHOOKS_PER_ORGANIZATION) {
      return { error: `An organization can have at most ${MAX_WEBHOOKS_PER_ORGANIZATION} webhooks.`, secret: null };
    }
    const { secret } = await createOrganizationWebhook({
      organizationId,
      userId: access.userId,
      url: urlCheck.url.toString(),
      description,
      events: [...new Set(events)],
    });
    revalidatePath(`/organizations/${organizationId}/settings`);
    return { error: null, secret };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to save webhook.", secret: null };
  }
}

export async function setWebhookEnabled(
  organizationId: string,
  webhookId: string,
  enabled: boolean
): Promise<{ error: string | null }> {
  const access = await managerAccess(organizationId);
  if (!access) return { error: NO_PERMISSION };

  try {
    const updated = await setOrganizationWebhookEnabled(organizationId, access.userId, webhookId, enabled);
    if (!updated) return { error: await tr("Webhook not found.") };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to update webhook." };
  }
  revalidatePath(`/organizations/${organizationId}/settings`);
  return { error: null };
}

export async function deleteWebhook(organizationId: string, webhookId: string): Promise<{ error: string | null }> {
  const access = await managerAccess(organizationId);
  if (!access) return { error: NO_PERMISSION };

  try {
    const deleted = await deleteOrganizationWebhook(organizationId, access.userId, webhookId);
    if (!deleted) return { error: await tr("Webhook not found.") };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to delete webhook." };
  }
  revalidatePath(`/organizations/${organizationId}/settings`);
  return { error: null };
}

/** Sends a signed `ping` right away and reports how the receiver answered. */
export async function sendTestWebhook(
  organizationId: string,
  webhookId: string
): Promise<{ error: string | null; status: number | null }> {
  const access = await managerAccess(organizationId);
  if (!access) return { error: NO_PERMISSION, status: null };

  // Service-role read (the secret isn't readable as a user), scoped to the
  // organization the caller was just confirmed to manage.
  const target = await getWebhookTarget(organizationId, webhookId);
  if (!target) return { error: await tr("Webhook not found."), status: null };

  const outcome = await deliverWebhook(target, "ping", {
    organization_id: organizationId,
    actor_id: access.userId,
    data: { webhook_id: webhookId },
  });
  await recordWebhookDelivery(webhookId, outcome);
  revalidatePath(`/organizations/${organizationId}/settings`);
  return outcome;
}

export interface WebhookDeliveryView {
  id: string;
  event_type: string;
  status: "pending" | "succeeded" | "failed";
  attempts: number;
  next_attempt_at: string | null;
  last_status: number | null;
  last_error: string | null;
  created_at: string;
}

/** The webhook's latest deliveries (migration 089), read under RLS: owner/admin only. */
export async function listWebhookDeliveries(
  organizationId: string,
  webhookId: string
): Promise<{ deliveries: WebhookDeliveryView[]; error: string | null }> {
  const access = await managerAccess(organizationId);
  if (!access) return { deliveries: [], error: NO_PERMISSION };
  const { data, error } = await dataClient(access.userId)
    .from<WebhookDeliveryView>("organization_webhook_deliveries")
    .select("id, event_type, status, attempts, next_attempt_at, last_status, last_error, created_at")
    .eq("organization_id", organizationId)
    .eq("webhook_id", webhookId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return { deliveries: [], error: await tr("Could not load the delivery history.") };
  const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null);
  return {
    deliveries: data.map((row) => ({ ...row, created_at: iso(row.created_at)!, next_attempt_at: iso(row.next_attempt_at) })),
    error: null,
  };
}

/** Sends a delivery again right away ("Retry" in the history). */
export async function retryWebhookDelivery(organizationId: string, deliveryId: string): Promise<{ error: string | null }> {
  const access = await managerAccess(organizationId);
  if (!access) return { error: NO_PERMISSION };
  const result = await retryDelivery(organizationId, deliveryId);
  if (result.error === "not_found") return { error: await tr("Webhook not found.") };
  if (result.error === "already_delivered") return { error: await tr("This delivery already succeeded.") };
  if (result.error === "too_many_attempts") return { error: await tr("This delivery was tried too many times.") };
  if (result.error === "disabled") return { error: await tr("Turn the webhook on to retry its deliveries.") };
  revalidatePath(`/organizations/${organizationId}/settings`);
  return { error: null };
}
