-- ============================================================
-- GUIDON - MIGRACJA 107
-- Whiteboard: te same role co reszta projektu, krawędzie tylko w obrębie tablicy
-- ============================================================
--
-- Uruchomić PO 106.
--
-- 105/106 dawały każdemu członkowi projektu (także viewerowi i testerowi)
-- pełny zapis tablic, elementów i krawędzi, a krawędź mogła wskazywać
-- elementy z innego projektu (project_id krawędzi nie był wiązany z jej
-- końcami). Polityki zastąpione wzorem reszty schematu (decyzje, 001):
--
-- - czytanie: private.project_access (członkowie projektu i organizacji)
-- - zapis treści (elementy, krawędzie, nowa tablica, zmiana nazwy):
--   owner/admin/developer
-- - usunięcie całej tablicy: owner/admin
-- - krawędź: oba końce to elementy tej samej tablicy (board_id) w tym
--   samym projekcie
--
-- 105/106 nie nadawały też uprawnień: na czystym PostgreSQL (self-hosted)
-- rola authenticated dostawała "permission denied" na każdej tabeli.
-- ============================================================

BEGIN;

REVOKE ALL ON public.whiteboards, public.whiteboard_elements, public.whiteboard_edges FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whiteboards, public.whiteboard_elements, public.whiteboard_edges
    TO authenticated, service_role;

DROP POLICY IF EXISTS "Whiteboards are accessible to project members" ON public.whiteboards;
DROP POLICY IF EXISTS "Elements are accessible to project members" ON public.whiteboard_elements;
DROP POLICY IF EXISTS "Whiteboard edges are accessible by project members" ON public.whiteboard_edges;
DROP POLICY IF EXISTS "Whiteboard edges can be managed by project members with write access" ON public.whiteboard_edges;

-- Tablice
CREATE POLICY whiteboards_select ON public.whiteboards FOR SELECT TO authenticated
    USING (private.project_access(project_id));
CREATE POLICY whiteboards_insert ON public.whiteboards FOR INSERT TO authenticated
    WITH CHECK (private.project_role(project_id) IN ('owner', 'admin', 'developer'));
CREATE POLICY whiteboards_update ON public.whiteboards FOR UPDATE TO authenticated
    USING (private.project_role(project_id) IN ('owner', 'admin', 'developer'))
    WITH CHECK (private.project_role(project_id) IN ('owner', 'admin', 'developer'));
CREATE POLICY whiteboards_delete ON public.whiteboards FOR DELETE TO authenticated
    USING (private.project_role(project_id) IN ('owner', 'admin'));

-- Elementy: projekt wynika z tablicy
CREATE POLICY whiteboard_elements_select ON public.whiteboard_elements FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.whiteboards b
                   WHERE b.id = whiteboard_elements.board_id AND private.project_access(b.project_id)));
CREATE POLICY whiteboard_elements_write ON public.whiteboard_elements FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.whiteboards b
                   WHERE b.id = whiteboard_elements.board_id
                     AND private.project_role(b.project_id) IN ('owner', 'admin', 'developer')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.whiteboards b
                        WHERE b.id = whiteboard_elements.board_id
                          AND private.project_role(b.project_id) IN ('owner', 'admin', 'developer')));

-- Krawędzie: oba końce na tej tablicy, tablica w tym projekcie
CREATE POLICY whiteboard_edges_select ON public.whiteboard_edges FOR SELECT TO authenticated
    USING (private.project_access(project_id));
CREATE POLICY whiteboard_edges_write ON public.whiteboard_edges FOR ALL TO authenticated
    USING (private.project_role(project_id) IN ('owner', 'admin', 'developer'))
    WITH CHECK (
        private.project_role(project_id) IN ('owner', 'admin', 'developer')
        AND EXISTS (SELECT 1 FROM public.whiteboards b
                    WHERE b.id::text = whiteboard_edges.board_id AND b.project_id = whiteboard_edges.project_id)
        AND (SELECT count(*) FROM public.whiteboard_elements e
             WHERE e.id IN (whiteboard_edges.source_id, whiteboard_edges.target_id)
               AND e.board_id::text = whiteboard_edges.board_id)
            = CASE WHEN whiteboard_edges.source_id = whiteboard_edges.target_id THEN 1 ELSE 2 END
    );

COMMIT;
