-- ============================================
-- GUIDON INITIAL DATABASE SCHEMA
-- ============================================
-- This migration creates the core database schema for Guidon
-- Uses UUIDs for all primary keys
-- Includes RLS policies for security
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. PROFILES TABLE (User profiles from Supabase Auth)
-- ============================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
 Avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================
-- 2. ORGANIZATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9-]+$')
);

-- RLS will be enabled after all tables are created

-- ============================================
-- 3. ORGANIZATION MEMBERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member'
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'member')),
  UNIQUE(organization_id, user_id)
);

-- RLS will be enabled after all tables are created

-- ============================================
-- 4. PROJECTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  description_markdown TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'archived', 'deleted'
  visibility TEXT NOT NULL DEFAULT 'private', -- 'private', 'organization', 'public'
  color TEXT,
  planned_end_date TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT valid_status CHECK (status IN ('active', 'archived', 'deleted')),
  CONSTRAINT valid_visibility CHECK (visibility IN ('private', 'organization', 'public')),
  CONSTRAINT color_format CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$')
);

-- RLS will be enabled after all tables are created

-- ============================================
-- 5. PROJECT MEMBERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer', -- 'owner', 'admin', 'developer', 'tester', 'viewer'
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'developer', 'tester', 'viewer')),
  UNIQUE(project_id, user_id)
);

-- RLS will be enabled after all tables are created

-- ============================================
-- 6. TASKS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo', -- 'todo', 'in_progress', 'testing', 'completed'
  priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  tags TEXT[] DEFAULT '{}',
  due_date TIMESTAMP WITH TIME ZONE,
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  estimated_hours DECIMAL(5,2),
  actual_hours DECIMAL(5,2),
  sort_order INTEGER,
  decision_id UUID, -- Will reference context_decisions after it's created
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT title_not_empty CHECK (LENGTH(TRIM(title)) > 0),
  CONSTRAINT valid_status CHECK (status IN ('todo', 'in_progress', 'testing', 'completed')),
  CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'critical'))
);

-- RLS will be enabled after all tables are created

-- ============================================
-- 7. ROADMAP PHASES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS roadmap_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMP WITH TIME ZONE,
  planned_end_date TIMESTAMP WITH TIME ZONE,
  actual_end_date TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'planned', -- 'planned', 'in_progress', 'completed', 'blocked'
  completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  sort_order INTEGER,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT valid_status CHECK (status IN ('planned', 'in_progress', 'completed', 'blocked'))
);

-- RLS will be enabled after all tables are created

-- ============================================
-- 8. PROJECT FILES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_path TEXT,
  file_url TEXT,
  category TEXT NOT NULL DEFAULT 'other', -- 'documentation', 'graphics', 'audio', 'source_code', 'other'
  size_bytes BIGINT,
  mime_type TEXT,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT valid_category CHECK (category IN ('documentation', 'graphics', 'audio', 'source_code', 'other'))
);

-- RLS will be enabled after all tables are created

-- ============================================
-- 9. TECHNOLOGIES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS technologies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon_slug TEXT,
  version TEXT,
  category TEXT NOT NULL DEFAULT 'other', -- 'frontend', 'backend', 'database', 'devops', 'ai', 'other'
  description TEXT,
  sort_order INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT valid_category CHECK (category IN ('frontend', 'backend', 'database', 'devops', 'ai', 'other'))
);

-- RLS will be enabled after all tables are created

-- ============================================
-- 10. INVITATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'expired', 'cancelled'
  token TEXT UNIQUE NOT NULL,
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
  CONSTRAINT has_target CHECK (organization_id IS NOT NULL OR project_id IS NOT NULL)
);

-- RLS will be enabled after all tables are created

-- ============================================
-- 11. ACTIVITY LOGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- RLS will be enabled after all tables are created

