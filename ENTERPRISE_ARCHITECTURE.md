# Enterprise Vector Database Architecture for SaaS

## Executive Summary

To sell your vector search product to multiple companies, you need a **multi-tenant architecture** that keeps each company's data isolated while using a **single shared database**. This document explains how to structure everything at enterprise scale.

---

## Part 1: Core Concept - Multi-Tenant vs. Single-Tenant

### What is Multi-Tenant?
One database serves multiple companies. Each company's data is logically separated but physically stored together.

**Real World Example:**
- Slack: One database, millions of workspaces (companies)
- Salesforce: One database, millions of organizations
- Your Product: One database, multiple customer companies

### Why Not Separate Database Per Customer?
❌ **Separate DB per customer:**
- 100 customers = 100 databases
- Backup 100 databases separately
- Migrate/update 100 databases
- Manage 100 database connections
- Nightmare for operations

✅ **Single shared database:**
- 1 database, 1 backup, 1 migration
- Simple operations
- Lower infrastructure cost
- Scales to 1000+ customers

---

## Part 2: Database Schema for Multi-Tenant

### Current Single-Tenant Schema
```
chunks
├── id
├── content
├── embedding
├── document_id
└── metadata
```

### New Multi-Tenant Schema

#### 1. TENANTS TABLE (Each Company = 1 Row)
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,           -- "Acme Corp"
  api_key TEXT UNIQUE,          -- Secret key for API calls
  plan TEXT,                    -- 'free', 'pro', 'enterprise'
  status TEXT,                  -- 'active', 'suspended', 'trial'
  created_at TIMESTAMP,
  max_documents INT,            -- Plan limit
  max_users INT,                -- Plan limit
  stripe_customer_id TEXT       -- For billing
);
```

**Example:**
```
id: company-001
name: Acme Corp
api_key: sk_live_abc123xyz
plan: enterprise
max_documents: 1000
```

---

#### 2. USERS TABLE (Each Company Has Multiple Users)
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),  -- Which company
  email TEXT,
  password_hash TEXT,
  role TEXT,                    -- 'admin', 'manager', 'user'
  status TEXT,                  -- 'active', 'inactive'
  created_at TIMESTAMP
);
```

**Example:**
```
id: user-001, tenant_id: company-001, email: alice@acme.com, role: admin
id: user-002, tenant_id: company-001, email: bob@acme.com, role: manager
id: user-003, tenant_id: company-002, email: charlie@techcorp.com, role: admin
```

---

#### 3. ROLES & PERMISSIONS TABLE
```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  name TEXT,                    -- 'admin', 'manager', 'user'
  permissions JSONB             -- What they can do
);
```

**Example:**
```
{
  "name": "admin",
  "permissions": {
    "upload_documents": true,
    "delete_documents": true,
    "view_all_documents": true,
    "manage_users": true,
    "export_data": true,
    "view_billing": true
  }
}

{
  "name": "manager",
  "permissions": {
    "upload_documents": true,
    "view_assigned_documents": true,
    "export_data": true
  }
}

{
  "name": "user",
  "permissions": {
    "view_assigned_documents": true,
    "search_only": true
  }
}
```

---

#### 4. DOCUMENTS TABLE (Updated with Tenant)
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),  -- Which company owns this
  name TEXT,
  file_path TEXT,
  file_size INT,
  access_level TEXT,            -- 'public', 'private', 'admin_only'
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  status TEXT                   -- 'ingesting', 'ready', 'error'
);
```

**Example:**
```
id: doc-001
tenant_id: company-001          -- Acme Corp
name: Sales Report 2024.pdf
access_level: public            -- All users in Acme see it
owner_id: user-001              -- Alice uploaded it

id: doc-002
tenant_id: company-001
name: Confidential Budget.xlsx
access_level: admin_only        -- Only admins in Acme see it
```

---

#### 5. CHUNKS TABLE (Updated with Tenant + Access Level)
```sql
CREATE TABLE chunks (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),  -- CRITICAL: Which company
  document_id UUID REFERENCES documents(id),
  content TEXT,
  embedding vector(1024),       -- Voyage embedding
  access_level TEXT,            -- Inherit from document
  metadata JSONB,
  created_at TIMESTAMP
);
```

**CRITICAL:** Every chunk has `tenant_id`. This is how we isolate data.

**Example:**
```
id: chunk-001, tenant_id: company-001, content: "John Smith works at Acme"
id: chunk-002, tenant_id: company-001, content: "Sales in Q3 were $5M"
id: chunk-003, tenant_id: company-002, content: "Jane Doe works at TechCorp"
```

---

#### 6. ACCESS LOGS TABLE (For Audit & Billing)
```sql
CREATE TABLE access_logs (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID REFERENCES users(id),
  query TEXT,                   -- What they searched for
  results_count INT,            -- How many results
  execution_time_ms INT,        -- Performance
  tokens_used INT,              -- For billing (Voyage API)
  timestamp TIMESTAMP
);
```

**Example:**
```
tenant_id: company-001
user_id: user-001
query: "Find John"
results_count: 5
tokens_used: 1024
timestamp: 2024-06-29 10:30:00
```

---

#### 7. API USAGE & BILLING TABLE
```sql
CREATE TABLE api_usage (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  month TEXT,                   -- '2024-06'
  queries_count INT,            -- Total queries this month
  documents_count INT,          -- Total documents
  tokens_used INT,              -- Voyage API tokens
  cost_estimate DECIMAL,        -- USD cost
  created_at TIMESTAMP
);
```

**Example:**
```
tenant_id: company-001
month: 2024-06
queries_count: 1542
tokens_used: 1,582,400
cost_estimate: $15.82
```

---

## Part 3: Data Isolation Methods

### Method 1: ROW-LEVEL SECURITY (RLS) - Database Level

**What is RLS?**
PostgreSQL enforces security rules at the database level. Even if your app has a bug, data won't leak.

**How it works:**
```sql
-- Enable RLS on chunks table
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see chunks from their tenant
CREATE POLICY tenant_isolation ON chunks
  USING (tenant_id = current_user_id_extracted_from_jwt());

