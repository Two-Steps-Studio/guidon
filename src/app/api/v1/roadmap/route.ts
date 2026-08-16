import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { requireAuth, isAuthError } from '@/lib/auth/auth-helpers';
import type { RoadmapPhase, CreatePhaseData, UpdatePhaseData } from '@/types/task';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');

    if (!projectId) {
      return NextResponse.json(
        { error: 'project_id is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user has access to the project
    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json(
        { error: 'You do not have access to this project' },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from('roadmap_phases')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true, nullsFirst: false });

    if (error) throw error;

    return NextResponse.json({ phases: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body: CreatePhaseData = await request.json();
    const { project_id, name, description, start_date, planned_end_date, status, completion_percentage, sort_order } = body;

    if (!project_id || !name) {
      return NextResponse.json(
        { error: 'Project ID and phase name are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user has access to the project
    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', project_id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to create phases in this project' },
        { status: 403 }
      );
    }

    // Get max sort order if not provided
    let finalSortOrder = sort_order;
    if (finalSortOrder === undefined) {
      const { data: maxSort } = await supabase
        .from('roadmap_phases')
        .select('sort_order')
        .eq('project_id', project_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      finalSortOrder = (maxSort?.sort_order || 0) + 1;
    }

    const { data: phase, error } = await supabase
      .from('roadmap_phases')
      .insert({
        project_id,
        name,
        description: description || null,
        start_date: start_date || null,
        planned_end_date: planned_end_date || null,
        status: status || 'planned',
        completion_percentage: completion_percentage ?? 0,
        sort_order: finalSortOrder,
        created_by: auth.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ phase }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { id, name, description, start_date, planned_end_date, actual_end_date, status, completion_percentage, sort_order } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Phase ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user has access to the project
    const { data: phase } = await supabase
      .from('roadmap_phases')
      .select('project_id')
      .eq('id', id)
      .single();

    if (!phase) {
      return NextResponse.json(
        { error: 'Phase not found' },
        { status: 404 }
      );
    }

    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', phase.project_id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to update phases in this project' },
        { status: 403 }
      );
    }

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (start_date !== undefined) updateData.start_date = start_date;
    if (planned_end_date !== undefined) updateData.planned_end_date = planned_end_date;
    if (actual_end_date !== undefined) updateData.actual_end_date = actual_end_date;
    if (status !== undefined) updateData.status = status;
    if (completion_percentage !== undefined) updateData.completion_percentage = completion_percentage;
    if (sort_order !== undefined) updateData.sort_order = sort_order;

    const { data: updatedPhase, error } = await supabase
      .from('roadmap_phases')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ phase: updatedPhase });
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
        { error: 'Phase ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user has access to the project
    const { data: phase } = await supabase
      .from('roadmap_phases')
      .select('project_id')
      .eq('id', id)
      .single();

    if (!phase) {
      return NextResponse.json(
        { error: 'Phase not found' },
        { status: 404 }
      );
    }

    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', phase.project_id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to delete phases in this project' },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from('roadmap_phases')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
