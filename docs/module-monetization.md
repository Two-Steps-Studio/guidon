# Paid modules - design (not active)

Status: **design only**. Nothing in this repository charges for modules,
stores prices, or pays authors. Turning any of it on needs:

- a payment account owned by an adult (the operator, a parent or guardian, or
  their company);
- that provider's sandbox account for testing;
- separate approval for production.

## Constraints that shape the design

1. **Who can sell.** A merchant of record (Paddle, already named in the terms
   and the refund policy) sells *the operator's own* software. It handles VAT,
   sales tax, invoices and chargebacks. Paying a share to third-party authors
   is a marketplace model: check with the provider before relying on it. Most
   merchants of record don't offer it. Stripe Connect does, but then the
   operator owns tax and KYC for payouts.
2. **No silent lock-out.** A project that stops paying keeps its data. The
   module becomes read-only, and its entries can be exported, exactly as on
   uninstall (`module-lifecycle.md`).
3. **Code is not the product.** Manifests (and scripts) are readable by anyone
   who installs them. What is sold is the right to install and update a
   listing, not secrecy.

## Phases

| Phase | What | Payments |
|---|---|---|
| 0 (now) | Free modules only | none |
| 1 | **Guidon's own paid modules**, unlocked by the organization's plan (an entitlement next to the plan limits in `src/lib/limits`) | existing plan billing through the merchant of record; no per-module checkout |
| 2 | Per-module one-time or subscription purchase of Guidon's own modules | merchant-of-record checkout, webhook → entitlement |
| 3 | Third-party paid modules with revenue share | only with a provider that supports payouts (e.g. Stripe Connect Express) and an adult-operated company; separate legal review |

## Data model (future migration, sketched)

- `module_prices(module_id, kind 'one_time'|'subscription', currency, amount_minor, provider_price_id, active)`.
  Only the registry owner (service role) can write it. Prices are listing-level,
  not version-level, so a version stays immutable.
- `module_entitlements(organization_id, module_id, source 'plan'|'purchase'|'grant', status 'active'|'grace'|'ended', provider_subscription_id, current_period_end)`
  - written only by the payment webhook (service role, signature-checked,
    idempotent on the provider event id);
  - readable by the organization's members under RLS.
- `install_module_version` checks the entitlement in the same transaction as
  the install. Updates check it too. Running an installed module checks it on
  write only: reads always work.
- `module_registry_events` gets the actions `price_set`, `entitled`,
  `entitlement_ended` and `refunded`.

## Flows

- **Buy**:
  1. The Marketplace shows the price.
  2. An organization owner gets a checkout session from the merchant of record.
  3. The provider calls our webhook, which writes the entitlement.
  4. Install works as today.

  The permission consent screen is unchanged and separate from payment.
- **Refund**: follows `/legal/refunds` (first payment within 14 days). The
  refund webhook ends the entitlement; the module becomes read-only and
  exportable.
- **Failed renewal**: the same grace period as plans (`billing-core.ts`), then
  read-only.
- **Uninstall / reinstall**: the entitlement belongs to the organization, not
  the project. Reinstalling in another project of the same organization is
  free.

## Tests required before activation

- Sandbox webhooks are signature-checked, replayed and delivered out of order.
  Each event yields exactly one entitlement change.
- A forged webhook and a webhook for another organization are refused.
- No install without an entitlement, in the UI, REST, MCP and a direct RPC
  under RLS.
- Refund and failed payment → read-only; export still works.
- Prices and entitlements never reach logs. Card data never touches Guidon:
  the hosted checkout only.

## Open questions for the operator

- Merchant of record and account owner (adult).
- Whether phase 3 is wanted at all. It changes the legal and tax setup.
- Currency and price points; whether education/open-source modules stay free.