-- ============================================
-- 12. CONTEXT DECISIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS context_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  decision_type TEXT NOT NULL DEFAULT 'other', -- 'architectural', 'technical', 'product', 'process', 'business', 'other'
  status TEXT NOT NULL DEFAULT 'proposed', -- 'proposed', 'approved', 'rejected', 'deprecated'
  made_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  made_at TIMESTAMP WITH TIME ZONE,
  alternatives TEXT[] DEFAULT '{}',
  impact TEXT,
  source_type TEXT, -- Reference to ContextEntityType
  source_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT title_not_empty CHECK (LENGTH(TRIM(title)) > 0),
  CONSTRAINT valid_decision_type CHECK (decision_type IN ('architectural', 'technical', 'product', 'process', 'business', 'other')),
  CONSTRAINT valid_status CHECK (status IN ('proposed', 'approved', 'rejected', 'deprecated'))
);

-- RLS will be enabled after all tables are created

-- ============================================
-- 13. CONTEXT RELATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS context_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL, -- ContextEntityType
  source_id UUID NOT NULL,
  target_type TEXT NOT NULL, -- ContextEntityType
  target_id UUID NOT NULL,
  relation_type TEXT NOT NULL, -- 'depends_on', 'blocks', 'implements', 'references', 'decided_by', 'based_on', 'related_to', 'contradicts', 'supersedes', 'part_of', 'contains'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT valid_relation_type CHECK (relation_type IN ('depends_on', 'blocks', 'implements', 'references', 'decided_by', 'based_on', 'related_to', 'contradicts', 'supersedes', 'part_of', 'contains')),
  CONSTRAINT no_self_relation CHECK (NOT (source_type = target_type AND source_id = target_id))
);

-- RLS will be enabled after all tables are created

-- ============================================
-- 14. CONTEXT SOURCES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS context_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL, -- 'document', 'comment', 'commit', 'pull_request', 'issue', 'external_url', 'meeting', 'file', 'other'
  source_id UUID,
  title TEXT,
  content TEXT,
  url TEXT,
  author UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT valid_source_type CHECK (source_type IN ('document', 'comment', 'commit', 'pull_request', 'issue', 'external_url', 'meeting', 'file', 'other'))
);

-- RLS will be enabled after all tables are created

-- ============================================
-- 15. PROJECT MEMORY TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS project_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  memory_type TEXT NOT NULL, -- 'fact', 'project_rule', 'constraint', 'preference', 'decision_summary', 'observation', 'ai_insight'
  source_id UUID REFERENCES context_sources(id) ON DELETE SET NULL,
  verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  confidence DECIMAL(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)), -- 0-1 for AI insights
  CONSTRAINT content_not_empty CHECK (LENGTH(TRIM(content)) > 0),
  CONSTRAINT valid_memory_type CHECK (memory_type IN ('fact', 'project_rule', 'constraint', 'preference', 'decision_summary', 'observation', 'ai_insight'))
);

-- RLS will be enabled after all tables are created

-- ============================================
-- 16. TASK COMMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT content_not_empty CHECK (LENGTH(TRIM(content)) > 0)
);

-- RLS will be enabled after all tables are created

-- ============================================
-- INDEXES
-- ============================================

-- Organizations
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON organizations(created_by);

-- Organization Members
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON organization_members(role);

-- Projects
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);

-- Project Members
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_role ON project_members(role);

-- Tasks
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_decision ON tasks(decision_id);

-- Roadmap Phases
CREATE INDEX IF NOT EXISTS idx_phases_project ON roadmap_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_phases_status ON roadmap_phases(status);

-- Project Files
CREATE INDEX IF NOT EXISTS idx_files_project ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_files_category ON project_files(category);

-- Technologies
CREATE INDEX IF NOT EXISTS idx_tech_project ON technologies(project_id);
CREATE INDEX IF NOT EXISTS idx_tech_category ON technologies(category);

-- Invitations
CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_project ON invitations(project_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

-- Activity Logs
CREATE INDEX IF NOT EXISTS idx_activity_project ON activity_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_org ON activity_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);

-- Context Decisions
CREATE INDEX IF NOT EXISTS idx_decisions_project ON context_decisions(project_id);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON context_decisions(status);
CREATE INDEX IF NOT EXISTS idx_decisions_type ON context_decisions(decision_type);

