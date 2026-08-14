import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { requireAuth, isAuthError } from '@/lib/auth/auth-helpers';
import type { ProjectMemory, CreateMemoryData, UpdateMemoryData } from '@/types/context';

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
      .from('project_memory')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ memory: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body: CreateMemoryData = await request.json();
    const { project_id, content, memory_type, source_id, verified, confidence } = body;

    if (!project_id || !content) {
      return NextResponse.json(
        { error: 'Project ID and content are required' },
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
        { error: 'You do not have permission to create memory in this project' },
        { status: 403 }
      );
    }

    const { data: memory, error } = await supabase
      .from('project_memory')
      .insert({
        project_id,
        content,
        memory_type: memory_type || 'fact',
        source_id: source_id || null,
        verified: verified || false,
        confidence: confidence || null,
        created_by: auth.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ memory }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body: UpdateMemoryData = await request.json();
    const { id, content, memory_type, source_id, verified, verified_by, verified_at, confidence } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Memory ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user has access to the project
    const { data: memory } = await supabase
      .from('project_memory')
      .select('project_id')
      .eq('id', id)
      .single();

    if (!memory) {
      return NextResponse.json(
        { error: 'Memory not found' },
        { status: 404 }
      );
    }

    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', memory.project_id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (!membership || !['owner', 'admin', 'developer'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to update memory in this project' },
        { status: 403 }
      );
    }

    const updateData: UpdateMemoryData = { id };
    if (content !== undefined) updateData.content = content;
    if (memory_type !== undefined) updateData.memory_type = memory_type;
    if (source_id !== undefined) updateData.source_id = source_id;
    if (verified !== undefined) updateData.verified = verified;
    if (verified_by !== undefined) updateData.verified_by = verified_by;
    if (verified_at !== undefined) updateData.verified_at = verified_at;
    if (confidence !== undefined) updateData.confidence = confidence;

    const { data: updatedMemory, error } = await supabase
      .from('project_memory')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ memory: updatedMemory });
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
        { error: 'Memory ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user has access to the project
    const { data: memory } = await supabase
      .from('project_memory')
      .select('project_id')
      .eq('id', id)
      .single();

    if (!memory) {
      return NextResponse.json(
        { error: 'Memory not found' },
        { status: 404 }
      );
    }

    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', memory.project_id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to delete memory in this project' },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from('project_memory')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
