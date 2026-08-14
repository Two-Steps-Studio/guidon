import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { requireAuth, isAuthError } from '@/lib/auth/auth-helpers';
import type { ContextRelation, CreateRelationData, UpdateRelationData } from '@/types/context';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');
    const sourceType = searchParams.get('source_type');
    const sourceId = searchParams.get('source_id');
    const targetType = searchParams.get('target_type');
    const targetId = searchParams.get('target_id');

    const supabase = await createClient();

    let query = supabase.from('context_relations').select('*');

    if (projectId) {
      // Get all project entity IDs for filtering
      const [tasksRes, phasesRes, decisionsRes, filesRes, sourcesRes, memoryRes] = await Promise.all([
        supabase.from('tasks').select('id').eq('project_id', projectId),
        supabase.from('roadmap_phases').select('id').eq('project_id', projectId),
        supabase.from('context_decisions').select('id').eq('project_id', projectId),
        supabase.from('project_files').select('id').eq('project_id', projectId),
        supabase.from('context_sources').select('id').eq('project_id', projectId),
        supabase.from('project_memory').select('id').eq('project_id', projectId),
      ]);

      const projectEntityIds = [
        ...(tasksRes.data?.map(t => t.id) || []),
        ...(phasesRes.data?.map(p => p.id) || []),
        ...(decisionsRes.data?.map(d => d.id) || []),
        ...(filesRes.data?.map(f => f.id) || []),
        ...(sourcesRes.data?.map(s => s.id) || []),
        ...(memoryRes.data?.map(m => m.id) || []),
      ];

      // Also include the project itself
      projectEntityIds.push(projectId);

      query = query.or(`source_id.in.(${projectEntityIds.join(',')}),target_id.in.(${projectEntityIds.join(',')})`);
    }

    if (sourceType && sourceId) {
      query = query.eq('source_type', sourceType).eq('source_id', sourceId);
    }

    if (targetType && targetId) {
      query = query.eq('target_type', targetType).eq('target_id', targetId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ relations: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body: CreateRelationData = await request.json();
    const { source_type, source_id, target_type, target_id, relation_type, metadata } = body;

    if (!source_type || !source_id || !target_type || !target_id || !relation_type) {
      return NextResponse.json(
        { error: 'All relation fields are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user has access to both entities' projects
    let projectIds: string[] = [];

    // Get project IDs from source and target
    if (source_type === 'project') {
      projectIds.push(source_id);
    } else {
      const tableMap: Record<string, string> = {
        task: 'tasks',
        phase: 'roadmap_phases',
        decision: 'context_decisions',
        file: 'project_files',
        source: 'context_sources',
        memory: 'project_memory',
      };
      const table = tableMap[source_type];
      if (table) {
        const { data } = await supabase.from(table).select('project_id').eq('id', source_id).maybeSingle();
        if (data?.project_id) projectIds.push(data.project_id);
      }
    }

    if (target_type === 'project') {
      projectIds.push(target_id);
    } else {
      const tableMap: Record<string, string> = {
        task: 'tasks',
        phase: 'roadmap_phases',
        decision: 'context_decisions',
        file: 'project_files',
        source: 'context_sources',
        memory: 'project_memory',
      };
      const table = tableMap[target_type];
      if (table) {
        const { data } = await supabase.from(table).select('project_id').eq('id', target_id).maybeSingle();
        if (data?.project_id) projectIds.push(data.project_id);
      }
    }

    // Check access to at least one project
    const hasAccess = projectIds.length === 0 || await Promise.all(
      projectIds.map(pid => supabase
        .from('project_members')
        .select('role')
        .eq('project_id', pid)
        .eq('user_id', auth.user.id)
        .maybeSingle()
        .then(r => !!r.data))
    ).then(results => results.some(r => r));

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'You do not have permission to create this relation' },
        { status: 403 }
      );
    }

    const { data: relation, error } = await supabase
      .from('context_relations')
      .insert({
        source_type,
        source_id,
        target_type,
        target_id,
        relation_type,
        metadata: metadata || {},
        created_by: auth.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ relation }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body: UpdateRelationData = await request.json();
    const { id, relation_type, metadata } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Relation ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get the relation to check project access
    const { data: relation } = await supabase
      .from('context_relations')
      .select('source_type, source_id, target_type, target_id')
      .eq('id', id)
      .single();

    if (!relation) {
      return NextResponse.json(
        { error: 'Relation not found' },
        { status: 404 }
      );
    }

    // Verify access (simplified - check if user can access either source or target project)
    const tableMap: Record<string, string> = {
      task: 'tasks',
      phase: 'roadmap_phases',
      decision: 'context_decisions',
      file: 'project_files',
      source: 'context_sources',
      memory: 'project_memory',
    };

    let hasAccess = false;

    for (const entity of [relation, { source_type: relation.source_type, source_id: relation.source_id }]) {
      if (entity.source_type === 'project') {
        const { data } = await supabase
          .from('project_members')
          .select('role')
          .eq('project_id', entity.source_id)
          .eq('user_id', auth.user.id)
          .maybeSingle();
        if (data) hasAccess = true;
      } else {
        const table = tableMap[entity.source_type];
        if (table) {
          const { data } = await supabase.from(table).select('project_id').eq('id', entity.source_id).maybeSingle();
          if (data?.project_id) {
            const { data: member } = await supabase
              .from('project_members')
              .select('role')
              .eq('project_id', data.project_id)
              .eq('user_id', auth.user.id)
              .maybeSingle();
            if (member) hasAccess = true;
          }
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'You do not have permission to update this relation' },
        { status: 403 }
      );
    }

    const updateData: UpdateRelationData = { id };
    if (relation_type !== undefined) updateData.relation_type = relation_type;
    if (metadata !== undefined) updateData.metadata = metadata;

    const { data: updatedRelation, error } = await supabase
      .from('context_relations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ relation: updatedRelation });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Relation ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get the relation to check project access
    const { data: relation } = await supabase
      .from('context_relations')
      .select('source_type, source_id, target_type, target_id')
      .eq('id', id)
      .single();

    if (!relation) {
      return NextResponse.json(
        { error: 'Relation not found' },
        { status: 404 }
      );
    }

    // Verify access (simplified)
    const tableMap: Record<string, string> = {
      task: 'tasks',
      phase: 'roadmap_phases',
      decision: 'context_decisions',
      file: 'project_files',
      source: 'context_sources',
      memory: 'project_memory',
    };

    let hasAccess = false;

    for (const entity of [relation, { source_type: relation.source_type, source_id: relation.source_id }]) {
      if (entity.source_type === 'project') {
        const { data } = await supabase
          .from('project_members')
          .select('role')
          .eq('project_id', entity.source_id)
          .eq('user_id', auth.user.id)
          .maybeSingle();
        if (data?.role && ['owner', 'admin'].includes(data.role)) hasAccess = true;
      } else {
        const table = tableMap[entity.source_type];
        if (table) {
          const { data } = await supabase.from(table).select('project_id').eq('id', entity.source_id).maybeSingle();
          if (data?.project_id) {
            const { data: member } = await supabase
              .from('project_members')
              .select('role')
              .eq('project_id', data.project_id)
              .eq('user_id', auth.user.id)
              .maybeSingle();
            if (member?.role && ['owner', 'admin'].includes(member.role)) hasAccess = true;
          }
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'You do not have permission to delete this relation' },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from('context_relations')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