-- Context Relations
CREATE INDEX IF NOT EXISTS idx_relations_source ON context_relations(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_relations_target ON context_relations(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_relations_type ON context_relations(relation_type);

-- Context Sources
CREATE INDEX IF NOT EXISTS idx_sources_project ON context_sources(project_id);
CREATE INDEX IF NOT EXISTS idx_sources_type ON context_sources(source_type);

-- Project Memory
CREATE INDEX IF NOT EXISTS idx_memory_project ON project_memory(project_id);
CREATE INDEX IF NOT EXISTS idx_memory_type ON project_memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_memory_source ON project_memory(source_id);
CREATE INDEX IF NOT EXISTS idx_memory_verified ON project_memory(verified);

-- Task Comments
CREATE INDEX IF NOT EXISTS idx_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_author ON task_comments(author_id);

-- ============================================
-- TRIGGERS FOR updated_at
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_phases_updated_at BEFORE UPDATE ON roadmap_phases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_context_decisions_updated_at BEFORE UPDATE ON context_decisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_context_sources_updated_at BEFORE UPDATE ON context_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_memory_updated_at BEFORE UPDATE ON project_memory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_comments_updated_at BEFORE UPDATE ON task_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FULL-TEXT SEARCH INDEXES
-- ============================================

-- Tasks full-text search
CREATE INDEX IF NOT EXISTS idx_tasks_content_fts ON tasks 
  USING GIN(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, '')));

-- Decisions full-text search
CREATE INDEX IF NOT EXISTS idx_decisions_content_fts ON context_decisions 
  USING GIN(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, '')));

-- Sources full-text search
CREATE INDEX IF NOT EXISTS idx_sources_content_fts ON context_sources 
  USING GIN(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, '')));

-- Memory full-text search
CREATE INDEX IF NOT EXISTS idx_memory_content_fts ON project_memory 
  USING GIN(to_tsvector('english', content));

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================
-- RLS is now enabled on all tables after they are created

-- Organizations RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization members can view organization"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organization owners and admins can update organization"
  ON organizations FOR UPDATE
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Organization owners can delete organization"
  ON organizations FOR DELETE
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Organization Members RLS
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization members can view membership"
  ON organization_members FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organization owners and admins can manage members"
  ON organization_members FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Projects RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view project"
  ON projects FOR SELECT
  USING (
    id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Project owners and admins can update project"
  ON projects FOR UPDATE
  USING (
    id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Project owners can delete project"
  ON projects FOR DELETE
  USING (
    id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Project Members RLS
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view membership"
  ON project_members FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Project owners and admins can manage members"
  ON project_members FOR ALL
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Tasks RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view tasks"
  ON tasks FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Project members can create tasks"
  ON tasks FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'developer')
    )
  );

CREATE POLICY "Project members can update tasks"
  ON tasks FOR UPDATE
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'developer')
    )
  );

CREATE POLICY "Project owners and admins can delete tasks"
  ON tasks FOR DELETE
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Roadmap Phases RLS
ALTER TABLE roadmap_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view phases"
  ON roadmap_phases FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Project owners and admins can manage phases"
  ON roadmap_phases FOR ALL
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Project Files RLS
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view files"
  ON project_files FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Project members can upload files"
  ON project_files FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'developer')
    )
  );

CREATE POLICY "Project owners and admins can delete files"
  ON project_files FOR DELETE
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Technologies RLS
ALTER TABLE technologies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view technologies"
  ON technologies FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Project owners and admins can manage technologies"
  ON technologies FOR ALL
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Invitations RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invitations sent to them"
  ON invitations FOR SELECT
  USING (email = (SELECT email FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Organization owners and admins can manage invitations"
  ON invitations FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Activity Logs RLS
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view project activity"
  ON activity_logs FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid()
    )
    OR
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert activity logs"
  ON activity_logs FOR INSERT
  WITH CHECK (true);

-- Context Decisions RLS
ALTER TABLE context_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view decisions"
  ON context_decisions FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Project members can create decisions"
  ON context_decisions FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'developer')
    )
  );

CREATE POLICY "Project members can update decisions"
  ON context_decisions FOR UPDATE
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'developer')
    )
  );

