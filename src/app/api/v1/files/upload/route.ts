import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { requireAuth, isAuthError } from '@/lib/auth/auth-helpers';
import { uploadProjectFile } from '@/lib/storage/storage';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const projectId = formData.get('project_id') as string;
    const category = formData.get('category') as string || 'other';
    const uploadedBy = formData.get('uploaded_by') as string;

    if (!file || !projectId) {
      return NextResponse.json({ error: 'Missing file or project_id' }, { status: 400 });
    }

    const supabase = await createClient();

    // Verify user has access to the project
    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (!membership || !['owner', 'admin', 'developer'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to upload files to this project' },
        { status: 403 }
      );
    }

    // Upload to storage
    const uploadResult = await uploadProjectFile(
      projectId,
      file,
      category as any,
      auth.user.id
    );

    // Save to database
    const { data, error } = await supabase
      .from('project_files')
      .insert({
        project_id: projectId,
        name: file.name,
        storage_path: uploadResult.path,
        size_bytes: file.size,
        mime_type: file.type,
        category: category as any,
        uploaded_by: uploadedBy || auth.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ file: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
