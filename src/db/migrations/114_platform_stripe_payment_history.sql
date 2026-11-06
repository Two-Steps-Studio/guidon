ALTER TABLE public.platform_stripe_invoices ADD COLUMN payment_history jsonb
  CHECK (payment_history IS NULL OR jsonb_typeof(payment_history) = 'array');

CREATE FUNCTION public.platform_stripe_save_invoice_history(p_invoice jsonb, p_payments jsonb)
RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$
  SELECT public.platform_stripe_save_invoice(p_invoice);
  UPDATE public.platform_stripe_invoices
  SET payment_history = p_payments
  WHERE invoice_id = p_invoice->>'invoice_id'
    AND organization_id = (p_invoice->>'organization_id')::uuid
    AND observed_at = (p_invoice->>'observed_at')::timestamptz;
$$;

REVOKE ALL ON FUNCTION public.platform_stripe_save_invoice_history(jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_stripe_save_invoice_history(jsonb, jsonb) TO service_role;
