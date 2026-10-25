"use server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/current-user";
import { decideAgentClaim } from "@/lib/oauth/agent-claims";
import { isClaimHandle } from "@/lib/oauth/agent-claims-core";

export async function submitAgentClaim(form: FormData) {
  const user = await getCurrentUser();
  const attempt = form.get("attempt");
  if (!isClaimHandle(attempt) || !attempt.startsWith("cat_")) redirect("/oauth/claim");
  const code = typeof form.get("code") === "string" ? String(form.get("code")) : "";
  const result = await decideAgentClaim(attempt, user, code, form.get("decision") === "allow");
  redirect(`/oauth/claim?attempt=${encodeURIComponent(attempt)}&result=${encodeURIComponent(result)}`);
}
