import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { requireAuth, isAuthError } from '@/lib/auth/auth-helpers';
import type { OrganizationMember, ProjectMember } from '@/types/project';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const projectId = searchParams.get('project_id');

    const supabase = await createClient();

    if (organizationId) {
      // Get organization members
      const { data: orgMembership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', organizationId)
        .eq('user_id', auth.user.id)
        .maybeSingle();

      if (!orgMembership) {
        return NextResponse.json(
          { error: 'You do not have access to this organization' },
          { status: 403 }
        );
      }

      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          id,
          organization_id,
          user_id,
          role,
          joined_at,
          profiles (
            id,
            email,
            full_name,
            avatar_url
          )
        `)
        .eq('organization_id', organizationId)
        .order('joined_at', { ascending: true });

      if (error) throw error;

      const members = data?.map((member: any) => ({
        id: member.id,
        organization_id: member.organization_id,
        user_id: member.user_id,
        role: member.role,
        joined_at: member.joined_at,
        profile: member.profiles,
      })) || [];

      return NextResponse.json({ members });
    }

    if (projectId) {
      // Get project members
      const { data: projectMembership } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', projectId)
        .eq('user_id', auth.user.id)
        .maybeSingle();

      if (!projectMembership) {
        return NextResponse.json(
          { error: 'You do not have access to this project' },
          { status: 403 }
        );
      }

      const { data, error } = await supabase
        .from('project_members')
        .select(`
          id,
          project_id,
          user_id,
          role,
          joined_at,
          profiles (
            id,
            email,
            full_name,
            avatar_url
          )
        `)
        .eq('project_id', projectId)
        .order('joined_at', { ascending: true });

      if (error) throw error;

      const members = data?.map((member: any) => ({
        id: member.id,
        project_id: member.project_id,
        user_id: member.user_id,
        role: member.role,
        joined_at: member.joined_at,
        profile: member.profiles,
      })) || [];

      return NextResponse.json({ members });
    }

    return NextResponse.json(
      { error: 'organization_id or project_id is required' },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { organization_id, project_id, user_id, role, email } = body;

    if (!user_id && !email) {
      return NextResponse.json(
        { error: 'User ID or email is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    if (organization_id) {
      // Verify user is owner/admin of the organization
      const { data: orgMembership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', organization_id)
        .eq('user_id', auth.user.id)
        .maybeSingle();

      if (!orgMembership || !['owner', 'admin'].includes(orgMembership.role)) {
        return NextResponse.json(
          { error: 'You do not have permission to manage members in this organization' },
          { status: 403 }
        );
      }

      // Resolve email to user ID if needed
      let targetUserId = user_id;
      if (!targetUserId && email) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (!profile) {
          return NextResponse.json(
            { error: 'User with this email not found' },
            { status: 404 }
          );
        }
        targetUserId = profile.id;
      }

      const { data: member, error } = await supabase
        .from('organization_members')
        .upsert({
          organization_id,
          user_id: targetUserId,
          role: role || 'member',
        })
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({ member }, { status: 201 });
    }

    if (project_id) {
      // Verify user is owner/admin of the project
      const { data: projectMembership } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', project_id)
        .eq('user_id', auth.user.id)
        .maybeSingle();

      if (!projectMembership || !['owner', 'admin'].includes(projectMembership.role)) {
        return NextResponse.json(
          { error: 'You do not have permission to manage members in this project' },
          { status: 403 }
        );
      }

      // Resolve email to user ID if needed
      let targetUserId = user_id;
      if (!targetUserId && email) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (!profile) {
          return NextResponse.json(
            { error: 'User with this email not found' },
            { status: 404 }
          );
        }
        targetUserId = profile.id;
      }

      const { data: member, error } = await supabase
        .from('project_members')
        .upsert({
          project_id,
          user_id: targetUserId,
          role: role || 'viewer',
        })
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({ member }, { status: 201 });
    }

    return NextResponse.json(
      { error: 'organization_id or project_id is required' },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { id, organization_id, project_id, role } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Member ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get the member to determine which table to update
    let member: any = null;
    let table: string = '';

    if (organization_id) {
      const { data } = await supabase
        .from('organization_members')
        .select('*')
        .eq('id', id)
        .eq('organization_id', organization_id)
        .single();
      member = data;
      table = 'organization_members';
    } else if (project_id) {
      const { data } = await supabase
        .from('project_members')
        .select('*')
        .eq('id', id)
        .eq('project_id', project_id)
        .single();
      member = data;
      table = 'project_members';
    }

    if (!member) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    // Verify user has permission to update
    if (table === 'organization_members') {
      const { data: orgMembership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', member.organization_id)
        .eq('user_id', auth.user.id)
        .maybeSingle();

      if (!orgMembership || !['owner', 'admin'].includes(orgMembership.role)) {
        return NextResponse.json(
          { error: 'You do not have permission to update members in this organization' },
          { status: 403 }
        );
      }
    } else {
      const { data: projectMembership } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', member.project_id)
        .eq('user_id', auth.user.id)
        .maybeSingle();

      if (!projectMembership || !['owner', 'admin'].includes(projectMembership.role)) {
        return NextResponse.json(
          { error: 'You do not have permission to update members in this project' },
          { status: 403 }
        );
      }
    }

    const { data: updatedMember, error } = await supabase
      .from(table)
      .update({ role })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ member: updatedMember });
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
    const organizationId = searchParams.get('organization_id');
    const projectId = searchParams.get('project_id');

    if (!id) {
      return NextResponse.json(
        { error: 'Member ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get the member to determine which table to delete from
    let member: any = null;
    let table: string = '';

    if (organizationId) {
      const { data } = await supabase
        .from('organization_members')
        .select('*')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .single();
      member = data;
      table = 'organization_members';
    } else if (projectId) {
      const { data } = await supabase
        .from('project_members')
        .select('*')
        .eq('id', id)
        .eq('project_id', projectId)
        .single();
      member = data;
      table = 'project_members';
    }

    if (!member) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    // Verify user has permission to remove
    if (table === 'organization_members') {
      const { data: orgMembership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', member.organization_id)
        .eq('user_id', auth.user.id)
        .maybeSingle();

      if (!orgMembership || !['owner', 'admin'].includes(orgMembership.role)) {
        return NextResponse.json(
          { error: 'You do not have permission to remove members from this organization' },
          { status: 403 }
        );
      }
    } else {
      const { data: projectMembership } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', member.project_id)
        .eq('user_id', auth.user.id)
        .maybeSingle();

      if (!projectMembership || !['owner', 'admin'].includes(projectMembership.role)) {
        return NextResponse.json(
          { error: 'You do not have permission to remove members from this project' },
          { status: 403 }
        );
      }
    }

    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
