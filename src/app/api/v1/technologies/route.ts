import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { requireAuth, isAuthError } from '@/lib/auth/auth-helpers';
import type {
  CreateTechnologyData,
  UpdateTechnologyData,
} from '@/types/technology';
import {
  DEFAULT_TECHNOLOGY_CATEGORY,
  TECHNOLOGY_CATEGORIES,
  guessTechnologyCategory,
  technologySlug,
} from '@/types/technology';

const MANAGE_ROLES = ['owner', 'admin'];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected server error';
}

/**
 * Resolve the caller's role on a project, or null when they are not a member.
 * RLS already guards every statement below; these checks exist so the API can
 * answer with an accurate 403 instead of an empty result set.
 */
async function projectRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  return data?.role ?? null;
}

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

    const { data, error } = await supabase
      .from('technologies')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ technologies: data || [] });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body: CreateTechnologyData = await request.json();
    const { project_id, name, version, category, description, sort_order } =
      body;

    if (!project_id || !name?.trim()) {
      return NextResponse.json(
        { error: 'project_id and name are required' },
        { status: 400 }
      );
    }

    if (category && !TECHNOLOGY_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `Unknown category: ${category}` },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const role = await projectRole(supabase, project_id, auth.user.id);

    if (!role || !MANAGE_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'You do not have permission to manage technologies' },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from('technologies')
      .insert({
        project_id,
        name: name.trim(),
        icon_slug: body.icon_slug ?? technologySlug(name),
        version: version || null,
        // category is NOT NULL in the database; fall back rather than insert null.
        category: category || guessTechnologyCategory(name),
        description: description || null,
        sort_order: sort_order ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ technology: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body: UpdateTechnologyData = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Technology ID is required' },
        { status: 400 }
      );
    }

    if (body.category && !TECHNOLOGY_CATEGORIES.includes(body.category)) {
      return NextResponse.json(
        { error: `Unknown category: ${body.category}` },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from('technologies')
      .select('project_id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { error: 'Technology not found' },
        { status: 404 }
      );
    }

    const role = await projectRole(supabase, existing.project_id, auth.user.id);

    if (!role || !MANAGE_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'You do not have permission to manage technologies' },
        { status: 403 }
      );
    }

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.icon_slug !== undefined) patch.icon_slug = body.icon_slug;
    if (body.version !== undefined) patch.version = body.version || null;
    if (body.category !== undefined)
      patch.category = body.category || DEFAULT_TECHNOLOGY_CATEGORY;
    if (body.description !== undefined)
      patch.description = body.description || null;
    if (body.sort_order !== undefined) patch.sort_order = body.sort_order;

    const { data, error } = await supabase
      .from('technologies')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ technology: data });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
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
        { error: 'Technology ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from('technologies')
      .select('project_id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { error: 'Technology not found' },
        { status: 404 }
      );
    }

    const role = await projectRole(supabase, existing.project_id, auth.user.id);

    if (!role || !MANAGE_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'You do not have permission to manage technologies' },
        { status: 403 }
      );
    }

    const { error } = await supabase.from('technologies').delete().eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
