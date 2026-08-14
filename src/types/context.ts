// ============================================
// CONTEXT LAYER TYPE DEFINITIONS
// ============================================

/**
 * All entity types that can participate in the context graph
 */
export type ContextEntityType =
  | "project"
  | "task"
  | "phase"
  | "decision"
  | "file"
  | "source"
  | "memory";

/**
 * Reference to any context entity
 */
export interface ContextReference {
  entityType: ContextEntityType;
  entityId: string;
}

// ============================================
// DECISION TYPES
// ============================================

export type DecisionType =
  | "architectural"
  | "technical"
  | "product"
  | "process"
  | "business"
  | "other";

export type DecisionStatus = "proposed" | "approved" | "rejected" | "deprecated";

export interface Decision {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  decision_type: DecisionType;
  status: DecisionStatus;
  made_by: string | null;
  made_at: string | null;
  alternatives: string[]; // Rejected alternatives
  impact: string | null;
  source_type: ContextEntityType | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDecisionData {
  project_id: string;
  title: string;
  description?: string;
  decision_type: DecisionType;
  status?: DecisionStatus;
  alternatives?: string[];
  impact?: string;
  source_type?: ContextEntityType;
  source_id?: string;
}

export interface UpdateDecisionData {
  id: string;
  title?: string;
  description?: string;
  decision_type?: DecisionType;
  status?: DecisionStatus;
  made_by?: string;
  made_at?: string;
  alternatives?: string[];
  impact?: string;
  source_type?: ContextEntityType;
  source_id?: string;
}

// ============================================
// RELATION TYPES
// ============================================

export type RelationType =
  | "depends_on"
  | "blocks"
  | "implements"
  | "references"
  | "decided_by"
  | "based_on"
  | "related_to"
  | "contradicts"
  | "supersedes"
  | "part_of"
  | "contains";

export interface ContextRelation {
  id: string;
  source_type: ContextEntityType;
  source_id: string;
  target_type: ContextEntityType;
  target_id: string;
  relation_type: RelationType;
  metadata: Record<string, any>;
  created_at: string;
  created_by: string | null;
}

export interface CreateRelationData {
  source_type: ContextEntityType;
  source_id: string;
  target_type: ContextEntityType;
  target_id: string;
  relation_type: RelationType;
  metadata?: Record<string, any>;
}

export interface UpdateRelationData {
  id: string;
  relation_type?: RelationType;
  metadata?: Record<string, any>;
}

// ============================================
// SOURCE TYPES
// ============================================

export type SourceType =
  | "document"
  | "comment"
  | "commit"
  | "pull_request"
  | "issue"
  | "external_url"
  | "meeting"
  | "file"
  | "other";

export interface ContextSource {
  id: string;
  project_id: string;
  source_type: SourceType;
  source_id: string | null;
  title: string | null;
  content: string | null;
  url: string | null;
  author: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSourceData {
  project_id: string;
  source_type: SourceType;
  source_id?: string;
  title?: string;
  content?: string;
  url?: string;
  author?: string;
}

export interface UpdateSourceData {
  id: string;
  title?: string;
  content?: string;
  url?: string;
  author?: string;
}

// ============================================
// PROJECT MEMORY TYPES
// ============================================

export type MemoryType =
  | "fact"
  | "project_rule"
  | "constraint"
  | "preference"
  | "decision_summary"
  | "observation"
  | "ai_insight";

export type MemoryVerificationStatus = "verified" | "unverified" | "ai_generated";

export interface ProjectMemory {
  id: string;
  project_id: string;
  content: string;
  memory_type: MemoryType;
  source_id: string | null;
  verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  confidence: number | null; // 0-1, for AI-generated insights
}

export interface CreateMemoryData {
  project_id: string;
  content: string;
  memory_type: MemoryType;
  source_id?: string;
  verified?: boolean;
  confidence?: number;
}

export interface UpdateMemoryData {
  id: string;
  content?: string;
  memory_type?: MemoryType;
  source_id?: string;
  verified?: boolean;
  verified_by?: string;
  verified_at?: string;
  confidence?: number;
}

// ============================================
// CONTEXT GRAPH TYPES
// ============================================

export interface ContextGraphNode {
  entityType: ContextEntityType;
  entityId: string;
  label: string;
  metadata: Record<string, any>;
}

export interface ContextGraphEdge {
  source: ContextReference;
  target: ContextReference;
  relationType: RelationType;
  metadata: Record<string, any>;
}

export interface ContextGraph {
  nodes: ContextGraphNode[];
  edges: ContextGraphEdge[];
}

// ============================================
// WHY PANEL TYPES
// ============================================

export interface WhyContext {
  decision?: Decision;
  source?: ContextSource;
  relatedTasks?: Array<{ id: string; title: string }>;
  dependencies?: Array<{ id: string; title: string; relationType: RelationType }>;
  memory?: ProjectMemory[];
  relations?: ContextRelation[];
}

// ============================================
// SEARCH TYPES
// ============================================

export interface SearchResult<T> {
  entity: T;
  entityType: ContextEntityType;
  relevance: number;
  highlights: string[];
}

export interface SearchFilters {
  project_id?: string;
  entity_types?: ContextEntityType[];
  date_from?: string;
  date_to?: string;
}
