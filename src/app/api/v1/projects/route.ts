import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { requireAuth, isAuthError } from '@/lib/auth/auth-helpers';
import type { Project, CreateProjectData, UpdateProjectData } from '@/types/project';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');

    const supabase = await createClient();

    let query = supabase
      .from('projects')
      .select(`
        *,
        organizations (
          id,
          name,
          slug
        )
      `);

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    // Only return projects the user has access to
    const { data: memberships } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', auth.user.id);

    const projectIds = memberships?.map(m => m.project_id) || [];
    
    if (projectIds.length === 0) {
      return NextResponse.json({ projects: [] });
    }

    query = query.in('id', projectIds);

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ projects: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body: CreateProjectData = await request.json();
    const { organization_id, name, description, description_markdown, status, visibility, color, planned_end_date } = body;

    if (!organization_id || !name) {
      return NextResponse.json(
        { error: 'Organization ID and project name are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user has access to the organization
    const { data: orgMembership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organization_id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (!orgMembership) {
      return NextResponse.json(
        { error: 'You do not have access to this organization' },
        { status: 403 }
      );
    }

    // Create project
    // Note: created_by is auto-set by database trigger, and owner membership is auto-created
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        organization_id,
        name,
        description: description || null,
        description_markdown: description_markdown || null,
        status: status || 'active',
        visibility: visibility || 'private',
        color: color || null,
        planned_end_date: planned_end_date || null,
      })
      .select()
      .single();

    if (projectError) throw projectError;

    return NextResponse.json({ project }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body: UpdateProjectData = await request.json();
    const { id, name, description, description_markdown, status, visibility, color, planned_end_date } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check if user has edit permission
    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to update this project' },
        { status: 403 }
      );
    }

    const updateData: UpdateProjectData = { id };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (description_markdown !== undefined) updateData.description_markdown = description_markdown;
    if (status !== undefined) updateData.status = status;
    if (visibility !== undefined) updateData.visibility = visibility;
    if (color !== undefined) updateData.color = color;
    if (planned_end_date !== undefined) updateData.planned_end_date = planned_end_date;

    const { data: project, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ project });
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
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check if user is owner
    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the project owner can delete it' },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