-- Now every query automatically filters:
SELECT * FROM chunks;  
-- PostgreSQL automatically adds: WHERE tenant_id = user's_tenant_id
```

**Real Example:**
```
User "alice@acme.com" (tenant_id: company-001) runs:
SELECT * FROM chunks LIMIT 5;

PostgreSQL transforms it to:
SELECT * FROM chunks WHERE tenant_id = 'company-001' LIMIT 5;

Result: Alice only sees Acme's chunks. TechCorp's chunks invisible.
```

**Pros:**
- True security (cannot bypass from app)
- Regulations require it (GDPR, HIPAA, SOC2)
- Prevents accidental data leaks

**Cons:**
- Small performance overhead (~5-10%)
- Requires setup in PostgreSQL

---

### Method 2: APPLICATION LAYER FILTERING - App Level

**How it works:**
```typescript
// 1. Extract tenant from user's JWT token
const user = await getCurrentUser(request);  // { id: 'user-001', tenant_id: 'company-001' }

// 2. Add tenant_id to every database query
async function chat(question: string, user: User) {
  const embedding = await embedQuery(question);
  
  // CRITICAL: Add tenant_id filter
  const results = await pool.query(
    `SELECT content, embedding 
     FROM chunks 
     WHERE tenant_id = $1 
       AND embedding <=> $2::vector
     LIMIT 10`,
    [user.tenant_id, embeddingVector]  // user.tenant_id ensures isolation
  );
  
  return results;
}
```

**Pros:**
- Simple to implement
- No database overhead
- Fast

**Cons:**
- Relies on correct app implementation
- Bug in app = data leak possible

---

### Method 3: COMBINED (BEST PRACTICE)

Use **both RLS + Application filtering:**
- RLS: Database enforces isolation (safety net)
- App filtering: Normal operation (performance)

```
Request from user alice@acme.com
  ↓
App layer filters: WHERE tenant_id = 'company-001'
  ↓
Database RLS also enforces: WHERE tenant_id = 'company-001'
  ↓
Result: Double protection. Even if app has bug, DB prevents leak.
```

**Recommendation:** Use this approach.

---

## Part 4: Multi-Tenant API Design

### Current Single-Tenant API
```
POST /chat
{
  "question": "Find John"
}
```

### Enterprise Multi-Tenant API
```
POST /v1/tenants/{tenant_id}/chat
Authorization: Bearer {api_key}
{
  "question": "Find John",
  "doc_id": "doc-001",           -- optional: search only in this doc
  "filters": {
    "access_level": "public",    -- optional: only public docs
    "created_after": "2024-01-01" -- optional: documents after date
  }
}

Response:
{
  "tenant_id": "company-001",
  "user_id": "user-001",
  "results": [
    {
      "content": "John Smith works at Acme",
      "score": 0.95,
      "doc_id": "doc-001",
      "access_level": "public"
    }
  ],
  "execution_time_ms": 145,
  "tokens_used": 1024,
  "cost_estimate": 0.0102
}
```

---

### API Request Flow

```
1. Client sends: POST /v1/tenants/company-001/chat
   ↓
2. API Gateway checks API key
   ↓
3. API Key lookup: company-001 is valid
   ↓
4. Extract tenant_id: company-001
   ↓
5. Middleware adds tenant context to request
   ↓
6. Authorization check: Does user have permission?
   ↓
7. Chat service runs query with tenant_id filter
   ↓
8. Database (with RLS) enforces isolation
   ↓
9. Return results only for company-001
```

---

## Part 5: Vector Search with Tenant Isolation

### The Challenge
When you search "John", how do you ensure:
- Company A sees only John from their documents
- Company B sees only John from their documents
- They never see each other's data

### Solution: Two-Phase Search

**Phase 1: Metadata Filter (Fast)**
```sql
SELECT chunk_id, content, embedding
FROM chunks
WHERE tenant_id = 'company-001'        -- Filter by tenant FIRST
  AND document_id IN (doc-001, doc-002) -- Filter by documents (optional)
  AND access_level = 'public'           -- Filter by role (optional)
ORDER BY embedding <=> '[query_vector]'  -- Vector search WITHIN filtered set
LIMIT 10;
```

**Why this order matters:**
- ✅ CORRECT: Filter tenant → filter docs → vector search (fast, safe)
- ❌ WRONG: Vector search across all data → filter tenant (slow, risky)

**Real Example:**
```
Database has 10 million chunks:
- 3M from company-001
- 3M from company-002
- 4M from other companies

Query: "Find John" from company-001

Step 1: WHERE tenant_id = 'company-001'
Result: 3M chunks (filtered to 3M)

