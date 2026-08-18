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
  Plus,
  MoreVertical,
  Calendar,
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Trash2,
  Edit
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { RoadmapPhase, PhaseStatus } from '@/types/task';
import { useProjectAccess } from "@/contexts/project-access-context";

const STATUS_CONFIG: Record<PhaseStatus, { label: string; color: string; icon: any }> = {
  planned: { label: 'Planned', color: 'bg-blue-100 text-blue-800', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  blocked: { label: 'Blocked', color: 'bg-red-100 text-red-800', icon: AlertTriangle },
};

export default function ProjectRoadmapPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  // Identity resolved server-side in /projects/[id]/layout.tsx.
  const { userId } = useProjectAccess();

  const [phases, setPhases] = useState<RoadmapPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<RoadmapPhase | null>(null);
  const [phaseForm, setPhaseForm] = useState({
    name: '',
    description: '',
    start_date: '',
    planned_end_date: '',
    status: 'planned' as PhaseStatus,
    completion_percentage: 0,
  });

  useEffect(() => {
    fetchPhases();
  }, [projectId]);

  const fetchPhases = async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('roadmap_phases')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true, nullsFirst: false });

      if (error) throw error;
      setPhases(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePhase = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const supabase = createClient();
      const maxSortOrder = phases.length > 0 ? Math.max(...phases.map(p => p.sort_order || 0)) : 0;

      const { error } = await supabase
        .from('roadmap_phases')
        .insert({
          project_id: projectId,
          name: phaseForm.name,
          description: phaseForm.description || null,
          start_date: phaseForm.start_date || null,
          planned_end_date: phaseForm.planned_end_date || null,
          status: phaseForm.status,
          completion_percentage: phaseForm.completion_percentage,
          sort_order: maxSortOrder + 1,
          created_by: userId,
        });

      if (error) throw error;

      setShowCreateDialog(false);
      setPhaseForm({
        name: '',
        description: '',
        start_date: '',
        planned_end_date: '',
        status: 'planned',
        completion_percentage: 0,
      });
      await fetchPhases();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdatePhase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPhase) return;

    setEditing(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('roadmap_phases')
        .update({
          name: phaseForm.name,
          description: phaseForm.description || null,
          start_date: phaseForm.start_date || null,
          planned_end_date: phaseForm.planned_end_date || null,
          status: phaseForm.status,
          completion_percentage: phaseForm.completion_percentage,
        })
        .eq('id', selectedPhase.id);

      if (error) throw error;

      setShowEditDialog(false);
      setSelectedPhase(null);
      setPhaseForm({
        name: '',
        description: '',
        start_date: '',
        planned_end_date: '',
        status: 'planned',
        completion_percentage: 0,
      });
      await fetchPhases();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEditing(false);
    }
  };

  const handleDeletePhase = async (phaseId: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('roadmap_phases')
        .delete()
        .eq('id', phaseId);

      if (error) throw error;
      await fetchPhases();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openEditDialog = (phase: RoadmapPhase) => {
    setSelectedPhase(phase);
    setPhaseForm({
      name: phase.name,
      description: phase.description || '',
      start_date: phase.start_date || '',
      planned_end_date: phase.planned_end_date || '',
      status: phase.status,
      completion_percentage: phase.completion_percentage,
    });
    setShowEditDialog(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading roadmap...</p>
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
            <h1 className="text-3xl font-bold">Roadmap</h1>
            <p className="text-muted-foreground">Project phases and timeline</p>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Phase
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Phase</DialogTitle>
                <DialogDescription>
                  Add a new phase to the roadmap
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreatePhase} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phaseName">Phase Name</Label>
                  <Input
                    id="phaseName"
                    value={phaseForm.name}
                    onChange={(e) => setPhaseForm({ ...phaseForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phaseDescription">Description</Label>
                  <Input
                    id="phaseDescription"
                    value={phaseForm.description}
                    onChange={(e) => setPhaseForm({ ...phaseForm, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={phaseForm.start_date}
                      onChange={(e) => setPhaseForm({ ...phaseForm, start_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">Planned End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={phaseForm.planned_end_date}
                      onChange={(e) => setPhaseForm({ ...phaseForm, planned_end_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phaseStatus">Status</Label>
                    <select
                      id="phaseStatus"
                      value={phaseForm.status}
                      onChange={(e) => setPhaseForm({ ...phaseForm, status: e.target.value as PhaseStatus })}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                        <option key={status} value={status}>{config.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="completion">Completion %</Label>
                    <Input
                      id="completion"
                      type="number"
                      min="0"
                      max="100"
                      value={phaseForm.completion_percentage}
                      onChange={(e) => setPhaseForm({ ...phaseForm, completion_percentage: parseInt(e.target.value) || 0 })}
                    />
                  </div>
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
                      'Create Phase'
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

        {/* Roadmap Timeline */}
        {phases.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No roadmap phases yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first phase to start planning your project timeline
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Phase
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {phases.map((phase, index) => {
              const config = STATUS_CONFIG[phase.status];
              const Icon = config.icon;

              return (
                <Card key={phase.id} className="relative">
                  <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
                  <div className="absolute left-4 top-6 w-4 h-4 rounded-full bg-primary border-4 border-background z-10" />

                  <CardHeader className="pl-12">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <CardTitle className="text-xl">{phase.name}</CardTitle>
                          <Badge className={config.color}>
                            <Icon className="h-3 w-3 mr-1" />
                            {config.label}
                          </Badge>
                        </div>
                        {phase.description && (
                          <CardDescription>{phase.description}</CardDescription>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(phase)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeletePhase(phase.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="pl-12">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Start:</span>
                        <span>{phase.start_date ? new Date(phase.start_date).toLocaleDateString() : 'Not set'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">End:</span>
                        <span>{phase.planned_end_date ? new Date(phase.planned_end_date).toLocaleDateString() : 'Not set'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Progress:</span>
                        <span>{phase.completion_percentage}%</span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-4">
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${phase.completion_percentage}%` }}
                        />
                      </div>
                    </div>
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
              <DialogTitle>Edit Phase</DialogTitle>
              <DialogDescription>
                Update phase information
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdatePhase} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editName">Phase Name</Label>
                <Input
                  id="editName"
                  value={phaseForm.name}
                  onChange={(e) => setPhaseForm({ ...phaseForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editDescription">Description</Label>
                <Input
                  id="editDescription"
                  value={phaseForm.description}
                  onChange={(e) => setPhaseForm({ ...phaseForm, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editStartDate">Start Date</Label>
                  <Input
                    id="editStartDate"
                    type="date"
                    value={phaseForm.start_date}
                    onChange={(e) => setPhaseForm({ ...phaseForm, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editEndDate">Planned End Date</Label>
                  <Input
                    id="editEndDate"
                    type="date"
                    value={phaseForm.planned_end_date}
                    onChange={(e) => setPhaseForm({ ...phaseForm, planned_end_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editStatus">Status</Label>
                  <select
                    id="editStatus"
                    value={phaseForm.status}
                    onChange={(e) => setPhaseForm({ ...phaseForm, status: e.target.value as PhaseStatus })}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                      <option key={status} value={status}>{config.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editCompletion">Completion %</Label>
                  <Input
                    id="editCompletion"
                    type="number"
                    min="0"
                    max="100"
                    value={phaseForm.completion_percentage}
                    onChange={(e) => setPhaseForm({ ...phaseForm, completion_percentage: parseInt(e.target.value) || 0 })}
                  />
                </div>
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
