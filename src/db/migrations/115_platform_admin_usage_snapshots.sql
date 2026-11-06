CREATE TABLE public.platform_admin_usage_snapshots (
  day date PRIMARY KEY,
  dau bigint NOT NULL,
  wau bigint NOT NULL,
  mau bigint NOT NULL
);

ALTER TABLE public.platform_admin_usage_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admin_usage_snapshots FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.platform_admin_usage_snapshots TO service_role;

CREATE FUNCTION public.platform_admin_refresh_usage()
RETURNS date
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$
  WITH boundary AS (
    SELECT date_trunc('day', timezone('UTC', now())) AT TIME ZONE 'UTC' AS upper_bound
  )
  INSERT INTO public.platform_admin_usage_snapshots (day, dau, wau, mau)
  SELECT
    timezone('UTC', boundary.upper_bound)::date - 1,
    count(DISTINCT activity.user_id) FILTER (WHERE activity.created_at >= boundary.upper_bound - interval '24 hours'),
    count(DISTINCT activity.user_id) FILTER (WHERE activity.created_at >= boundary.upper_bound - interval '168 hours'),
    count(DISTINCT activity.user_id)
  FROM boundary
  LEFT JOIN public.activity_logs activity ON activity.created_at >= boundary.upper_bound - interval '720 hours'
    AND activity.created_at < boundary.upper_bound AND activity.user_id IS NOT NULL
    AND activity.actor_label IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.ai_accounts bot WHERE bot.user_id = activity.user_id)
  GROUP BY boundary.upper_bound
  ON CONFLICT (day) DO UPDATE SET dau = excluded.dau, wau = excluded.wau, mau = excluded.mau
  RETURNING day;
$$;

REVOKE ALL ON FUNCTION public.platform_admin_refresh_usage() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_admin_refresh_usage() TO service_role;
