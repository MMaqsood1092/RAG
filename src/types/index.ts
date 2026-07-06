// Multi-Tenancy Types

export interface Tenant {
  id: string;
  name: string;
  api_key: string;
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'trial';
  created_at: Date;
  updated_at: Date;
}

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  permissions: Record<string, boolean>;
  created_at: Date;
}

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  password_hash?: string; // Don't expose in responses
  role_id?: string;
  status: 'active' | 'inactive' | 'suspended';
  created_at: Date;
  updated_at: Date;
  role?: Role;
}

export interface Document {
  id: string;
  tenant_id: string;
  name: string;
  source?: string;
  path: string;
  checksum?: string;
  embedding_model: string;
  embedding_dimension: number;
  owner_id: string;
  access_level: 'private' | 'shared' | 'public';
  file_size?: number;
  status: 'ingesting' | 'ready' | 'error';
  created_at: Date;
}

export interface Chunk {
  id: string;
  tenant_id: string;
  document_id: string;
  content: string;
  embedding?: number[];
  access_level: 'private' | 'shared' | 'public';
  metadata?: Record<string, any>;
  created_at?: Date;
}

export interface ChunkSearchResult extends Chunk {
  score: number;
}

export interface AccessLog {
  id: string;
  tenant_id: string;
  user_id?: string;
  action: 'search' | 'upload' | 'delete' | 'download' | 'login';
  resource_type?: 'document' | 'chunk' | 'user';
  resource_id?: string;
  query?: string;
  result_count?: number;
  execution_time_ms?: number;
  tokens_used?: number;
  ip_address?: string;
  user_agent?: string;
  status: 'success' | 'error';
  error_message?: string;
  created_at: Date;
}

export interface ApiUsage {
  id: string;
  tenant_id: string;
  month: string;
  queries_count: number;
  documents_count: number;
  chunks_count: number;
  tokens_used: number;
  cost_estimate: number;
  created_at: Date;
  updated_at: Date;
}

// Request/Response types
export interface AuthenticatedRequest {
  tenant_id: string;
  user_id?: string;
  user?: User;
  ip_address?: string;
  user_agent?: string;
}

export interface ChatRequest {
  question: string;
  doc_id?: string; // Filter to specific document (optional)
  filters?: {
    access_level?: 'private' | 'shared' | 'public';
    created_after?: string;
  };
}

export interface ChatResponse {
  results: ChunkSearchResult[];
  execution_time_ms: number;
  tokens_used?: number;
}

export interface LoginRequest {
  api_key: string;
  // OR for user login (when implemented)
  // email?: string;
  // password?: string;
}

export interface LoginResponse {
  access_token: string;
  tenant_id: string;
  user?: User;
  expires_in: number;
}

export interface TenantStats {
  tenant_id: string;
  documents_count: number;
  chunks_count: number;
  users_count: number;
  queries_this_month: number;
  tokens_used_this_month: number;
}
