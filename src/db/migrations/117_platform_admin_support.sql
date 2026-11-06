CREATE TABLE public.platform_admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_admin_notes_user_idx ON public.platform_admin_notes (user_id, pinned DESC, created_at DESC);

CREATE TABLE public.platform_admin_user_tags (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tag text NOT NULL CHECK (tag ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  PRIMARY KEY (user_id, tag)
);
CREATE INDEX platform_admin_user_tags_lookup_idx ON public.platform_admin_user_tags (tag, user_id);

ALTER TABLE public.platform_admin_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_user_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admin_notes, public.platform_admin_user_tags FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE (pinned) ON public.platform_admin_notes TO service_role;
GRANT SELECT, INSERT, DELETE ON public.platform_admin_user_tags TO service_role;

CREATE FUNCTION public.platform_admin_search_tag(p_tag text, p_after uuid)
RETURNS TABLE(id uuid, created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT p.id, p.created_at
  FROM public.platform_admin_user_tags t JOIN public.profiles p ON p.id = t.user_id
  WHERE t.tag = p_tag AND (p_after IS NULL OR t.user_id > p_after)
  ORDER BY t.user_id LIMIT 26;
$$;
REVOKE ALL ON FUNCTION public.platform_admin_search_tag(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_admin_search_tag(text, uuid) TO service_role;
