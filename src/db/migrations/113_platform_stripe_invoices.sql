CREATE TABLE public.platform_stripe_invoices (
  invoice_id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_number text,
  status text NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  amount_due bigint NOT NULL,
  amount_paid bigint NOT NULL,
  amount_remaining bigint NOT NULL,
  attempt_count integer NOT NULL,
  invoice_pdf text,
  card_last4 text CHECK (card_last4 ~ '^[0-9]{4}$'),
  issued_at timestamptz NOT NULL,
  failed_at timestamptz,
  observed_at timestamptz NOT NULL
);

CREATE INDEX platform_stripe_invoices_issued_idx ON public.platform_stripe_invoices (issued_at DESC, invoice_id);
CREATE INDEX platform_stripe_invoices_org_idx ON public.platform_stripe_invoices (organization_id, issued_at DESC);
ALTER TABLE public.platform_stripe_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_stripe_invoices FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.platform_stripe_invoices TO service_role;

CREATE FUNCTION public.platform_stripe_save_invoice(p_invoice jsonb)
RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$
  INSERT INTO public.platform_stripe_invoices AS stored
  SELECT incoming.* FROM jsonb_populate_record(NULL::public.platform_stripe_invoices, p_invoice) AS incoming
  ON CONFLICT (invoice_id) DO UPDATE SET
    invoice_number = CASE WHEN excluded.observed_at >= stored.observed_at THEN excluded.invoice_number ELSE stored.invoice_number END,
    status = CASE WHEN excluded.observed_at >= stored.observed_at THEN excluded.status ELSE stored.status END,
    amount_due = CASE WHEN excluded.observed_at >= stored.observed_at THEN excluded.amount_due ELSE stored.amount_due END,
    amount_paid = CASE WHEN excluded.observed_at >= stored.observed_at THEN excluded.amount_paid ELSE stored.amount_paid END,
    amount_remaining = CASE WHEN excluded.observed_at >= stored.observed_at THEN excluded.amount_remaining ELSE stored.amount_remaining END,
    attempt_count = greatest(stored.attempt_count, excluded.attempt_count),
    invoice_pdf = CASE WHEN excluded.observed_at >= stored.observed_at THEN excluded.invoice_pdf ELSE stored.invoice_pdf END,
    card_last4 = CASE WHEN excluded.observed_at >= stored.observed_at THEN excluded.card_last4 ELSE stored.card_last4 END,
    failed_at = greatest(stored.failed_at, excluded.failed_at),
    observed_at = greatest(stored.observed_at, excluded.observed_at)
  WHERE stored.organization_id = excluded.organization_id;
$$;

REVOKE ALL ON FUNCTION public.platform_stripe_save_invoice(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_stripe_save_invoice(jsonb) TO service_role;
