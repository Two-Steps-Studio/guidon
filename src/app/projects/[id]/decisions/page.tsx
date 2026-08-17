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
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  GitBranch,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Decision } from '@/types/context';

const STATUS_CONFIG: Record<Decision['status'], { label: string; color: string; icon: any }> = {
  proposed: { label: 'Proposed', color: 'bg-blue-100 text-blue-800', icon: Clock },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle },
  deprecated: { label: 'Deprecated', color: 'bg-yellow-100 text-yellow-800', icon: GitBranch },
};

const TYPE_COLORS: Record<Decision['decision_type'], string> = {
  technical: 'bg-purple-100 text-purple-800',
  architectural: 'bg-indigo-100 text-indigo-800',
  product: 'bg-pink-100 text-pink-800',
  business: 'bg-orange-100 text-orange-800',
  process: 'bg-teal-100 text-teal-800',
  other: 'bg-gray-100 text-gray-800',
};

export default function ProjectDecisionsPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null);
  const [decisionForm, setDecisionForm] = useState({
    title: '',
    description: '',
    impact: '',
    alternatives: [] as string[],
    status: 'proposed' as Decision['status'],
    decision_type: 'technical' as Decision['decision_type'],
  });

  useEffect(() => {
    fetchDecisions();
  }, [projectId]);

  const fetchDecisions = async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('context_decisions')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDecisions(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('context_decisions')
        .insert({
          project_id: projectId,
          title: decisionForm.title,
          description: decisionForm.description || null,
          impact: decisionForm.impact || null,
          alternatives: decisionForm.alternatives || null,
          status: decisionForm.status,
          decision_type: decisionForm.decision_type,
          // context_decisions records the author as made_by, not created_by.
          made_by: user.id,
          made_at: new Date().toISOString(),
        });

      if (error) throw error;

      setShowCreateDialog(false);
      setDecisionForm({
        title: '',
        description: '',
        impact: '',
        alternatives: [],
        status: 'proposed',
        decision_type: 'technical',
      });
      await fetchDecisions();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDecision) return;

    setEditing(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('context_decisions')
        .update({
          title: decisionForm.title,
          description: decisionForm.description || null,
          impact: decisionForm.impact || null,
          alternatives: decisionForm.alternatives || null,
          status: decisionForm.status,
          decision_type: decisionForm.decision_type,
        })
        .eq('id', selectedDecision.id);

      if (error) throw error;

      setShowEditDialog(false);
      setSelectedDecision(null);
      setDecisionForm({
        title: '',
        description: '',
        impact: '',
        alternatives: [],
        status: 'proposed',
        decision_type: 'technical',
      });
      await fetchDecisions();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEditing(false);
    }
  };

  const handleDeleteDecision = async (decisionId: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('context_decisions')
        .delete()
        .eq('id', decisionId);

      if (error) throw error;
      await fetchDecisions();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openEditDialog = (decision: Decision) => {
    setSelectedDecision(decision);
    setDecisionForm({
      title: decision.title,
      description: decision.description || '',
      impact: decision.impact || '',
      alternatives: decision.alternatives || [],
      status: decision.status,
      decision_type: decision.decision_type,
    });
    setShowEditDialog(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading decisions...</p>
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
            <h1 className="text-3xl font-bold">Decisions</h1>
            <p className="text-muted-foreground">Track important project decisions and their rationale</p>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Decision
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Decision</DialogTitle>
                <DialogDescription>
                  Record a new project decision
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateDecision} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="decisionTitle">Title</Label>
                  <Input
                    id="decisionTitle"
                    value={decisionForm.title}
                    onChange={(e) => setDecisionForm({ ...decisionForm, title: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="decisionDescription">Description</Label>
                  <Textarea
                    id="decisionDescription"
                    value={decisionForm.description}
                    onChange={(e) => setDecisionForm({ ...decisionForm, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="decisionImpact">Impact</Label>
                  <Textarea
                    id="decisionImpact"
                    value={decisionForm.impact}
                    onChange={(e) => setDecisionForm({ ...decisionForm, impact: e.target.value })}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="decisionAlternatives">Alternatives Considered</Label>
                  <Textarea
                    id="decisionAlternatives"
                    value={Array.isArray(decisionForm.alternatives) ? decisionForm.alternatives.join('\n') : ''}
                    onChange={(e) => setDecisionForm({ ...decisionForm, alternatives: e.target.value.split('\n').filter(Boolean) })}
                    rows={2}
                    placeholder="One alternative per line"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="decisionStatus">Status</Label>
                    <select
                      id="decisionStatus"
                      value={decisionForm.status}
                      onChange={(e) => setDecisionForm({ ...decisionForm, status: e.target.value as Decision['status'] })}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                        <option key={status} value={status}>{config.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="decisionType">Type</Label>
                    <select
                      id="decisionType"
                      value={decisionForm.decision_type}
                      onChange={(e) => setDecisionForm({ ...decisionForm, decision_type: e.target.value as Decision['decision_type'] })}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      <option value="technical">Technical</option>
                      <option value="architectural">Architectural</option>
                      <option value="business">Business</option>
                      <option value="process">Process</option>
                      <option value="other">Other</option>
                    </select>
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
                      'Create Decision'
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

        {/* Decisions List */}
        {decisions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No decisions yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Record important project decisions to preserve context and rationale
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Decision
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {decisions.map(decision => {
              const statusConfig = STATUS_CONFIG[decision.status];
              const StatusIcon = statusConfig.icon;

              return (
                <Card key={decision.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <CardTitle className="text-xl">{decision.title}</CardTitle>
                          <Badge className={statusConfig.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig.label}
                          </Badge>
                          <Badge className={TYPE_COLORS[decision.decision_type]}>
                            {decision.decision_type}
                          </Badge>
                        </div>
                        {decision.description && (
                          <CardDescription>{decision.description}</CardDescription>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(decision)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteDecision(decision.id)}
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
                    <div className="grid gap-4 md:grid-cols-2">
                      {decision.impact && (
                        <div>
                          <h4 className="text-sm font-semibold mb-1">Impact</h4>
                          <p className="text-sm text-muted-foreground">{decision.impact}</p>
                        </div>
                      )}
                      {decision.alternatives && (
                        <div>
                          <h4 className="text-sm font-semibold mb-1">Alternatives Considered</h4>
                          <p className="text-sm text-muted-foreground">{decision.alternatives}</p>
                        </div>
                      )}
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
              <DialogTitle>Edit Decision</DialogTitle>
              <DialogDescription>
                Update decision information
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateDecision} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editTitle">Title</Label>
                <Input
                  id="editTitle"
                  value={decisionForm.title}
                  onChange={(e) => setDecisionForm({ ...decisionForm, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editDescription">Description</Label>
                <Textarea
                  id="editDescription"
                  value={decisionForm.description}
                  onChange={(e) => setDecisionForm({ ...decisionForm, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editImpact">Impact</Label>
                <Textarea
                  id="editImpact"
                  value={decisionForm.impact}
                  onChange={(e) => setDecisionForm({ ...decisionForm, impact: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editAlternatives">Alternatives Considered</Label>
                <Textarea
                  id="editAlternatives"
                  value={Array.isArray(decisionForm.alternatives) ? decisionForm.alternatives.join('\n') : ''}
                  onChange={(e) => setDecisionForm({ ...decisionForm, alternatives: e.target.value.split('\n').filter(Boolean) })}
                  rows={2}
                  placeholder="One alternative per line"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editStatus">Status</Label>
                  <select
                    id="editStatus"
                    value={decisionForm.status}
                    onChange={(e) => setDecisionForm({ ...decisionForm, status: e.target.value as Decision['status'] })}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                      <option key={status} value={status}>{config.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editType">Type</Label>
                  <select
                    id="editType"
                    value={decisionForm.decision_type}
                    onChange={(e) => setDecisionForm({ ...decisionForm, decision_type: e.target.value as Decision['decision_type'] })}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="technical">Technical</option>
                    <option value="architectural">Architectural</option>
                    <option value="business">Business</option>
                    <option value="process">Process</option>
                    <option value="other">Other</option>
                  </select>
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
