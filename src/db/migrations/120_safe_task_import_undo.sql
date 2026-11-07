BEGIN;

-- Called only by the application server after verifying its signed import receipt.
-- Use service_role so RLS cannot hide dependent rows that need to be preserved.
CREATE FUNCTION public.undo_task_import(p_project_id uuid, p_actor_id uuid, p_task_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
    v_removed uuid[];
    v_kept integer;
BEGIN
    IF COALESCE(pg_catalog.cardinality(p_task_ids), 0) NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION 'Invalid import batch size' USING ERRCODE = '22023';
    END IF;

    PERFORM 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id AND pm.user_id = p_actor_id
      AND pm.role IN ('owner', 'admin')
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only project owners and admins can undo an import' USING ERRCODE = '42501';
    END IF;

    -- A foreign-key insert takes a key-share lock on the parent task. Wait
    -- for those inserts here, then check dependents in a fresh snapshot.
    IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'Import undo requires read committed isolation' USING ERRCODE = '25001';
    END IF;
    PERFORM t.id FROM public.tasks t
    WHERE t.project_id = p_project_id AND t.created_by = p_actor_id
      AND t.id = ANY(p_task_ids) AND t.revision = 0
    ORDER BY t.id
    FOR UPDATE;

    WITH deleted AS (
        DELETE FROM public.tasks t
        WHERE t.project_id = p_project_id AND t.created_by = p_actor_id
          AND t.id = ANY(p_task_ids) AND t.revision = 0
          AND NOT EXISTS (SELECT 1 FROM public.task_comments c WHERE c.task_id = t.id)
          AND NOT EXISTS (SELECT 1 FROM public.task_attachments a WHERE a.task_id = t.id)
          AND NOT EXISTS (SELECT 1 FROM public.task_attempts a WHERE a.task_id = t.id)
          AND NOT EXISTS (SELECT 1 FROM public.tasks child WHERE child.parent_task_id = t.id)
          AND NOT EXISTS (SELECT 1 FROM public.tasks next_task WHERE next_task.recurred_from = t.id)
          AND NOT EXISTS (SELECT 1 FROM public.github_task_events e WHERE e.task_id = t.id)
          AND NOT EXISTS (SELECT 1 FROM public.task_links l WHERE l.task_id = t.id)
          AND NOT EXISTS (SELECT 1 FROM public.task_claims c WHERE c.task_id = t.id)
          AND NOT EXISTS (SELECT 1 FROM public.agent_approval_requests a WHERE a.task_id = t.id)
          AND NOT EXISTS (
              SELECT 1 FROM public.context_relations r
              WHERE r.project_id = p_project_id
                AND ((r.source_type = 'task' AND r.source_id = t.id)
                  OR (r.target_type = 'task' AND r.target_id = t.id))
          )
        RETURNING t.id
    )
    SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_removed FROM deleted;

    SELECT count(*) INTO v_kept FROM public.tasks t
    WHERE t.project_id = p_project_id AND t.created_by = p_actor_id AND t.id = ANY(p_task_ids);
    RETURN pg_catalog.jsonb_build_object('removed', v_removed, 'kept', v_kept);
END;
$$;

REVOKE ALL ON FUNCTION public.undo_task_import(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.undo_task_import(uuid, uuid, uuid[]) TO service_role;

COMMIT;
