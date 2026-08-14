import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { requireAuth, isAuthError } from '@/lib/auth/auth-helpers';
import type { Task, CreateTaskData, UpdateTaskData } from '@/types/task';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');
    const status = searchParams.get('status');
    const assigneeId = searchParams.get('assignee_id');

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

    let query = supabase
      .from('tasks')
      .select('*')
      .eq('project_id', projectId);

    if (status) {
      query = query.eq('status', status);
    }

    if (assigneeId) {
      query = query.eq('assignee_id', assigneeId);
    }

    const { data, error } = await query.order('sort_order', { ascending: true, nullsFirst: false });

    if (error) throw error;

    return NextResponse.json({ tasks: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body: CreateTaskData = await request.json();
    const { project_id, title, description, status, priority, tags, due_date, progress_percent, assignee_id, estimated_hours, sort_order, decision_id } = body;

    if (!project_id || !title) {
      return NextResponse.json(
        { error: 'Project ID and task title are required' },
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

    if (!membership || !['owner', 'admin', 'developer'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to create tasks in this project' },
        { status: 403 }
      );
    }

    // Get max sort order if not provided
    let finalSortOrder = sort_order;
    if (finalSortOrder === undefined) {
      const { data: maxSort } = await supabase
        .from('tasks')
        .select('sort_order')
        .eq('project_id', project_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      finalSortOrder = (maxSort?.sort_order || 0) + 1;
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        project_id,
        title,
        description: description || null,
        status: status || 'todo',
        priority: priority || 'medium',
        tags: tags || [],
        due_date: due_date || null,
        progress_percent: progress_percent ?? 0,
        assignee_id: assignee_id || null,
        estimated_hours: estimated_hours || null,
        sort_order: finalSortOrder,
        decision_id: decision_id || null,
        created_by: auth.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ task }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body: UpdateTaskData = await request.json();
    const { id, title, description, status, priority, tags, due_date, progress_percent, assignee_id, estimated_hours, actual_hours, sort_order, decision_id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user has access to the project
    const { data: task } = await supabase
      .from('tasks')
      .select('project_id')
      .eq('id', id)
      .single();

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', task.project_id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (!membership || !['owner', 'admin', 'developer'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to update tasks in this project' },
        { status: 403 }
      );
    }

    const updateData: UpdateTaskData = { id };
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (tags !== undefined) updateData.tags = tags;
    if (due_date !== undefined) updateData.due_date = due_date;
    if (progress_percent !== undefined) updateData.progress_percent = progress_percent;
    if (assignee_id !== undefined) updateData.assignee_id = assignee_id;
    if (estimated_hours !== undefined) updateData.estimated_hours = estimated_hours;
    if (actual_hours !== undefined) updateData.actual_hours = actual_hours;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (decision_id !== undefined) updateData.decision_id = decision_id;

    const { data: updatedTask, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ task: updatedTask });
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
        { error: 'Task ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user has access to the project
    const { data: task } = await supabase
      .from('tasks')
      .select('project_id')
      .eq('id', id)
      .single();

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', task.project_id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to delete tasks in this project' },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