Step 2: ORDER BY embedding <=> vector LIMIT 10
Result: 10 most relevant Johns from company-001 only
```

---

## Part 6: Role-Based Access Control

### Scenario
Company has different users with different permissions.

```
Acme Corp
├── Alice (Admin)
│   └── Can see: All documents
│
├── Bob (Manager)
│   └── Can see: Sales, Marketing docs (not Finance/Legal)
│
└── Carol (User)
    └── Can see: Only public documents
```

### Implementation

**Step 1: Define Document Access Levels**
```sql
-- Document marked as "Finance Only"
INSERT INTO documents (id, name, access_level, required_roles)
VALUES ('doc-001', 'Budget.xlsx', 'private', '["admin", "finance_manager"]');

-- Document marked as "Public"
INSERT INTO documents (id, name, access_level, required_roles)
VALUES ('doc-002', 'Handbook.pdf', 'public', '[all]');
```

**Step 2: Check Permission Before Search**
```typescript
async function chat(question: string, user: User) {
  // 1. Get user's role and permissions
  const userRole = user.role;  // 'admin', 'manager', 'user'
  
  // 2. Query only documents user can access
  const accessibleDocs = await pool.query(
    `SELECT id FROM documents
     WHERE tenant_id = $1
       AND (access_level = 'public' 
            OR required_roles @> $2)`,  -- @> checks if array contains
    [user.tenant_id, [userRole]]
  );
  
  const docIds = accessibleDocs.rows.map(r => r.id);
  
  // 3. Search only within accessible documents
  const results = await pool.query(
    `SELECT * FROM chunks
     WHERE tenant_id = $1
       AND document_id = ANY($2)
       AND embedding <=> $3::vector
     LIMIT 10`,
    [user.tenant_id, docIds, embeddingVector]
  );
  
  return results;
}
```

---

## Part 7: Vector Storage Strategy (Stage-Based)

### CRITICAL: Single Table Not Recommended for 100B+ Chunks

**At 1000 companies × 100 docs × 200 chunks = 20 BILLION chunks:**
- ❌ Single PostgreSQL table = 1-5 second queries
- ❌ Index size = 500GB-1TB (memory problems)
- ❌ Backup/restore = 4-8 hours
- ✅ Distributed architecture = 50-100ms queries

---

### Stage 1: Single PostgreSQL (MVP - Recommended)

**For:** 1-100 customers, <50M chunks

```sql
CREATE TABLE chunks (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  document_id UUID REFERENCES documents(id),
  content TEXT,
  embedding vector(1024),
  access_level TEXT,
  metadata JSONB,
  created_at TIMESTAMP
);

-- Index Strategy: 4 Strategic Indexes
CREATE INDEX idx_chunks_tenant_embedding
ON chunks USING ivfflat (embedding vector_cosine_ops)
WHERE tenant_id IS NOT NULL;
-- Optimizes: WHERE tenant_id = X ORDER BY embedding <=> vec

CREATE INDEX idx_chunks_tenant_doc
ON chunks (tenant_id, document_id);
-- Optimizes: WHERE tenant_id = X AND document_id = Y

CREATE INDEX idx_chunks_tenant_access
ON chunks (tenant_id, access_level);
-- Optimizes: WHERE tenant_id = X AND access_level = 'public'

CREATE INDEX idx_tenants_api_key
ON tenants (api_key);
-- Optimizes: API key validation
```

**Performance:** ~50-100ms queries
**Cost:** $500-1000/month
**When to upgrade:** >100 customers

---

### Stage 2: Hybrid Architecture (Growth - RECOMMENDED)

**For:** 100-500 customers, 50-100B chunks

**Architecture:**
```
PostgreSQL (Metadata Only)              Qdrant / Milvus (Vectors)
├── tenants table                       ├── Shard 1: 5-10M vectors
├── users table                         ├── Shard 2: 5-10M vectors
├── documents table                     ├── Shard 3: 5-10M vectors
├── chunks_metadata                     ├── Shard 4: 5-10M vectors
│   (content, tenant_id,                └── ... (5-20 shards total)
│    doc_id, NO embedding)              
├── access_logs                         Per shard:
└── Small B-tree indexes                ├── 50-100GB storage
   (no vector index!)                   ├── Auto-rebalancing
                                        └── Tenant filtering built-in
```

**Schema for Hybrid:**
```sql
-- PostgreSQL (lightweight metadata)
CREATE TABLE chunks_metadata (
  id UUID PRIMARY KEY,
  tenant_id UUID,
  document_id UUID,
  content TEXT,
  -- NO embedding here!
  access_level TEXT,
  metadata JSONB,
  created_at TIMESTAMP
);

CREATE INDEX idx_chunks_metadata_tenant_doc
ON chunks_metadata (tenant_id, document_id);

-- Qdrant stores: { id, vector(1024), tenant_id, document_id }
-- Milvus stores: { id, vector(1024), tenant_id, document_id }
```

**Query Flow:**
```typescript
// 1. Generate embedding
const embedding = await embedQuery(question);

// 2. Search in Qdrant (fast, distributed)
const vectorResults = await qdrant.search('chunks', {
  vector: embedding,
  limit: 20,
  filter: {
    must: [
      { key: 'tenant_id', match: { value: user.tenant_id } }
    ]
  }
});

