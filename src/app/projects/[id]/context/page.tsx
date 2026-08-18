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
  Link2,
  FileText,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Decision, ContextRelation, ContextSource } from '@/types/context';
import { fetchProjectRelations } from '@/lib/context/project-relations';
import { useProjectAccess } from "@/contexts/project-access-context";

type TabType = 'decisions' | 'relations' | 'sources';

export default function ProjectContextPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  // Identity resolved server-side in /projects/[id]/layout.tsx.
  const { userId } = useProjectAccess();

  const [activeTab, setActiveTab] = useState<TabType>('decisions');
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [relations, setRelations] = useState<ContextRelation[]>([]);
  const [sources, setSources] = useState<ContextSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Decision form state
  const [showDecisionDialog, setShowDecisionDialog] = useState(false);
  const [editingDecision, setEditingDecision] = useState<Decision | null>(null);
  const [decisionForm, setDecisionForm] = useState({
    title: '',
    description: '',
    impact: '',
    alternatives: [] as string[],
    status: 'proposed' as Decision['status'],
    decision_type: 'technical' as Decision['decision_type'],
  });
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);

  // Relation form state
  const [showRelationDialog, setShowRelationDialog] = useState(false);
  const [editingRelation, setEditingRelation] = useState<ContextRelation | null>(null);
  const [relationForm, setRelationForm] = useState({
    source_type: 'decision',
    source_id: '',
    target_type: 'task',
    target_id: '',
    relation_type: 'depends_on',
  });
  const [relationSubmitting, setRelationSubmitting] = useState(false);

  // Source form state
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [editingSource, setEditingSource] = useState<ContextSource | null>(null);
  const [sourceForm, setSourceForm] = useState({
    title: '',
    content: '',
    source_type: 'document',
    url: '',
  });
  const [sourceSubmitting, setSourceSubmitting] = useState(false);

  useEffect(() => {
    fetchAllData();
  }, [projectId]);

  const fetchAllData = async () => {
    try {
      const supabase = createClient();

      // context_relations has no project_id column — relations are scoped
      // through their source entity. See lib/context/project-relations.ts.
      const [decisionsRes, sourcesRes, projectRelations] = await Promise.all([
        supabase.from('context_decisions').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('context_sources').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        fetchProjectRelations(supabase, projectId),
      ]);

      if (decisionsRes.error) throw decisionsRes.error;
      if (sourcesRes.error) throw sourcesRes.error;

      setDecisions(decisionsRes.data || []);
      setRelations(projectRelations);
      setSources(sourcesRes.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Decision handlers
  const handleCreateDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    setDecisionSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
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
          made_by: userId,
          made_at: new Date().toISOString(),
        });

      if (error) throw error;
      setShowDecisionDialog(false);
      setDecisionForm({ title: '', description: '', impact: '', alternatives: [], status: 'proposed', decision_type: 'technical' });
      await fetchAllData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDecisionSubmitting(false);
    }
  };

  const handleUpdateDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDecision) return;
    setDecisionSubmitting(true);
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
        .eq('id', editingDecision.id);

      if (error) throw error;
      setShowDecisionDialog(false);
      setEditingDecision(null);
      setDecisionForm({ title: '', description: '', impact: '', alternatives: [], status: 'proposed', decision_type: 'technical' });
      await fetchAllData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDecisionSubmitting(false);
    }
  };

  const handleDeleteDecision = async (id: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase.from('context_decisions').delete().eq('id', id);
      if (error) throw error;
      await fetchAllData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openEditDecision = (decision: Decision) => {
    setEditingDecision(decision);
    setDecisionForm({
      title: decision.title,
      description: decision.description || '',
      impact: decision.impact || '',
      alternatives: decision.alternatives || [],
      status: decision.status,
      decision_type: decision.decision_type,
    });
    setShowDecisionDialog(true);
  };

  // Relation handlers
  const handleCreateRelation = async (e: React.FormEvent) => {
    e.preventDefault();
    setRelationSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      // No project_id column here — the source entity anchors the relation,
      // and RLS requires source and target to resolve to the same project.
      const { error } = await supabase
        .from('context_relations')
        .insert({
          source_type: relationForm.source_type,
          source_id: relationForm.source_id,
          target_type: relationForm.target_type,
          target_id: relationForm.target_id,
          relation_type: relationForm.relation_type,
          created_by: userId,
        });

      if (error) throw error;
      setShowRelationDialog(false);
      setRelationForm({ source_type: 'decision', source_id: '', target_type: 'task', target_id: '', relation_type: 'depends_on' });
      await fetchAllData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRelationSubmitting(false);
    }
  };

  const handleDeleteRelation = async (id: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase.from('context_relations').delete().eq('id', id);
      if (error) throw error;
      await fetchAllData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Source handlers
  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    setSourceSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('context_sources')
        .insert({
          project_id: projectId,
          title: sourceForm.title,
          content: sourceForm.content || null,
          source_type: sourceForm.source_type,
          url: sourceForm.url || null,
          // context_sources records the author as `author`, not created_by.
          author: userId,
        });

      if (error) throw error;
      setShowSourceDialog(false);
      setSourceForm({ title: '', content: '', source_type: 'document', url: '' });
      await fetchAllData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSourceSubmitting(false);
    }
  };

  const handleUpdateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSource) return;
    setSourceSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('context_sources')
        .update({
          title: sourceForm.title,
          content: sourceForm.content || null,
          source_type: sourceForm.source_type,
          url: sourceForm.url || null,
        })
        .eq('id', editingSource.id);

      if (error) throw error;
      setShowSourceDialog(false);
      setEditingSource(null);
      setSourceForm({ title: '', content: '', source_type: 'document', url: '' });
      await fetchAllData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSourceSubmitting(false);
    }
  };

  const handleDeleteSource = async (id: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase.from('context_sources').delete().eq('id', id);
      if (error) throw error;
      await fetchAllData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openEditSource = (source: ContextSource) => {
    setEditingSource(source);
    setSourceForm({
      title: source.title || '',
      content: source.content || '',
      source_type: source.source_type,
      url: source.url || '',
    });
    setShowSourceDialog(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading context...</p>
        </div>
      </div>
    );
  }

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'decisions', label: 'Decisions', count: decisions.length },
    { key: 'relations', label: 'Relations', count: relations.length },
    { key: 'sources', label: 'Sources', count: sources.length },
  ];

  return (
    <>
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Context Layer</h1>
          <p className="text-muted-foreground">Project knowledge, decisions, and relationships</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive rounded-lg flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 font-medium transition-colors relative ${
                activeTab === tab.key
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              <Badge variant="secondary" className="ml-2">{tab.count}</Badge>
            </button>
          ))}
        </div>

        {/* Decisions Tab */}
        {activeTab === 'decisions' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Decisions</h2>
              <Dialog open={showDecisionDialog} onOpenChange={setShowDecisionDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    New Decision
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingDecision ? 'Edit Decision' : 'New Decision'}</DialogTitle>
                    <DialogDescription>
                      {editingDecision ? 'Update decision information' : 'Record a new project decision'}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={editingDecision ? handleUpdateDecision : handleCreateDecision} className="space-y-4">
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
                          <option value="proposed">Proposed</option>
                          <option value="accepted">Accepted</option>
                          <option value="rejected">Rejected</option>
                          <option value="superseded">Superseded</option>
                          <option value="deprecated">Deprecated</option>
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
                      <Button type="button" variant="outline" onClick={() => setShowDecisionDialog(false)} disabled={decisionSubmitting}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={decisionSubmitting}>
                        {decisionSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {editingDecision ? 'Saving...' : 'Creating...'}
                          </>
                        ) : (
                          editingDecision ? 'Save Changes' : 'Create Decision'
                        )}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {decisions.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No decisions yet</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Record important project decisions to preserve context
                  </p>
                  <Button onClick={() => setShowDecisionDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Decision
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {decisions.map(decision => (
                  <Card key={decision.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <CardTitle className="text-lg">{decision.title}</CardTitle>
                            <Badge variant="outline">{decision.decision_type}</Badge>
                            <Badge className={
                              decision.status === 'approved' ? 'bg-green-100 text-green-800' :
                              decision.status === 'rejected' ? 'bg-red-100 text-red-800' :
                              decision.status === 'deprecated' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-blue-100 text-blue-800'
                            }>
                              {decision.status}
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
                            <DropdownMenuItem onClick={() => openEditDecision(decision)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteDecision(decision.id)} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {decision.impact && (
                        <div className="mb-3">
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
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Relations Tab */}
        {activeTab === 'relations' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Relations</h2>
              <Dialog open={showRelationDialog} onOpenChange={setShowRelationDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    New Relation
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Relation</DialogTitle>
                    <DialogDescription>
                      Link two project entities together
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateRelation} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="sourceType">Source Type</Label>
                      <select
                        id="sourceType"
                        value={relationForm.source_type}
                        onChange={(e) => setRelationForm({ ...relationForm, source_type: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md"
                      >
                        <option value="decision">Decision</option>
                        <option value="source">Source</option>
                        <option value="task">Task</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sourceId">Source ID</Label>
                      <Input
                        id="sourceId"
                        value={relationForm.source_id}
                        onChange={(e) => setRelationForm({ ...relationForm, source_id: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="targetType">Target Type</Label>
                      <select
                        id="targetType"
                        value={relationForm.target_type}
                        onChange={(e) => setRelationForm({ ...relationForm, target_type: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md"
                      >
                        <option value="task">Task</option>
                        <option value="decision">Decision</option>
                        <option value="source">Source</option>
                        <option value="memory">Memory</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="targetId">Target ID</Label>
                      <Input
                        id="targetId"
                        value={relationForm.target_id}
                        onChange={(e) => setRelationForm({ ...relationForm, target_id: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="relationType">Relation Type</Label>
                      <select
                        id="relationType"
                        value={relationForm.relation_type}
                        onChange={(e) => setRelationForm({ ...relationForm, relation_type: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md"
                      >
                        <option value="depends_on">Depends On</option>
                        <option value="references">References</option>
                        <option value="related_to">Related To</option>
                        <option value="blocks">Blocks</option>
                        <option value="supersedes">Supersedes</option>
                      </select>
                    </div>
                    {error && (
                      <div className="text-sm text-destructive flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setShowRelationDialog(false)} disabled={relationSubmitting}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={relationSubmitting}>
                        {relationSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          'Create Relation'
                        )}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {relations.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Link2 className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No relations yet</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Create relations to link project entities together
                  </p>
                  <Button onClick={() => setShowRelationDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Relation
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {relations.map(relation => (
                  <Card key={relation.id}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-4">
                        <Badge variant="outline">{relation.source_type}</Badge>
                        <span className="text-sm text-muted-foreground">{relation.source_id.slice(0, 8)}...</span>
                        <span className="text-sm font-medium">{relation.relation_type}</span>
                        <Badge variant="outline">{relation.target_type}</Badge>
                        <span className="text-sm text-muted-foreground">{relation.target_id.slice(0, 8)}...</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteRelation(relation.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sources Tab */}
        {activeTab === 'sources' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Sources</h2>
              <Dialog open={showSourceDialog} onOpenChange={setShowSourceDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    New Source
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingSource ? 'Edit Source' : 'New Source'}</DialogTitle>
                    <DialogDescription>
                      {editingSource ? 'Update source information' : 'Add a new knowledge source'}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={editingSource ? handleUpdateSource : handleCreateSource} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="sourceTitle">Title</Label>
                      <Input
                        id="sourceTitle"
                        value={sourceForm.title}
                        onChange={(e) => setSourceForm({ ...sourceForm, title: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sourceContent">Content</Label>
                      <Textarea
                        id="sourceContent"
                        value={sourceForm.content}
                        onChange={(e) => setSourceForm({ ...sourceForm, content: e.target.value })}
                        rows={4}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sourceType">Type</Label>
                      <select
                        id="sourceType"
                        value={sourceForm.source_type}
                        onChange={(e) => setSourceForm({ ...sourceForm, source_type: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md"
                      >
                        <option value="document">Document</option>
                        <option value="url">URL</option>
                        <option value="note">Note</option>
                        <option value="code">Code</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sourceUrl">URL (optional)</Label>
                      <Input
                        id="sourceUrl"
                        value={sourceForm.url}
                        onChange={(e) => setSourceForm({ ...sourceForm, url: e.target.value })}
                      />
                    </div>
                    {error && (
                      <div className="text-sm text-destructive flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setShowSourceDialog(false)} disabled={sourceSubmitting}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={sourceSubmitting}>
                        {sourceSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {editingSource ? 'Saving...' : 'Creating...'}
                          </>
                        ) : (
                          editingSource ? 'Save Changes' : 'Create Source'
                        )}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {sources.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No sources yet</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Add knowledge sources to build project context
                  </p>
                  <Button onClick={() => setShowSourceDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Source
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {sources.map(source => (
                  <Card key={source.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <CardTitle className="text-lg">{source.title}</CardTitle>
                            <Badge variant="outline">{source.source_type}</Badge>
                          </div>
                          {source.url && (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {source.url}
                            </a>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditSource(source)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteSource(source.id)} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    {source.content && (
                      <CardContent>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{source.content}</p>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
