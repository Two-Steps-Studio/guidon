-- Whiteboard module: boards and elements for visual brainstorming
-- This allows users to create multiple boards per project, add sticky notes, shapes, and arrows.

CREATE TABLE public.whiteboards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name text NOT NULL DEFAULT 'Untitled Board',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.whiteboard_elements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id uuid NOT NULL REFERENCES public.whiteboards(id) ON DELETE CASCADE,
    type text NOT NULL, -- 'sticky', 'text', 'shape', 'arrow'
    x float8 NOT NULL DEFAULT 0,
    y float8 NOT NULL DEFAULT 0,
    width float8 NOT NULL DEFAULT 150,
    height float8 NOT NULL DEFAULT 150,
    content jsonb DEFAULT '{}'::jsonb, -- { text: string, color: string, ... }
    parent_id uuid REFERENCES public.whiteboard_elements(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.whiteboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whiteboard_elements ENABLE ROW LEVEL SECURITY;

-- Boards: Grant access if user is a member of the project
CREATE POLICY "Whiteboards are accessible to project members"
ON public.whiteboards
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = whiteboards.project_id
        AND user_id = auth.uid()
    )
);

-- Elements: Grant access if user is a member of the project the board belongs to
CREATE POLICY "Elements are accessible to project members"
ON public.whiteboard_elements
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.whiteboards b
        JOIN public.project_members pm ON pm.project_id = b.project_id
        WHERE b.id = whiteboard_elements.board_id
        AND pm.user_id = auth.uid()
    )
);

-- Indexes for performance
CREATE INDEX idx_whiteboards_project_id ON public.whiteboards(project_id);
CREATE INDEX idx_whiteboard_elements_board_id ON public.whiteboard_elements(board_id);
CREATE INDEX idx_whiteboard_elements_parent_id ON public.whiteboard_elements(parent_id);
