import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { requireAuth, isAuthError } from '@/lib/auth/auth-helpers';
import type { Decision, CreateDecisionData, UpdateDecisionData } from '@/types/context';

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
      .from('context_decisions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ decisions: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body: CreateDecisionData = await request.json();
    const { project_id, title, description, decision_type, status, alternatives, impact, source_type, source_id } = body;

    if (!project_id || !title) {
      return NextResponse.json(
        { error: 'Project ID and title are required' },
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
        { error: 'You do not have permission to create decisions in this project' },
        { status: 403 }
      );
    }

    const { data: decision, error } = await supabase
      .from('context_decisions')
      .insert({
        project_id,
        title,
        description: description || null,
        decision_type: decision_type || 'other',
        status: status || 'proposed',
        alternatives: alternatives || [],
        impact: impact || null,
        source_type: source_type || null,
        source_id: source_id || null,
        made_by: auth.user.id,
        made_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ decision }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body: UpdateDecisionData = await request.json();
    const { id, title, description, decision_type, status, made_by, made_at, alternatives, impact, source_type, source_id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Decision ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user has access to the project
    const { data: decision } = await supabase
      .from('context_decisions')
      .select('project_id')
      .eq('id', id)
      .single();

    if (!decision) {
      return NextResponse.json(
        { error: 'Decision not found' },
        { status: 404 }
      );
    }

    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', decision.project_id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (!membership || !['owner', 'admin', 'developer'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to update decisions in this project' },
        { status: 403 }
      );
    }

    const updateData: UpdateDecisionData = { id };
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (decision_type !== undefined) updateData.decision_type = decision_type;
    if (status !== undefined) updateData.status = status;
    if (made_by !== undefined) updateData.made_by = made_by;
    if (made_at !== undefined) updateData.made_at = made_at;
    if (alternatives !== undefined) updateData.alternatives = alternatives;
    if (impact !== undefined) updateData.impact = impact;
    if (source_type !== undefined) updateData.source_type = source_type;
    if (source_id !== undefined) updateData.source_id = source_id;

    const { data: updatedDecision, error } = await supabase
      .from('context_decisions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ decision: updatedDecision });
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
        { error: 'Decision ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user has access to the project
    const { data: decision } = await supabase
      .from('context_decisions')
      .select('project_id')
      .eq('id', id)
      .single();

    if (!decision) {
      return NextResponse.json(
        { error: 'Decision not found' },
        { status: 404 }
      );
    }

    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', decision.project_id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to delete decisions in this project' },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from('context_decisions')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
