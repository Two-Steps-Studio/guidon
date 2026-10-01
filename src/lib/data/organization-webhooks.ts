import "server-only";

import { dataClient, serviceDataClient } from "@/lib/data-client";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import type { WebhookEventType } from "@/lib/webhooks/events";
import { generateWebhookSecret } from "@/lib/webhooks/security";

const WEBHOOK_SECRET_KEY_INFO = "org-webhook-secret-v1";

export const MAX_WEBHOOKS_PER_ORGANIZATION = 10;

/** Everything except the secret - safe to pass to a client component. */
export interface OrganizationWebhook {
  id: string;
  url: string;
  description: string | null;
  events: WebhookEventType[];
  enabled: boolean;
  last_delivery_at: string | null;
  last_status: number | null;
  last_error: string | null;
  created_at: string;
}

/** Matches the column-scoped GRANT SELECT in 050 - secret_encrypted is not readable as a user. */
const SAFE_COLUMNS = "id, url, description, events, enabled, last_delivery_at, last_status, last_error, created_at";

/** RLS (050) shows these only to the organization's owners/admins; anyone else gets an empty list. */
export async function listOrganizationWebhooks(organizationId: string, userId: string): Promise<OrganizationWebhook[]> {
  const { data, error } = await dataClient(userId)
    .from<OrganizationWebhook>("organization_webhooks")
    .select(SAFE_COLUMNS)
    .eq("organization_id", organizationId)
    .order("created_at");
  if (error) throw new Error(`Failed to load webhooks: ${error.message}`);
  return data;
}

/** Returns the plaintext signing secret - the only time it ever leaves the server. */
export async function createOrganizationWebhook(input: {
  organizationId: string;
  userId: string;
  url: string;
  description: string | null;
  events: WebhookEventType[];
}): Promise<{ id: string; secret: string }> {
  const secret = generateWebhookSecret();
  const { data, error } = await dataClient(input.userId)
    .from<{ id: string }>("organization_webhooks")
    .insert({
      organization_id: input.organizationId,
      url: input.url,
      description: input.description,
      events: input.events,
      secret_encrypted: encryptSecret(secret, WEBHOOK_SECRET_KEY_INFO),
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to save webhook: ${error?.message ?? "no row returned"}`);
  return { id: data.id, secret };
}

/** False when no row matched - wrong organization, or RLS refused it. */
export async function setOrganizationWebhookEnabled(
  organizationId: string,
  userId: string,
  webhookId: string,
  enabled: boolean
): Promise<boolean> {
  const { data, error } = await dataClient(userId)
    .from("organization_webhooks")
    .update({ enabled })
    .eq("id", webhookId)
    .eq("organization_id", organizationId)
    .select("id");
  if (error) throw new Error(`Failed to update webhook: ${error.message}`);
  return data.length > 0;
}

/** False when no row matched - wrong organization, or RLS refused it. */
export async function deleteOrganizationWebhook(organizationId: string, userId: string, webhookId: string): Promise<boolean> {
  const { data, error } = await dataClient(userId)
    .from("organization_webhooks")
    .delete()
    .eq("id", webhookId)
    .eq("organization_id", organizationId)
    .select("id");
  if (error) throw new Error(`Failed to delete webhook: ${error.message}`);
  return data.length > 0;
}

export interface WebhookTarget {
  id: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
}

interface TargetRow {
  id: string;
  url: string;
  events: WebhookEventType[];
  secret_encrypted: string;
}

function toTarget(row: TargetRow): WebhookTarget {
  return { id: row.id, url: row.url, events: row.events, secret: decryptSecret(row.secret_encrypted, WEBHOOK_SECRET_KEY_INFO) };
}

/**
 * Service role: an event is triggered by any project member with write
 * access, who can't see these rows under RLS - only owners/admins can. The
 * caller has already been authorized for the task mutation that produced
 * the event; this only reads where to send it.
 */
export async function getWebhookTargetsForProject(
  projectId: string
): Promise<{ organizationId: string; projectName: string; targets: WebhookTarget[] } | null> {
  const service = serviceDataClient();
  const { data: project } = await service
    .from<{ organization_id: string; name: string }>("projects")
    .select("organization_id, name")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;
  const { data: hooks, error } = await service
    .from<TargetRow>("organization_webhooks")
    .select("id, url, events, secret_encrypted")
    .eq("organization_id", project.organization_id)
    .eq("enabled", true);
  if (error) throw new Error(`Failed to load webhooks: ${error.message}`);
  return { organizationId: project.organization_id, projectName: project.name, targets: hooks.map(toTarget) };
}

/** Service role, for "Send test" - the action has already confirmed the caller can see this webhook. */
export async function getWebhookTarget(organizationId: string, webhookId: string): Promise<WebhookTarget | null> {
  const { data } = await serviceDataClient()
    .from<TargetRow>("organization_webhooks")
    .select("id, url, events, secret_encrypted")
    .eq("id", webhookId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data ? toTarget(data) : null;
}

/** Service role: last_* aren't in 050's user GRANT UPDATE list - only delivery writes them. */
export async function recordWebhookDelivery(
  webhookId: string,
  outcome: { status: number | null; error: string | null }
): Promise<void> {
  await serviceDataClient()
    .from("organization_webhooks")
    .update({
      last_delivery_at: new Date().toISOString(),
      last_status: outcome.status,
      last_error: outcome.error ? outcome.error.slice(0, 300) : null,
    })
    .eq("id", webhookId);
}