CREATE POLICY "Project owners and admins can delete decisions"
  ON context_decisions FOR DELETE
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Context Relations RLS
ALTER TABLE context_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view relations"
  ON context_relations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = (
        CASE source_type
          WHEN 'project' THEN source_id::text::uuid
          WHEN 'task' THEN (SELECT project_id FROM tasks WHERE id = source_id)
          WHEN 'phase' THEN (SELECT project_id FROM roadmap_phases WHERE id = source_id)
          WHEN 'decision' THEN (SELECT project_id FROM context_decisions WHERE id = source_id)
          WHEN 'file' THEN (SELECT project_id FROM project_files WHERE id = source_id)
          WHEN 'source' THEN (SELECT project_id FROM context_sources WHERE id = source_id)
          WHEN 'memory' THEN (SELECT project_id FROM project_memory WHERE id = source_id)
          ELSE NULL
        END
      )
      AND p.id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = (
        CASE target_type
          WHEN 'project' THEN target_id::text::uuid
          WHEN 'task' THEN (SELECT project_id FROM tasks WHERE id = target_id)
          WHEN 'phase' THEN (SELECT project_id FROM roadmap_phases WHERE id = target_id)
          WHEN 'decision' THEN (SELECT project_id FROM context_decisions WHERE id = target_id)
          WHEN 'file' THEN (SELECT project_id FROM project_files WHERE id = target_id)
          WHEN 'source' THEN (SELECT project_id FROM context_sources WHERE id = target_id)
          WHEN 'memory' THEN (SELECT project_id FROM project_memory WHERE id = target_id)
          ELSE NULL
        END
      )
      AND p.id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Project members can create relations"
  ON context_relations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'developer'))
    )
  );

CREATE POLICY "Project owners and admins can delete relations"
  ON context_relations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = (
        CASE source_type
          WHEN 'project' THEN source_id::text::uuid
          WHEN 'task' THEN (SELECT project_id FROM tasks WHERE id = source_id)
          WHEN 'phase' THEN (SELECT project_id FROM roadmap_phases WHERE id = source_id)
          WHEN 'decision' THEN (SELECT project_id FROM context_decisions WHERE id = source_id)
          WHEN 'file' THEN (SELECT project_id FROM project_files WHERE id = source_id)
          WHEN 'source' THEN (SELECT project_id FROM context_sources WHERE id = source_id)
          WHEN 'memory' THEN (SELECT project_id FROM project_memory WHERE id = source_id)
          ELSE NULL
        END
      )
      AND p.id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
    )
  );

-- Context Sources RLS
ALTER TABLE context_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view sources"
  ON context_sources FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Project members can create sources"
  ON context_sources FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'developer')
    )
  );

CREATE POLICY "Project members can update sources"
  ON context_sources FOR UPDATE
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'developer')
    )
  );

CREATE POLICY "Project owners and admins can delete sources"
  ON context_sources FOR DELETE
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Project Memory RLS
ALTER TABLE project_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view memory"
  ON project_memory FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Project members can create memory"
  ON project_memory FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'developer')
    )
  );

CREATE POLICY "Project members can update memory"
  ON project_memory FOR UPDATE
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'developer')
    )
  );

CREATE POLICY "Project owners and admins can delete memory"
  ON project_memory FOR DELETE
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Project owners and admins can verify memory"
  ON project_memory FOR UPDATE
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Task Comments RLS
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view comments"
  ON task_comments FOR SELECT
  USING (
    task_id IN (
      SELECT id FROM tasks
      WHERE project_id IN (
        SELECT project_id FROM project_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Project members can create comments"
  ON task_comments FOR INSERT
  WITH CHECK (
    task_id IN (
      SELECT id FROM tasks
      WHERE project_id IN (
        SELECT project_id FROM project_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'developer', 'tester')
      )
    )
    AND author_id = auth.uid()
  );

CREATE POLICY "Comment authors can update comments"
  ON task_comments FOR UPDATE
  USING (author_id = auth.uid());

CREATE POLICY "Comment authors can delete comments"
  ON task_comments FOR DELETE
  USING (author_id = auth.uid());