// 3. Join with content from PostgreSQL
const chunk_ids = vectorResults.map(r => r.id);
const chunks = await postgresDb.query(
  `SELECT * FROM chunks_metadata WHERE id = ANY($1)`,
  [chunk_ids]
);

return chunks;
```

**Performance:** ~50-100ms queries
**Cost:** $1000-2000/month
**When to upgrade:** >500 customers

---

### Stage 3: Dedicated Vector Database (Scale)

**For:** 500-1000 customers, 100-500B chunks

**Recommended Tools:** Weaviate or Milvus (self-hosted/managed)

**Architecture:**
```
PostgreSQL (Metadata)              Weaviate/Milvus Cluster
├── Lightweight                    ├── Node 1: 50M vectors
├── No vector data                 ├── Node 2: 50M vectors
├── RLS policies                   ├── Node 3: 50M vectors
├── Access control                 ├── Node 4: 50M vectors
└── Audit logs                     └── Load Balancer (auto-routing)

                                   Features:
                                   ├── Auto-sharding (transparent)
                                   ├── Built-in multi-tenancy
                                   ├── Cross-shard queries
                                   └── No manual ops needed
```

**Query with Weaviate:**
```typescript
const results = await weaviate.graphql.get()
  .withClassName('Chunk')
  .withWhere({
    path: ['tenant_id'],
    operator: 'Equal',
    valueString: user.tenant_id
  })
  .withNearVector({
    vector: embedding,
    distance: 0.5
  })
  .withLimit(10)
  .do();

return results.data.Get.Chunk;
```

**Performance:** ~10-50ms queries
**Cost:** $5000-15000/month (managed) OR $500-1000/month (self-hosted)
**When to upgrade:** >1000 customers

---

### Stage 4: Multi-Region (Enterprise)

**For:** 1000+ customers, 1T+ chunks, compliance requirements

**Architecture:**
```
┌─ US Region ─────────────────┐
│ PostgreSQL (300 companies)  │
│ Weaviate (300B vectors)     │
├─────────────────────────────┤
│ Load Balancer               │
└─────────────────────────────┘
          ↓
┌─ EU Region ─────────────────┐
│ PostgreSQL (300 companies)  │
│ Weaviate (300B vectors)     │
├─────────────────────────────┤
│ Load Balancer               │
└─────────────────────────────┘
          ↓
┌─ APAC Region ───────────────┐
│ PostgreSQL (200 companies)  │
│ Weaviate (200B vectors)     │
├─────────────────────────────┤
│ Load Balancer               │
└─────────────────────────────┘
          ↑↑↑
  Global Load Balancer
  (routes by region/latency)
```

**Performance:** ~5-20ms queries (geo-optimized)
**Cost:** $20000-50000/month
**When needed:** GDPR/data residency requirements

---

## INDEXING STRATEGY BY STAGE

| Stage | Architecture | Index Strategy | Index Size |
|-------|--------------|-----------------|-----------|
| **1** | Single PostgreSQL | 4 B-tree + 1 IVFFlat | 50-100GB |
| **2** | PostgreSQL + Qdrant | 2 B-tree (PostgreSQL), auto-sharding (Qdrant) | 10GB + 50-100GB |
| **3** | Dedicated Vector DB | 0 (Vector DB manages) | Transparent |
| **4** | Multi-region | 0 per region (Vector DB manages) | Distributed |

---

## SUMMARY: Don't Use Single Table for Billion-Scale

**At 1000 companies with 100 docs each = 10-50 BILLION chunks**

| Decision | Stage 1 | Stage 2+ |
|----------|---------|---------|
| Architecture | PostgreSQL only | PostgreSQL + Vector DB |
| Query time | 50-100ms ✅ | 50-100ms ✅ |
| Scale limit | 50M chunks | 500B+ chunks ✅✅ |
| Cost | $500-1k | $1-15k (scales with needs) |
| Ops burden | Low | Medium |
| Recommended | For MVP | For production at scale |

**Bottom line:** Stay on Stage 1 for MVP (under 100 customers). Switch to Stage 2+ when approaching 50M chunks or after 100 customers.

---

## Part 8: API Key Authentication Flow

### How It Works

**Step 1: Client Calls API with API Key**
```
POST /v1/chat
Authorization: Bearer sk_live_abc123xyz
{
  "question": "Find John"
}
```

**Step 2: Server Validates API Key**
```typescript
async function validateApiKey(apiKey: string) {
  const tenant = await pool.query(
    'SELECT id, name FROM tenants WHERE api_key = $1',
    [apiKey]
  );
  
  if (!tenant.rows[0]) {
    throw new Error('Invalid API key');
  }
  
  return tenant.rows[0];  // { id: 'company-001', name: 'Acme Corp' }
}
```

**Step 3: Add Tenant Context to Request**
```typescript
const tenant = await validateApiKey(apiKey);
request.tenant_id = tenant.id;  // Add to request context

// Now all queries use this tenant_id
```

**Step 4: Every DB Query Includes Tenant**
```sql
SELECT * FROM chunks 
WHERE tenant_id = 'company-001'  -- From validated API key
  AND embedding <=> $1::vector
