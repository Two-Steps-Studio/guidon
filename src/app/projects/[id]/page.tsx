'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  AlertCircle,
  ArrowLeft,
  FolderKanban,
  Settings,
  CheckCircle2,
  Clock,
  TrendingUp,
  FileText,
  Brain,
  Network,
  Calendar,
  Users,
  Plus
} from 'lucide-react';
import type { Project, ProjectStats } from '@/types/project';

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '' });

  useEffect(() => {
    fetchProjectData();
  }, [projectId]);

  const fetchProjectData = async () => {
    try {
      const supabase = createClient();

      // The profile fetch that used to live here fed a `user` state nothing
      // ever rendered — the header it belonged to moved into the layout. It
      // was one wasted round-trip per visit.

      // Fetch project
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select(`
          *,
          organizations (
            id,
            name
          )
        `)
        .eq('id', projectId)
        .single();

      if (projectError) throw projectError;
      setProject(projectData);

      // Fetch project stats
      const [tasksRes, phasesRes, filesRes, decisionsRes, memoryRes] = await Promise.all([
        supabase.from('tasks').select('id, status').eq('project_id', projectId),
        supabase.from('roadmap_phases').select('id, status').eq('project_id', projectId),
        supabase.from('project_files').select('id').eq('project_id', projectId),
        supabase.from('context_decisions').select('id').eq('project_id', projectId),
        supabase.from('project_memory').select('id').eq('project_id', projectId),
      ]);

      const totalTasks = tasksRes.data?.length || 0;
      const completedTasks = tasksRes.data?.filter(t => t.status === 'completed').length || 0;
      const inProgressTasks = tasksRes.data?.filter(t => t.status === 'in_progress').length || 0;

      const totalPhases = phasesRes.data?.length || 0;
      const completedPhases = phasesRes.data?.filter(p => p.status === 'completed').length || 0;

      setStats({
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        in_progress_tasks: inProgressTasks,
        total_phases: totalPhases,
        completed_phases: completedPhases,
        total_files: filesRes.data?.length || 0,
        total_decisions: decisionsRes.data?.length || 0,
        total_memory: memoryRes.data?.length || 0,
        completion_percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditing(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('projects')
        .update({
          name: editForm.name,
          description: editForm.description || null,
        })
        .eq('id', projectId);

      if (error) throw error;

      setShowEditDialog(false);
      await fetchProjectData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEditing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading project...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 mx-auto mb-4 text-destructive" />
          <p className="text-destructive">Project not found</p>
          <Button onClick={() => router.back()} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{project.name}</h1>
              <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                {project.status}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">{project.description || 'No description'}</p>
          </div>
          <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                Edit Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Project</DialogTitle>
                <DialogDescription>
                  Update project information
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleEditProject} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="editName">Project Name</Label>
                  <Input
                    id="editName"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editDescription">Description</Label>
                  <Input
                    id="editDescription"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  />
                </div>
                {error && (
                  <div className="text-sm text-destructive flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowEditDialog(false)}
                    disabled={editing}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={editing}>
                    {editing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive rounded-lg flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Stats Grid */}
        {stats && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_tasks}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.completed_tasks} completed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">In Progress</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.in_progress_tasks}</div>
                <p className="text-xs text-muted-foreground">
                  Active tasks
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completion</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.completion_percentage}%</div>
                <p className="text-xs text-muted-foreground">
                  Project progress
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Roadmap</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.completed_phases}/{stats.total_phases}</div>
                <p className="text-xs text-muted-foreground">
                  Phases completed
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Quick Access */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Quick Access</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => router.push(`/projects/${projectId}/tasks`)}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderKanban className="h-5 w-5" />
                  Tasks
                </CardTitle>
                <CardDescription>Manage and track project tasks</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  {stats?.total_tasks || 0} tasks
                </div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => router.push(`/projects/${projectId}/roadmap`)}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Roadmap
                </CardTitle>
                <CardDescription>Project phases and timeline</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4 mr-1" />
                  {stats?.total_phases || 0} phases
                </div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => router.push(`/projects/${projectId}/context`)}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5" />
                  Context
                </CardTitle>
                <CardDescription>Decisions, relations, and sources</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Brain className="h-4 w-4 mr-1" />
                  {stats?.total_decisions || 0} decisions
                </div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => router.push(`/projects/${projectId}/memory`)}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  Memory
                </CardTitle>
                <CardDescription>Project knowledge and insights</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                  <FileText className="h-4 w-4 mr-1" />
                  {stats?.total_memory || 0} items
                </div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => router.push(`/projects/${projectId}/files`)}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Files
                </CardTitle>
                <CardDescription>Project documents and assets</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                  <FileText className="h-4 w-4 mr-1" />
                  {stats?.total_files || 0} files
                </div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => router.push(`/projects/${projectId}/settings`)}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Settings
                </CardTitle>
                <CardDescription>Project configuration</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Users className="h-4 w-4 mr-1" />
                  Manage team
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
