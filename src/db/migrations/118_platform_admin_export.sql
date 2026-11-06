CREATE FUNCTION public.platform_admin_export_tag(p_tag text)
RETURNS TABLE(id uuid, created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT p.id, p.created_at FROM public.platform_admin_user_tags t
  JOIN public.profiles p ON p.id = t.user_id
  WHERE t.tag = p_tag ORDER BY t.user_id LIMIT 501;
$$;
REVOKE ALL ON FUNCTION public.platform_admin_export_tag(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_admin_export_tag(text) TO service_role;
