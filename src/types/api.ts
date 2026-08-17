// ============================================
// API TYPE DEFINITIONS
// ============================================

export interface ApiResponse<T> {
  data: T;
  error?: string;
  message?: string;
}

export interface ApiError {
  error: string;
  details?: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

export interface PaginationParams {
  page?: number;
  per_page?: number;
}

// ============================================
// API REQUEST TYPES
// ============================================

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
}

// ============================================
// AUTH TYPES
// ============================================

export interface AuthUser {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
}

export interface AuthSession {
  user: AuthUser;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface SignUpData {
  email: string;
  password: string;
  full_name?: string;
}

export interface SignInData {
  email: string;
  password: string;
}

// ============================================
// INVITATION TYPES
// ============================================

export type InviteStatus = "pending" | "accepted" | "rejected" | "expired" | "cancelled";

export interface Invitation {
  id: string;
  organization_id: string | null;
  project_id: string | null;
  email: string;
  role: string;
  status: InviteStatus;
  token: string;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface CreateInviteData {
  email: string;
  organization_id?: string;
  project_id?: string;
  role: string;
  expires_in_hours?: number;
}

// ============================================
// ACTIVITY LOG TYPES
// ============================================

export type ActivityAction =
  | "project_created"
  | "project_updated"
  | "project_archived"
  | "project_deleted"
  | "task_created"
  | "task_updated"
  | "task_deleted"
  | "task_status_changed"
  | "phase_created"
  | "phase_updated"
  | "phase_deleted"
  | "decision_created"
  | "decision_updated"
  | "decision_approved"
  | "decision_rejected"
  | "relation_created"
  | "relation_deleted"
  | "source_created"
  | "source_updated"
  | "memory_created"
  | "memory_updated"
  | "memory_verified"
  | "file_uploaded"
  | "file_deleted"
  | "member_added"
  | "member_removed"
  | "member_role_changed"
  | "invite_sent"
  | "invite_accepted"
  | "invite_rejected";

export interface ActivityLog {
  id: string;
  project_id: string | null;
  organization_id: string | null;
  user_id: string | null;
  action: ActivityAction;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ============================================
// FILE TYPES
// ============================================

export type FileCategory = "documentation" | "graphics" | "audio" | "source_code" | "other";

export interface ProjectFile {
  id: string;
  project_id: string;
  name: string;
  storage_path: string | null;
  file_url: string | null;
  category: FileCategory;
  size_bytes: number | null;
  mime_type: string | null;
  /** FK is ON DELETE SET NULL — the uploader's account may be gone. */
  uploaded_by: string | null;
  created_at: string;
}

export interface CreateFileData {
  project_id: string;
  name: string;
  storage_path?: string;
  file_url?: string;
  category: FileCategory;
  size_bytes?: number;
  mime_type?: string;
}

// ============================================
// TECHNOLOGY TYPES
// ============================================

export type TechCategory = "frontend" | "backend" | "database" | "devops" | "ai" | "other";

export interface Technology {
  id: string;
  project_id: string;
  name: string;
  icon_slug: string | null;
  version: string | null;
  category: TechCategory;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface CreateTechnologyData {
  project_id: string;
  name: string;
  icon_slug?: string;
  version?: string;
  category: TechCategory;
  description?: string;
  sort_order?: number;
}

export interface UpdateTechnologyData {
  name?: string;
  icon_slug?: string;
  version?: string;
  category?: TechCategory;
  description?: string;
  sort_order?: number;
}
