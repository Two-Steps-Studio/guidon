/**
 * Stripe client for self-serve checkout/billing-portal on Guidon Cloud
 * (docs/superpowers/specs/2026-08-22-subscriptions-design.md deferred this
 * on purpose - schema and plan/limit enforcement shipped there, this file
 * is the "later phase" it left for once real Stripe credentials exist).
 *
 * Same "unset env var = fully inert" philosophy as AI_PROVIDER/SENTRY_DSN:
 * a self-hosted instance (or a hosted one that hasn't set up Stripe yet)
 * never constructs a client. Only ever call getStripe() behind
 * isBillingConfigured() - callers surface "billing isn't set up" as a
 * normal error, not a crash.
 *
 * SERVER ONLY - the secret key must never reach a client bundle.
 */
import "server-only";
import Stripe from "stripe";

export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

let cached: Stripe | null = null;

/** Throws if STRIPE_SECRET_KEY is unset - check isBillingConfigured() first. */
export function getStripe(): Stripe {
  if (cached) return cached;

  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set. See docs/configuration.md.");
  }

  // No pinned apiVersion: the SDK's own built-in default for this installed
  // version is a known-good pairing, and hand-typing a version string here
  // risks a typo that silently pins the wrong one.
  cached = new Stripe(key);
  return cached;
}
