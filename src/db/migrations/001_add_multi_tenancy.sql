-- ============================================================================
-- PHASE 1: Multi-Tenancy Migration for pgvector RAG System
-- Adds tenant isolation while preserving existing functionality
-- ============================================================================

-- 1. TENANTS TABLE - Each organization/company is one row
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  api_key TEXT NOT NULL UNIQUE,
  plan TEXT DEFAULT 'free', -- 'free', 'pro', 'enterprise'
  status TEXT DEFAULT 'active', -- 'active', 'suspended', 'trial'
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_api_key ON tenants(api_key);
CREATE INDEX IF NOT EXISTS idx_tenants_name ON tenants(name);

-- 2. ROLES TABLE - Define roles per tenant (customize per organization)
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- 'admin', 'manager', 'viewer', etc.
  description TEXT,
  permissions JSONB DEFAULT '{}', -- Flexible permissions per role
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON roles(tenant_id);

-- 3. USERS TABLE - Each tenant can have multiple users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role_id UUID REFERENCES roles(id),
  status TEXT DEFAULT 'active', -- 'active', 'inactive', 'suspended'
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- 4. ADD TENANT_ID TO DOCUMENTS TABLE
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'private'; -- 'private', 'shared', 'public'
ALTER TABLE documents ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size INT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ingesting'; -- 'ingesting', 'ready', 'error'

CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(tenant_id, status);

-- 5. ADD TENANT_ID TO CHUNKS TABLE (CRITICAL FOR ISOLATION)
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'private';

-- COMPOSITE INDEX: tenant_id + embedding (for filtered vector search)
-- This is the key index for multi-tenant vector searches
CREATE INDEX IF NOT EXISTS idx_chunks_tenant_embedding
ON chunks USING ivfflat (embedding vector_cosine_ops)
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_tenant_id ON chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chunks_tenant_doc ON chunks(tenant_id, document_id);

-- 6. ACCESS LOGS TABLE - Audit trail for compliance
CREATE TABLE IF NOT EXISTS access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL, -- 'search', 'upload', 'delete', 'download'
  resource_type TEXT, -- 'document', 'chunk', 'user'
  resource_id UUID,
  query TEXT,
  result_count INT,
  execution_time_ms INT,
  tokens_used INT,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT DEFAULT 'success', -- 'success', 'error'
  error_message TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_logs_tenant_id ON access_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON access_logs(tenant_id, created_at);

-- 7. API USAGE & BILLING TABLE
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- '2024-07'
  queries_count INT DEFAULT 0,
  documents_count INT DEFAULT 0,
  chunks_count INT DEFAULT 0,
  tokens_used INT DEFAULT 0,
  cost_estimate DECIMAL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(tenant_id, month)
);

CREATE INDEX IF NOT EXISTS idx_api_usage_tenant_id ON api_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_month ON api_usage(tenant_id, month);

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) - Database-level enforcement
-- ============================================================================

-- Enable RLS on all tenant-aware tables
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see chunks from their tenant
CREATE POLICY IF NOT EXISTS chunks_tenant_isolation ON chunks
  FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY IF NOT EXISTS chunks_insert_tenant ON chunks
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY IF NOT EXISTS chunks_delete_tenant ON chunks
  FOR DELETE
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- RLS Policy: Users can only see documents from their tenant
CREATE POLICY IF NOT EXISTS documents_tenant_isolation ON documents
  FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY IF NOT EXISTS documents_insert_tenant ON documents
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY IF NOT EXISTS documents_delete_tenant ON documents
  FOR DELETE
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- RLS Policy: Users can only see other users in their tenant
CREATE POLICY IF NOT EXISTS users_tenant_isolation ON users
  FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- RLS Policy: Access logs isolated by tenant
CREATE POLICY IF NOT EXISTS access_logs_tenant_isolation ON access_logs
  FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY IF NOT EXISTS access_logs_insert_tenant ON access_logs
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

-- ============================================================================
-- CREATE DEFAULT ROLES PER TENANT (called after tenant creation)
-- ============================================================================

CREATE OR REPLACE FUNCTION create_default_roles_for_tenant(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO roles (tenant_id, name, description, permissions) VALUES
    (p_tenant_id, 'admin', 'Full access to all resources', jsonb_build_object(
      'upload_documents', true,
      'delete_documents', true,
      'view_all_documents', true,
      'manage_users', true,
      'export_data', true,
      'view_billing', true,
      'search', true
    )),
    (p_tenant_id, 'manager', 'Manage documents and search', jsonb_build_object(
      'upload_documents', true,
      'delete_documents', true,
      'view_all_documents', true,
      'export_data', true,
      'search', true
    )),
    (p_tenant_id, 'viewer', 'Read-only access to documents', jsonb_build_object(
      'view_all_documents', true,
      'search', true
    ));
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to generate secure API key
CREATE OR REPLACE FUNCTION generate_api_key()
RETURNS TEXT AS $$
BEGIN
  RETURN 'sk_live_' || encode(gen_random_bytes(24), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to create a new tenant with default roles
CREATE OR REPLACE FUNCTION create_tenant(p_name TEXT)
RETURNS TABLE(id UUID, name TEXT, api_key TEXT) AS $$
DECLARE
  v_tenant_id UUID;
  v_api_key TEXT;
BEGIN
  v_api_key := generate_api_key();
  
  INSERT INTO tenants (name, api_key)
  VALUES (p_name, v_api_key)
  RETURNING tenants.id INTO v_tenant_id;
  
  -- Create default roles
  PERFORM create_default_roles_for_tenant(v_tenant_id);
  
  RETURN QUERY SELECT v_tenant_id, p_name, v_api_key;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CONSTRAINTS & CLEANUP
-- ============================================================================

-- Ensure all existing chunks and documents have a tenant_id (if migrating)
-- UPDATE chunks SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
-- UPDATE documents SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;

-- After migration, add NOT NULL constraints
-- ALTER TABLE chunks ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE documents ALTER COLUMN tenant_id SET NOT NULL;