```

---

## Part 9: Scaling as You Grow - CRITICAL FOR VECTOR DB

### Stage 1: 1-100 Customers (MVP: ~10-50M Chunks)
```
Single PostgreSQL Database
├── Single chunks table (all data)
├── RLS enabled
├── 4 indexes (from Part 7)
├── Query latency: ~50-100ms ✅
└── Cost: $500-1000/month
```
**When to stay here:** Under 100 customers, under 50M chunks

---

### Stage 2: 100-500 Customers (Growth: ~50-100B Chunks) - SWITCH REQUIRED ⚠️
```
HYBRID ARCHITECTURE (Recommended for this stage)
┌─────────────────────────────────────┐
│     PostgreSQL (Metadata Only)      │
├─────────────────────────────────────┤
│ tenants                             │
│ users                               │
│ documents                           │
│ access_logs                         │
│ chunks_metadata (no vectors!)       │
├─────────────────────────────────────┤
│ Indexes:                            │
│ - (tenant_id, doc_id)              │
│ - (api_key)                        │
│ - (tenant_id, access_level)        │
└─────────────────────────────────────┘
          ↓ Metadata queries
          ↓ RLS enforcement
          ↓ Access control

┌─────────────────────────────────────┐
│ Qdrant / Milvus (Vector Store)      │
├─────────────────────────────────────┤
│ Shard 1: Vectors 1-5M              │
│ Shard 2: Vectors 5-10M             │
│ Shard 3: Vectors 10-15M            │
│ ... (5-20 shards)                  │
├─────────────────────────────────────┤
│ Per shard: 5-10M vectors           │
│ Vector index: 50-100GB per shard   │
│ Auto-sharding: transparent         │
│ Query latency: 50-100ms            │
└─────────────────────────────────────┘
          ↓ Vector similarity search
          ↓ Semantic matching
          ↓ Filtered by tenant_id
```

**Query Flow:**
```
1. User searches "Find John"
   ↓
2. PostgreSQL: Get accessible docs for this tenant
   ↓
3. Qdrant: Vector search with tenant_id filter
   ↓
4. PostgreSQL: Join results with content
   ↓
