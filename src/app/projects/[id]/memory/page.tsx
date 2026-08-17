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
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2,
  AlertCircle,
  Plus,
  MoreVertical,
  Trash2,
  Edit,
  Brain,
  FileText,
  Lightbulb,
  BookOpen,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { ProjectMemory } from '@/types/context';

const MEMORY_TYPE_CONFIG: Record<ProjectMemory['memory_type'], { label: string; color: string; icon: any }> = {
  fact: { label: 'Fact', color: 'bg-blue-100 text-blue-800', icon: FileText },
  project_rule: { label: 'Rule', color: 'bg-purple-100 text-purple-800', icon: CheckCircle2 },
  constraint: { label: 'Constraint', color: 'bg-red-100 text-red-800', icon: AlertTriangle },
  preference: { label: 'Preference', color: 'bg-green-100 text-green-800', icon: Clock },
  decision_summary: { label: 'Decision', color: 'bg-yellow-100 text-yellow-800', icon: FileText },
  observation: { label: 'Observation', color: 'bg-gray-100 text-gray-800', icon: BookOpen },
  ai_insight: { label: 'AI Insight', color: 'bg-indigo-100 text-indigo-800', icon: Lightbulb },
};

export default function ProjectMemoryPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [memories, setMemories] = useState<ProjectMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<ProjectMemory | null>(null);
  const [memoryForm, setMemoryForm] = useState({
    content: '',
    memory_type: 'fact' as ProjectMemory['memory_type'],
  });

  useEffect(() => {
    fetchMemories();
  }, [projectId]);

  const fetchMemories = async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('project_memory')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMemories(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('project_memory')
        .insert({
          project_id: projectId,
          content: memoryForm.content,
          memory_type: memoryForm.memory_type,
          created_by: user.id,
        });

      if (error) throw error;

      setShowCreateDialog(false);
      setMemoryForm({ content: '', memory_type: 'fact' });
      await fetchMemories();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemory) return;

    setEditing(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('project_memory')
        .update({
          content: memoryForm.content,
          memory_type: memoryForm.memory_type,
        })
        .eq('id', selectedMemory.id);

      if (error) throw error;

      setShowEditDialog(false);
      setSelectedMemory(null);
      setMemoryForm({ content: '', memory_type: 'fact' });
      await fetchMemories();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEditing(false);
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('project_memory')
        .delete()
        .eq('id', memoryId);

      if (error) throw error;
      await fetchMemories();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openEditDialog = (memory: ProjectMemory) => {
    setSelectedMemory(memory);
    setMemoryForm({
      content: memory.content,
      memory_type: memory.memory_type,
    });
    setShowEditDialog(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading memory...</p>
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
            <h1 className="text-3xl font-bold">Memory</h1>
            <p className="text-muted-foreground">Persistent project knowledge and insights</p>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Memory
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Memory</DialogTitle>
                <DialogDescription>
                  Add a new memory entry to the project
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateMemory} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="memoryContent">Content</Label>
                  <Textarea
                    id="memoryContent"
                    value={memoryForm.content}
                    onChange={(e) => setMemoryForm({ ...memoryForm, content: e.target.value })}
                    rows={4}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="memoryType">Type</Label>
                  <select
                    id="memoryType"
                    value={memoryForm.memory_type}
                    onChange={(e) => setMemoryForm({ ...memoryForm, memory_type: e.target.value as ProjectMemory['memory_type'] })}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    {Object.entries(MEMORY_TYPE_CONFIG).map(([type, config]) => (
                      <option key={type} value={type}>{config.label}</option>
                    ))}
                  </select>
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
                    onClick={() => setShowCreateDialog(false)}
                    disabled={creating}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating}>
                    {creating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create Memory'
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

        {/* Memory List */}
        {memories.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Brain className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No memories yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Start capturing project knowledge and insights
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Memory
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {memories.map(memory => {
              const typeConfig = MEMORY_TYPE_CONFIG[memory.memory_type];
              const TypeIcon = typeConfig.icon;

              return (
                <Card key={memory.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <TypeIcon className="h-5 w-5 text-muted-foreground" />
                          <Badge className={typeConfig.color}>
                            {typeConfig.label}
                          </Badge>
                        </div>
                        <CardDescription className="text-base whitespace-pre-wrap">
                          {memory.content}
                        </CardDescription>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(memory)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteMemory(memory.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(memory.created_at).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Memory</DialogTitle>
              <DialogDescription>
                Update memory entry
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateMemory} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editContent">Content</Label>
                <Textarea
                  id="editContent"
                  value={memoryForm.content}
                  onChange={(e) => setMemoryForm({ ...memoryForm, content: e.target.value })}
                  rows={4}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editType">Type</Label>
                <select
                  id="editType"
                  value={memoryForm.memory_type}
                  onChange={(e) => setMemoryForm({ ...memoryForm, memory_type: e.target.value as ProjectMemory['memory_type'] })}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {Object.entries(MEMORY_TYPE_CONFIG).map(([type, config]) => (
                    <option key={type} value={type}>{config.label}</option>
                  ))}
                </select>
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
    </>
  );
}
