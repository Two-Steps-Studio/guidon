CREATE INDEX platform_admin_profiles_email_idx ON public.profiles (lower(email));
CREATE INDEX platform_admin_profiles_domain_idx ON public.profiles (lower(split_part(email, '@', 2)), id);
CREATE INDEX platform_admin_profiles_name_idx ON public.profiles (lower(full_name) text_pattern_ops);
CREATE INDEX platform_admin_stripe_customer_idx ON public.subscriptions (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX platform_admin_stripe_subscription_idx ON public.subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

CREATE FUNCTION public.platform_admin_search_profiles(p_kind text, p_term text, p_after uuid)
RETURNS TABLE(id uuid, created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT matches.id, matches.created_at FROM (
    SELECT p.id, p.created_at FROM public.profiles p WHERE p_kind = 'email' AND lower(p.email) = lower(p_term)
    UNION ALL
    SELECT p.id, p.created_at FROM public.profiles p WHERE p_kind = 'domain' AND lower(split_part(p.email, '@', 2)) = lower(p_term)
    UNION ALL
    SELECT p.id, p.created_at FROM public.profiles p WHERE p_kind = 'name' AND lower(p.full_name) LIKE lower(p_term) || '%'
    UNION ALL
    SELECT p.id, p.created_at FROM public.profiles p
    WHERE p_kind = 'stripe' AND EXISTS (
      SELECT 1 FROM public.organization_members m
      JOIN public.subscriptions s ON s.organization_id = m.organization_id
      WHERE m.user_id = p.id AND m.role = 'owner'
        AND (s.stripe_customer_id = p_term OR s.stripe_subscription_id = p_term)
    )
  ) matches
  WHERE p_after IS NULL OR matches.id > p_after
  ORDER BY matches.id
  LIMIT 26;
$$;

REVOKE ALL ON FUNCTION public.platform_admin_search_profiles(text, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_admin_search_profiles(text, text, uuid) TO service_role;
