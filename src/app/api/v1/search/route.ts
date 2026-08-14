import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { requireAuth, isAuthError } from '@/lib/auth/auth-helpers';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const projectId = searchParams.get('project_id');
    const entityTypes = searchParams.get('entity_types');

    if (!query) {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const results: any[] = [];

    const types = entityTypes ? entityTypes.split(',') : ['task', 'decision', 'memory', 'file', 'source'];

    // Search tasks
    if (types.includes('task') && projectId) {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title, description, status, priority, project_id')
        .eq('project_id', projectId)
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(10);

      if (tasks) {
        results.push(...tasks.map((task: any) => ({
          type: 'task',
          id: task.id,
          title: task.title,
          description: task.description,
          metadata: { status: task.status, priority: task.priority, project_id: task.project_id },
        })));
      }
    }

    // Search decisions
    if (types.includes('decision') && projectId) {
      const { data: decisions } = await supabase
        .from('context_decisions')
        .select('id, title, description, decision_type, status, project_id')
        .eq('project_id', projectId)
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(10);

      if (decisions) {
        results.push(...decisions.map((decision: any) => ({
          type: 'decision',
          id: decision.id,
          title: decision.title,
          description: decision.description,
          metadata: { status: decision.status, decision_type: decision.decision_type, project_id: decision.project_id },
        })));
      }
    }

    // Search memory
    if (types.includes('memory') && projectId) {
      const { data: memories } = await supabase
        .from('project_memory')
        .select('id, content, memory_type, project_id')
        .eq('project_id', projectId)
        .or(`content.ilike.%${query}%`)
        .limit(10);

      if (memories) {
        results.push(...memories.map((memory: any) => ({
          type: 'memory',
          id: memory.id,
          title: memory.content.substring(0, 100),
          description: memory.content,
          metadata: { memory_type: memory.memory_type, project_id: memory.project_id },
        })));
      }
    }

    // Search files
    if (types.includes('file') && projectId) {
      const { data: files } = await supabase
        .from('project_files')
        .select('id, name, mime_type, category, project_id')
        .eq('project_id', projectId)
        .ilike('name', `%${query}%`)
        .limit(10);

      if (files) {
        results.push(...files.map((file: any) => ({
          type: 'file',
          id: file.id,
          title: file.name,
          description: file.mime_type,
          metadata: { category: file.category, project_id: file.project_id },
        })));
      }
    }

    // Search sources
    if (types.includes('source') && projectId) {
      const { data: sources } = await supabase
        .from('context_sources')
        .select('id, title, content, source_type, project_id')
        .eq('project_id', projectId)
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .limit(10);

      if (sources) {
        results.push(...sources.map((source: any) => ({
          type: 'source',
          id: source.id,
          title: source.title,
          description: source.content,
          metadata: { source_type: source.source_type, project_id: source.project_id },
        })));
      }
    }

    // Search projects (if no project_id specified)
    if (!projectId && types.includes('project')) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name, description, status')
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(10);

      if (projects) {
        results.push(...projects.map((project: any) => ({
          type: 'project',
          id: project.id,
          title: project.name,
          description: project.description,
          metadata: { status: project.status },
        })));
      }
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