5. Return top 10 results
```

**Migration path from Stage 1:**
- Keep existing PostgreSQL as-is
- Add Qdrant cluster alongside
- Duplicate vectors to both (during transition)
- Switch query logic to use Qdrant
- Remove vectors from PostgreSQL (keep metadata)

**Cost:** $1000-2000/month
**Latency:** 50-100ms ✅
**Setup time:** 1-2 weeks

---

### Stage 3: 500-1000 Customers (Scale: ~100-500B Chunks) - SWITCH REQUIRED ⚠️
```
DEDICATED VECTOR DATABASE (Weaviate/Milvus Cluster)
┌─────────────────────────────────────────┐
│        PostgreSQL (Metadata + Auth)     │
├─────────────────────────────────────────┤
│ Same as Stage 2 (compact, efficient)   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│    Weaviate / Milvus Cluster (Scale)    │
├─────────────────────────────────────────┤
│ Node 1: 50M vectors                    │
│ Node 2: 50M vectors                    │
│ Node 3: 50M vectors                    │
│ ...                                    │
│ Node N: 50M vectors                    │
├─────────────────────────────────────────┤
│ Load Balancer: Routes queries           │
│ Auto-rebalancing: Seamless              │
│ Built-in multi-tenancy: Enabled         │
│ Query latency: 10-50ms                  │
│ Cross-shard queries: Supported          │
└─────────────────────────────────────────┘
```

**Advantages over Hybrid:**
- ✅ Native multi-tenancy (no filter workarounds)
- ✅ Faster queries (10-50ms vs 50-100ms)
- ✅ Automatic rebalancing (no manual ops)
- ✅ Less operational burden

**Cost:** $5000-15000/month (managed) OR $500-1000/month (self-hosted)
**Latency:** 10-50ms ✅✅
**Setup time:** 3-5 days

---

### Stage 4: 1000+ Customers (Enterprise: ~1T+ Chunks) - OPTIONAL ENHANCEMENT
```
MULTI-REGION DISTRIBUTED ARCHITECTURE
┌──────────────────────────────────────┐
│  US Region PostgreSQL + Vector DB    │
│  ├── 300 companies (metadata)        │
│  └── Weaviate: 300B chunks           │
├──────────────────────────────────────┤
│  EU Region PostgreSQL + Vector DB    │
│  ├── 300 companies (metadata)        │
│  └── Weaviate: 300B chunks           │
├──────────────────────────────────────┤
│  APAC Region PostgreSQL + Vector DB  │
│  ├── 200 companies (metadata)        │
│  └── Weaviate: 200B chunks           │
├──────────────────────────────────────┤
│  Global Load Balancer                │
│  ├── Routes by region (latency)      │
│  ├── Routes by data residency (law)  │
│  └── Failover management             │
└──────────────────────────────────────┘
```

**Why multi-region at 1000+:**
- GDPR: EU data must stay in EU
- Latency: US users get US DB (5-10ms vs 200-300ms)
- Compliance: Data residency requirements
- Reliability: Regional failover

**Cost:** $20000-50000/month
**Latency:** 5-20ms ✅✅✅
**Setup time:** 4-8 weeks

---

## Stage Progression Summary

| Stage | Companies | Chunks | Architecture | Latency | Cost | Action |
|-------|-----------|--------|--------------|---------|------|--------|
| **1** | 1-100 | 10-50M | Single PostgreSQL | 50-100ms | $500-1k | CURRENT - Start here |
| **2** | 100-500 | 50-100B | PostgreSQL + Qdrant (Hybrid) | 50-100ms | $1-2k | Switch when hitting limits |
| **3** | 500-1000 | 100-500B | Dedicated Vector DB (Weaviate) | 10-50ms | $5-15k | Switch for performance |
| **4** | 1000+ | 1T+ | Multi-region distributed | 5-20ms | $20-50k | Switch for compliance |

**Key Rule:** ⚠️ DO NOT stay on Stage 1 architecture beyond 100 customers - performance will degrade dramatically!

---

## Part 10: Security Checklist

✅ **Data Isolation**
- [x] RLS enabled on chunks table
- [x] App-level tenant filtering on every query
- [x] API key validation before access

✅ **Access Control**
- [x] Roles defined (admin, manager, user)
- [x] Document access levels enforced
- [x] Permission check before search

✅ **Audit & Compliance**
- [x] All queries logged with tenant_id
- [x] Access logs track who searched what
- [x] Audit trail for sensitive operations

✅ **Encryption**
- [x] API keys encrypted in database
- [x] Database encrypted at-rest
- [x] HTTPS for all API calls
- [x] JWT tokens with expiration

✅ **Backup & Recovery**
- [x] Daily backups of database
- [x] Backups encrypted
- [x] Test recovery regularly
- [x] Backup contains all tenants (encrypted)

---

## Part 11: Implementation Checklist (Staged Approach)

### PHASE 0: MVP - Single PostgreSQL (Start Here)
**Timeline:** 1-2 weeks
**When:** For first 1-100 customers

**Database Changes**
- [ ] Add `tenant_id` column to chunks table
- [ ] Add `tenant_id` column to documents table
- [ ] Create tenants table
- [ ] Create users table
- [ ] Create roles table
- [ ] Create access_logs table
- [ ] Create 4 indexes (from Part 7, Stage 1)
- [ ] Enable RLS on chunks table
- [ ] Create RLS policies

**Backend Changes**
- [ ] Add API key validation middleware
- [ ] Extract tenant_id from JWT/API key
- [ ] Add tenant_id filter to all DB queries
- [ ] Update `/chat` endpoint to `/v1/tenants/{tenant_id}/chat`
- [ ] Add role-based access check
- [ ] Add audit logging

**API Changes**
- [ ] New endpoint: `POST /v1/tenants/{tenant_id}/chat`
- [ ] New endpoint: `POST /v1/tenants/{tenant_id}/documents` (upload)
- [ ] New endpoint: `GET /v1/tenants/{tenant_id}/documents` (list)
- [ ] New endpoint: `POST /admin/tenants` (create tenant)
- [ ] New endpoint: `POST /admin/users` (add user)

---

### PHASE 1: Growth → Hybrid Architecture (Upgrade)
**Timeline:** 2-3 weeks
**When:** At 100 customers or 50M chunks
**Trigger:** Query latency degrading >200ms

**1. Add Qdrant/Milvus Cluster**
- [ ] Deploy Qdrant/Milvus (5-20 shards)
- [ ] Configure multi-tenancy in Vector DB
- [ ] Setup auto-backup for Vector DB
- [ ] Test failover procedures

**2. Modify Database**
- [ ] CREATE TABLE chunks_metadata (no vectors)
- [ ] Migrate chunks (copy content, tenant_id, doc_id, NO embedding)
- [ ] DELETE embedding column from chunks
- [ ] Drop IVFFlat index
- [ ] Keep 2 B-tree indexes only

**3. Update Application**
- [ ] Add Qdrant client library
- [ ] Modify embedder: write to both PostgreSQL (metadata) and Qdrant (vectors)
- [ ] Modify chat.ts: search Qdrant first, join with PostgreSQL
- [ ] Implement fallback (if Qdrant fails, use cache)
- [ ] Add monitoring: query latency, Qdrant health

**4. Data Migration Plan**
- [ ] Run parallel ingestion (new docs go to both systems)
- [ ] Migrate existing vectors: PostgreSQL → Qdrant
- [ ] Verify data consistency
- [ ] Cutover: switch query logic to use Qdrant
- [ ] Archive old PostgreSQL vectors (or delete)

**5. Testing**
- [ ] Load test: 1M simultaneous queries
- [ ] Failover test: shut down Qdrant shard
- [ ] Latency benchmark: confirm 50-100ms

---

### PHASE 2: Scale → Dedicated Vector DB (Major Upgrade)
**Timeline:** 3-5 weeks
**When:** At 500 customers or 100B chunks
**Trigger:** Multi-region requirements or GDPR compliance

**1. Deploy Weaviate/Milvus Cluster (Large Scale)**
- [ ] Deploy managed Weaviate cluster OR self-hosted (10-20 nodes)
- [ ] Configure auto-sharding (no manual ops)
- [ ] Setup cluster monitoring
- [ ] Configure backup/restore procedures
- [ ] Test disaster recovery

**2. Database Simplification**
- [ ] PostgreSQL remains: metadata + auth only
- [ ] Remove all vector-related columns from PostgreSQL
- [ ] Keep only: chunks_metadata (id, tenant_id, doc_id, content)
- [ ] Reduce indexes to 1-2 (just for metadata lookups)

**3. Update Application**
- [ ] Replace Qdrant client with Weaviate/Milvus client
- [ ] Simplify query logic (Vector DB handles tenant filtering natively)
- [ ] Update embedder: write to Weaviate only
- [ ] Implement monitoring: query latency, shard balance, replication

**4. Data Migration**
- [ ] Create new Weaviate collection
- [ ] Bulk migrate vectors: Qdrant → Weaviate
- [ ] Verify count matches (all 100B vectors present)
- [ ] Cutover: update app to query Weaviate
- [ ] Decommission Qdrant cluster
- [ ] Verify latency improvement (10-50ms)

**5. Optimization**
- [ ] Tune Vector DB parameters for your data
- [ ] Configure caching layer (Redis)
- [ ] Setup query rate limiting (per tenant)
- [ ] Implement query cost tracking

---

### PHASE 3: Enterprise → Multi-Region (Optional)
**Timeline:** 4-8 weeks
**When:** At 1000+ customers
**Trigger:** Data residency laws, latency SLAs, compliance

**1. Setup Regional Infrastructure**
- [ ] US Region: PostgreSQL + Weaviate
- [ ] EU Region: PostgreSQL + Weaviate
- [ ] APAC Region: PostgreSQL + Weaviate
- [ ] Global DNS/Load Balancer
- [ ] Data replication between regions (for failover)

**2. Customer → Region Mapping**
- [ ] Create routing table: tenant_id → region
- [ ] US customers → US region
- [ ] EU customers → EU region (GDPR: data must stay in EU)
- [ ] APAC customers → APAC region

**3. Update Application**
- [ ] Add region-aware request routing
- [ ] Route by: customer's region + latency
- [ ] Handle cross-region failures gracefully
- [ ] Implement regional backups

**4. Compliance & Monitoring**
- [ ] Verify GDPR compliance (EU data in EU)
- [ ] Setup geo-distributed backups
- [ ] Monitor latency per region
- [ ] Configure failover (region unavailable → backup region)

---

## Quick Reference: When to Upgrade

| Metric | Phase 0 | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|---------|
| Customers | 1-100 | 100-500 | 500-1000 | 1000+ |
| Chunks | <50M | 50-100B | 100-500B | 1T+ |
| Query Latency | 50-100ms | 50-100ms | 10-50ms | 5-20ms |
| Cost | $500-1k | $1-2k | $5-15k | $20-50k |
| Architecture | PostgreSQL | PostgreSQL + Qdrant | Weaviate | Multi-Region |

**Rule of Thumb:** When query latency > 200ms OR customers > 100, upgrade to Phase 1.

---

## Part 12: Example: Complete Query Flow

### Scenario
Bob (Manager) from Acme Corp searches "Find sales numbers"

```
Step 1: Bob sends request
=============================
POST /v1/chat
Authorization: Bearer sk_live_abc123xyz
{
  "question": "Find sales numbers"
}

