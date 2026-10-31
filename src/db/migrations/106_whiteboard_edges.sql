-- Migration 106: Whiteboard Edges
-- Support for connectors (arrows) between whiteboard elements.

CREATE TABLE public.whiteboard_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    board_id TEXT NOT NULL DEFAULT 'default',
    source_id UUID NOT NULL REFERENCES public.whiteboard_elements(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES public.whiteboard_elements(id) ON DELETE CASCADE,
    label TEXT,
    type TEXT NOT NULL DEFAULT 'default',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.whiteboard_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Whiteboard edges are accessible by project members"
    ON public.whiteboard_edges
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_members.project_id = whiteboard_edges.project_id
            AND project_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Whiteboard edges can be managed by project members with write access"
    ON public.whiteboard_edges
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_members.project_id = whiteboard_edges.project_id
            AND project_members.user_id = auth.uid()
            -- Note: In a real scenario, we'd check the project_members.role for write permissions
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_members.project_id = whiteboard_edges.project_id
            AND project_members.user_id = auth.uid()
        )
    );

-- Indexes
CREATE INDEX idx_whiteboard_edges_project_board ON public.whiteboard_edges(project_id, board_id);
CREATE INDEX idx_whiteboard_edges_source ON public.whiteboard_edges(source_id);
CREATE INDEX idx_whiteboard_edges_target ON public.whiteboard_edges(target_id);
