-- ============================================================
-- GUIDON - MIGRACJA 091
-- Zaproszenia do organizacji mailem: link, podgląd, akceptacja
-- ============================================================
--
-- Uruchomić PO 090.
--
-- public.invitations (001) istniała, ale aplikacja jej nie używała - dodać
-- dało się tylko kogoś, kto już ma konto. Teraz "Dodaj członka" dla adresu
-- bez konta tworzy zaproszenie i wysyła link /invite/<token>.
--
-- - Token w bazie tylko jako SHA-256 (token_hash, dawniej token): link
--   zna tylko adresat (i osoba, która zapraszała - widzi go raz, po
--   utworzeniu). Wyciek tabeli albo odczyt przez managera nie daje linku.
--   Wcześniejsze wiersze (nieużywane) przestają działać.
-- - Jedno oczekujące zaproszenie na adres w danej organizacji/projekcie.
-- - Owner/admin widzi zaproszenia swojej organizacji/projektu
--   (invitations_manager_select) i może je usunąć (invitations_manager_
--   delete, 001). UPDATE dalej nie ma nikt poza service role (017).
-- - public.invitation_preview(token) i public.accept_invitation(token) są
--   SECURITY DEFINER: token jest dowodem, że adresat dostał link. Akceptuje
--   tylko zalogowany użytkownik, którego adres jest adresem zaproszenia
--   (przekazany dalej link nie wpuści nikogo innego), tylko oczekujące i
--   nieprzeterminowane zaproszenie, jeden raz.
-- ============================================================

BEGIN;


ALTER TABLE public.invitations RENAME COLUMN token TO token_hash;

-- Rows made before this migration held a plain token; none was ever
-- issued by the app. Retire them rather than keep a plaintext secret.
UPDATE public.invitations
SET status = 'cancelled'
WHERE status = 'pending';

ALTER TABLE public.invitations
    ADD CONSTRAINT invitations_token_hash_shape CHECK (token_hash ~ '^[0-9a-f]{64}$') NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS invitations_one_pending_per_email
    ON public.invitations (COALESCE(organization_id, project_id), lower(email))
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS invitations_organization ON public.invitations (organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invitations_project ON public.invitations (project_id) WHERE project_id IS NOT NULL;

DROP POLICY IF EXISTS invitations_manager_select ON public.invitations;
CREATE POLICY invitations_manager_select
ON public.invitations
FOR SELECT
TO authenticated
USING (
    (organization_id IS NOT NULL AND private.org_role(organization_id) IN ('owner', 'admin'))
    OR
    (project_id IS NOT NULL AND private.project_role(project_id) IN ('owner', 'admin'))
);


CREATE OR REPLACE FUNCTION private.invitation_token_hash(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT encode(sha256(convert_to(COALESCE(p_token, ''), 'UTF8')), 'hex');
$$;
REVOKE ALL ON FUNCTION private.invitation_token_hash(text) FROM PUBLIC;


-- What the link is for, before accepting: the organization or project,
-- who invited, the role and which address it was sent to. Nothing for an
-- unknown token.
CREATE OR REPLACE FUNCTION public.invitation_preview(p_token text)
RETURNS TABLE (
    status          text,
    email           text,
    role            text,
    organization_id uuid,
    project_id      uuid,
    target_name     text,
    inviter_name    text,
    expires_at      timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        CASE WHEN i.status = 'pending' AND i.expires_at <= now() THEN 'expired' ELSE i.status END,
        i.email,
        i.role,
        COALESCE(i.organization_id, p.organization_id),
        i.project_id,
        COALESCE(o.name, p.name),
        COALESCE(NULLIF(pr.full_name, ''), pr.email),
        i.expires_at
    FROM public.invitations i
    LEFT JOIN public.organizations o ON o.id = i.organization_id
    LEFT JOIN public.projects p ON p.id = i.project_id
    LEFT JOIN public.profiles pr ON pr.id = i.invited_by
    WHERE (SELECT auth.uid()) IS NOT NULL
      AND i.token_hash = private.invitation_token_hash(p_token);
$$;
REVOKE ALL ON FUNCTION public.invitation_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invitation_preview(text) TO authenticated;


-- Accepts as the signed-in user. Result codes instead of exceptions, so the
-- page can say what happened: accepted, already_member, not_found,
-- expired, used (accepted/cancelled/rejected), email_mismatch.
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS TABLE (result text, organization_id uuid, project_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
    v_uid   uuid := (SELECT auth.uid());
    v_email text;
    v_inv   public.invitations%ROWTYPE;
    v_org   uuid;
    v_added integer;
BEGIN
    IF v_uid IS NULL THEN
        RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid;
        RETURN;
    END IF;

    SELECT * INTO v_inv
    FROM public.invitations i
    WHERE i.token_hash = private.invitation_token_hash(p_token)
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid;
        RETURN;
    END IF;

    v_org := COALESCE(v_inv.organization_id, (SELECT p.organization_id FROM public.projects p WHERE p.id = v_inv.project_id));

    IF v_inv.status <> 'pending' THEN
        RETURN QUERY SELECT 'used'::text, v_org, v_inv.project_id;
        RETURN;
    END IF;
    IF v_inv.expires_at <= now() THEN
        UPDATE public.invitations SET status = 'expired' WHERE id = v_inv.id;
        RETURN QUERY SELECT 'expired'::text, v_org, v_inv.project_id;
        RETURN;
    END IF;

    SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = v_uid;
    IF v_email IS NULL OR v_email <> lower(v_inv.email) THEN
        RETURN QUERY SELECT 'email_mismatch'::text, NULL::uuid, NULL::uuid;
        RETURN;
    END IF;

    IF v_inv.organization_id IS NOT NULL THEN
        INSERT INTO public.organization_members (organization_id, user_id, role)
        VALUES (v_inv.organization_id, v_uid, v_inv.role)
        ON CONFLICT (organization_id, user_id) DO NOTHING;
    ELSE
        INSERT INTO public.project_members (project_id, user_id, role)
        VALUES (v_inv.project_id, v_uid, v_inv.role)
        ON CONFLICT (project_id, user_id) DO NOTHING;
    END IF;
    GET DIAGNOSTICS v_added = ROW_COUNT;

    UPDATE public.invitations SET status = 'accepted', accepted_at = now() WHERE id = v_inv.id;

    RETURN QUERY SELECT (CASE WHEN v_added > 0 THEN 'accepted' ELSE 'already_member' END)::text, v_org, v_inv.project_id;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;


COMMIT;