Step 2: Server validates API key
=============================
SELECT id, name FROM tenants WHERE api_key = 'sk_live_abc123xyz'
Result: { id: 'company-001', name: 'Acme Corp' }

Step 3: Extract tenant context
=============================
tenant_id = 'company-001'
api_key lookup verified

Step 4: Get user permissions
=============================
SELECT role FROM users WHERE api_key_owner_id = ? AND tenant_id = 'company-001'
Result: role = 'manager'

Step 5: Find accessible documents
=============================
SELECT id FROM documents
WHERE tenant_id = 'company-001'
  AND (access_level = 'public' OR required_roles @> '["manager"]')
Result: [doc-001, doc-002, doc-003]

Step 6: Embed search query
=============================
Embedding "Find sales numbers" → [0.12, -0.45, 0.78, ...]

Step 7: Search with tenant + role isolation
=============================
SELECT content, embedding
FROM chunks
WHERE tenant_id = 'company-001'          -- RLS enforces this
  AND document_id = ANY([doc-001, doc-002, doc-003])  -- Role restriction
  AND embedding <=> '[0.12, -0.45, 0.78, ...]'::vector
ORDER BY embedding <=> '[0.12, -0.45, 0.78, ...]'::vector DESC
LIMIT 10

Step 8: PostgreSQL RLS evaluation
=============================
BEFORE returning any row, PostgreSQL checks:
  - Is tenant_id = 'company-001'? YES ✓
  - Return row

Step 9: Calculate scores
=============================
Result 1: "Q3 sales were $5M" (score: 0.94)
Result 2: "Sales process updated" (score: 0.82)
Result 3: "Regional sales breakdown" (score: 0.79)

Step 10: Log access
=============================
INSERT INTO access_logs
(tenant_id, user_id, query, results_count, tokens_used)
VALUES
('company-001', 'user-001', 'Find sales numbers', 3, 1024)

Step 11: Return response
=============================
{
  "tenant_id": "company-001",
  "results": [
    { "content": "Q3 sales were $5M", "score": 0.94 },
    { "content": "Sales process updated", "score": 0.82 },
    { "content": "Regional sales breakdown", "score": 0.79 }
  ],
  "execution_time_ms": 145,
  "tokens_used": 1024
}
```

---

## Part 13: Common Mistakes to Avoid

### ❌ MISTAKE 1: Forgetting Tenant Filter
```typescript
// WRONG
SELECT * FROM chunks WHERE embedding <=> query_vector LIMIT 10;
// Result: Returns all chunks from all companies - DATA LEAK!

// CORRECT
SELECT * FROM chunks 
WHERE tenant_id = 'company-001' AND embedding <=> query_vector LIMIT 10;
// Result: Only company-001's chunks
```

### ❌ MISTAKE 2: Separate Table Per Customer
```sql
-- WRONG
CREATE TABLE chunks_company_001 (...)
CREATE TABLE chunks_company_002 (...)
CREATE TABLE chunks_company_003 (...)
-- Now you have 1000 tables for 1000 customers - operational nightmare

-- CORRECT
CREATE TABLE chunks (tenant_id, ...)
-- Single table with tenant_id column
```

### ❌ MISTAKE 3: Trusting Only App Layer (No RLS)
```typescript
// Risky
async function chat(question: string, user: User) {
  // App filter only
  const results = await pool.query(
    `SELECT * FROM chunks WHERE document_id = $1`,
    [docId]
  );
  // If app has bug (forgets tenant_id check), data leaks!
}

// Secure
async function chat(question: string, user: User) {
  // App filter + Database enforces RLS
  const results = await pool.query(
    `SELECT * FROM chunks WHERE tenant_id = $1 AND document_id = $2`,
    [user.tenant_id, docId]
  );
  // Even if app has bug, database RLS prevents leak
}
```

### ❌ MISTAKE 4: Caching Without Tenant Context
```typescript
// WRONG
cache_key = hash(question)  // "Find John"
// Company A and B both get cached results for "Find John"
// Results get mixed!

// CORRECT
cache_key = hash(tenant_id + question)  // "company-001:Find John"
// Each tenant has separate cache
```

### ❌ MISTAKE 5: No Audit Logging
```typescript
// WRONG
async function chat(question: string) {
  return search(question);
  // No record of who searched what
  // Cannot debug data leaks
}

// CORRECT
async function chat(question: string, user: User) {
  const results = search(question);
  
  // Log every query
  await pool.query(
    `INSERT INTO access_logs (tenant_id, user_id, query, results_count)
     VALUES ($1, $2, $3, $4)`,
    [user.tenant_id, user.id, question, results.length]
  );
  
  return results;
}
```

---

## Summary: Staged Architecture Approach

### Architecture Evolution

**Phase 0: MVP (1-100 customers)**
```
Single PostgreSQL Database
├── All data in one chunks table
├── RLS enabled for security
├── 4 strategic indexes
└── Perfect for MVP ✅
```

**Phase 1: Growth (100-500 customers)**
```
PostgreSQL (Metadata)         Qdrant/Milvus (Vectors)
├── Lightweight              ├── Auto-sharded
├── No vectors               ├── 5-20 shards
├── RLS policies             ├── 50-100ms latency
└── Auth + access control    └── 50-100B chunks
```

**Phase 2: Scale (500-1000+ customers)**
```
PostgreSQL (Metadata)         Weaviate/Milvus (Production Scale)
├── Minimal data             ├── Managed cluster
├── Fast lookups             ├── Auto-rebalancing
├── RLS policies             ├── Native multi-tenancy
└── Audit trail              └── 10-50ms latency
```

**Phase 3: Enterprise (1000+ with compliance)**
```
Multiple Regions (US, EU, APAC)
├── Each region: PostgreSQL + Weaviate
├── Global load balancer
├── Data residency: GDPR/compliance
└── 5-20ms latency per region
```

---

### Key Principles

✅ **Start Simple:** Phase 0 (single table) is perfect for MVP
✅ **Scale Gracefully:** Each phase upgrades one component at a time
✅ **No Breaking Changes:** Data migrates, app logic updates gradually
✅ **Cost-Optimized:** Pay for capacity you need
✅ **Performance-Driven:** Each upgrade improves latency

---

### Critical Success Factors

1. **Tenant Isolation:** Every query filters by tenant_id (app + database)
2. **Role-Based Access:** Users only see documents they're authorized for
3. **Audit Logging:** Track all queries for compliance
4. **Strategic Indexing:** Right indexes for your query patterns
5. **Staged Migration:** Upgrade when needed, not before

---

### Do NOT

❌ Stay on Phase 0 beyond 100 customers (performance cliff)
❌ Use single table for 100B+ chunks (massive index overhead)
❌ Forget tenant_id filter in any query (data leak risk)
❌ Mix storage strategies without planning migration (chaos)
❌ Skip audit logging (compliance violation)

---

### Decision Tree

```
"Should I upgrade my architecture?"

├─ Customers > 100? 
│  └─ YES → Upgrade to Phase 1 (Hybrid)
│
├─ Query latency > 200ms?
│  └─ YES → Upgrade to Phase 1 (Hybrid)
│
├─ Chunks > 50M?
│  └─ YES → Upgrade to Phase 1 (Hybrid)
│
├─ Customers > 500?
│  └─ YES → Upgrade to Phase 2 (Dedicated Vector DB)
│
├─ Multi-region requirement?
│  └─ YES → Upgrade to Phase 3 (Multi-Region)
│
└─ GDPR/Data residency needed?
   └─ YES → Upgrade to Phase 3 (Multi-Region)
```

---

## You're Ready to Scale! 🚀

**Start with Phase 0** (single PostgreSQL)
**Upgrade to Phase 1** when you hit 100 customers
**Upgrade to Phase 2** when you hit 500 customers
**Upgrade to Phase 3** for enterprise compliance

Each phase supports 10x more data and users than the previous one.
