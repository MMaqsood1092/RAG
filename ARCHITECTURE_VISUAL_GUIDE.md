# Architecture Visual Guide

## Quick Visual Overview of All 4 Phases

### PHASE 0: MVP (Single PostgreSQL)
```
┌─────────────────────────────────────┐
│      PostgreSQL Database            │
├─────────────────────────────────────┤
│ tenants                             │
│ users                               │
│ documents                           │
│ chunks (with embedding vectors)    │
│                                     │
│ Indexes:                            │
│ - IVFFlat (vector search)          │
│ - B-tree (tenant, doc, access)     │
└─────────────────────────────────────┘
       ↓ Query ↓
   50-100ms latency
   ✅ Perfect for MVP
   ❌ Breaks at 100B chunks
```

**Scale:** 1-100 customers, <50M chunks
**Cost:** $500-1k/month
**Status:** Start here

---

### PHASE 1: GROWTH (Hybrid)
```
┌──────────────────────────┐      ┌─────────────────────────┐
│   PostgreSQL (Metadata)  │      │  Qdrant (5-20 shards)   │
├──────────────────────────┤      ├─────────────────────────┤
│ tenants                  │      │ Shard 1: 5-10M vectors │
│ users                    │      ├─────────────────────────┤
│ documents                │      │ Shard 2: 5-10M vectors │
│ chunks_metadata          │      ├─────────────────────────┤
│ (NO embedding vectors!)  │      │ Shard 3: 5-10M vectors │
│                          │      ├─────────────────────────┤
│ Indexes: B-tree only     │      │ Shard N: ...            │
│ (fast lookups)           │      │                         │
└──────────────────────────┘      │ Auto-sharding          │
          ↑ Join ←──────────────────┘ Tenant filtering
                                  (built-in)
          
Step 1: Get accessible docs from PostgreSQL
Step 2: Search vectors in Qdrant (50-100ms)
Step 3: Join results
   ↓
50-100ms latency
✅ Scales to 100B chunks
✅ Distributed search
```

**Scale:** 100-500 customers, 50-100B chunks
**Cost:** $1-2k/month
**Upgrade trigger:** >100 customers OR query latency >200ms
**Migration time:** 2-3 weeks

---

### PHASE 2: SCALE (Dedicated Vector DB)
```
┌──────────────────────────┐      ┌──────────────────────────────┐
│ PostgreSQL (Minimal)     │      │ Weaviate Cluster (10-20 nodes)
├──────────────────────────┤      ├──────────────────────────────┤
│ tenants                  │      │ Node 1: 50M vectors         │
│ users                    │      ├──────────────────────────────┤
│ documents                │      │ Node 2: 50M vectors         │
│ (auth + access only)     │      ├──────────────────────────────┤
│                          │      │ Node 3: 50M vectors         │
│ Minimal indexes          │      ├──────────────────────────────┤
└──────────────────────────┘      │ Load Balancer               │
          ↑ Lookup ←─────────────→ Auto-rebalancing
                                  Multi-tenancy (native)
                                  Cross-shard queries ✅
          
Step 1: Query Weaviate directly (10-50ms)
   - Tenant filtering built-in
   - Auto-routing to correct node
   - No metadata lookups needed for filtering
Step 2: Return results
   ↓
10-50ms latency
✅ Scales to 500B+ chunks
✅ Native multi-tenancy
✅ Auto-scaling
✅ Less operational work
```

**Scale:** 500-1000+ customers, 100-500B chunks
**Cost:** $5-15k/month
**Upgrade trigger:** >500 customers OR need auto-scaling
**Migration time:** 3-5 weeks

---

### PHASE 3: ENTERPRISE (Multi-Region)
```
┌─────────────────────────────────────────────────────────────┐
│              Global Load Balancer                           │
│  (Routes by region, latency, data residency)               │
└────┬─────────────────┬──────────────────┬──────────────────┘
     │                 │                  │
     ↓                 ↓                  ↓

┌─────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  US Region      │ │  EU Region       │ │  APAC Region     │
├─────────────────┤ ├──────────────────┤ ├──────────────────┤
│ PostgreSQL (US) │ │ PostgreSQL (EU)  │ │ PostgreSQL (APAC)│
│ Weaviate (US)   │ │ Weaviate (EU)    │ │ Weaviate (APAC)  │
│                 │ │                  │ │                  │
│ 300 companies   │ │ 300 companies    │ │ 200 companies    │
│ 300B vectors    │ │ 300B vectors     │ │ 200B vectors     │
│                 │ │ (GDPR: EU data   │ │                  │
│ Latency: 5-10ms │ │  stays in EU)    │ │ Latency: 5-10ms │
└─────────────────┘ └──────────────────┘ └──────────────────┘

Query from US customer:
  → Routed to US region → 5-10ms latency
  
Query from EU customer:
  → Routed to EU region → 5-10ms latency (GDPR compliant)
  
Failover:
  → If US region down → Query EU replica (longer latency)
  → Auto-recovery when US comes back online
   ↓
5-20ms latency (geo-optimized)
✅ 1T+ chunks possible
✅ GDPR/compliance ready
✅ Data residency guaranteed
✅ Failover support
```

**Scale:** 1000+ customers, 1T+ chunks
**Cost:** $20-50k/month
**Upgrade trigger:** GDPR/data residency requirements
**Setup time:** 4-8 weeks

---

## Decision Tree (Visual)

```
                          Start Here
                             ↓
                    "Build SaaS for 1000+ companies"
                             ↓
                    ┌────────────────┐
                    │ How many users?│
                    └────────────────┘
                             ↓
                    ┌────────────────────┐
              ┌─────│ <100 customers?    │────────┐
              │     └────────────────────┘        │
            YES                                   NO
              │                                    │
              ↓                                    ↓
        ┌──────────────┐            ┌──────────────────────┐
        │ Phase 0:     │            │ Query latency ok?    │
        │ PostgreSQL   │            └──────────────────────┘
        │              │                        ↓
        │ 1-2 weeks    │              ┌────────────────────┐
        │ $500-1k/mo   │         ┌────│ <200ms latency?    │────────┐
        │              │         │    └────────────────────┘        │
        │ ✅ START HERE│       YES                                  NO
        └──────────────┘         │                                   │
                                  ↓                                   ↓
                        ┌──────────────────┐      ┌──────────────────┐
                        │ 100-500          │      │ Customers >500?  │
                        │ customers?       │      └──────────────────┘
                        └──────────────────┘               ↓
                             ↓                ┌────────────────────┐
                       ┌──────┴──────┐   ┌────│ YES (GDPR needed)?│
                      YES            NO  │    └────────────────────┘
                        │              │  │
                        ↓              │  ├─ YES: Phase 3 (Multi-region)
                  ┌────────────────┐   │  │
                  │ Phase 1:       │   │  └─ NO: Phase 2 (Weaviate)
                  │ Hybrid         │   │
                  │ (PostgreSQL +  │   ↓
                  │  Qdrant)       │ ┌──────────────────┐
                  │                │ │ Phase 2:         │
                  │ 2-3 weeks      │ │ Dedicated Vector │
                  │ $1-2k/mo       │ │ DB (Weaviate)    │
                  │                │ │                  │
                  │ ✅ UPGRADE     │ │ 3-5 weeks        │
                  └────────────────┘ │ $5-15k/mo        │
                        ↓            │                  │
                   Continues to:     │ ✅ UPGRADE       │
                   Phase 2 at 500    └──────────────────┘
                   customers               ↓
                                    ┌──────────────────┐
                                    │ Phase 3:         │
                                    │ Multi-Region     │
                                    │                  │
                                    │ 4-8 weeks        │
                                    │ $20-50k/mo       │
                                    │                  │
                                    │ ✅ ENTERPRISE    │
                                    └──────────────────┘
```

---

## Cost Comparison

```
Phase  Customers  Chunks      Cost/Month  Latency  Complexity
────   ──────────  ────────    ──────────  ───────  ──────────
0      1-100      <50M        $500-1k    50-100ms  ⭐
1      100-500    50-100B     $1-2k      50-100ms  ⭐⭐⭐
2      500-1000   100-500B    $5-15k     10-50ms   ⭐⭐
3      1000+      1T+         $20-50k    5-20ms    ⭐⭐⭐⭐
```

---

## Data Isolation (All Phases)

```
┌─────────────────────────────────────────┐
│ API Request (with API key)              │
└────┬────────────────────────────────────┘
     │
     ↓
┌─────────────────────────────────────────┐
│ API Key Validation                      │  ← Extract tenant_id
│ "sk_live_abc123" → "company-001"       │
└────┬────────────────────────────────────┘
     │
     ↓
┌─────────────────────────────────────────┐
│ User Authorization Check                │  ← Check role
│ Role: "manager" → Can access doc-001?  │
└────┬────────────────────────────────────┘
     │
     ↓
┌─────────────────────────────────────────┐
│ Application Filter                      │  ← Add tenant_id
│ WHERE tenant_id = 'company-001'        │
└────┬────────────────────────────────────┘
     │
     ↓
┌─────────────────────────────────────────┐
│ Vector Search (Database or Vector DB)   │  ← Search within tenant
│ Phase 0: PostgreSQL IVFFlat             │
│ Phase 1: Qdrant (native filtering)      │
│ Phase 2: Weaviate (native filtering)    │
│ Phase 3: Regional Weaviate (geo-routed) │
└────┬────────────────────────────────────┘
     │
     ↓
┌─────────────────────────────────────────┐
│ Results: Only "company-001" data ✅     │
└─────────────────────────────────────────┘
```

---

## Migration Path (Visual)

```
Phase 0 (MVP)
    ↓
Start Here
PostgreSQL only
1-100 customers

    ↓
    │ At 100+ customers
    │ OR query latency >200ms
    │
    ↓ 2-3 week migration
    
Phase 1 (Growth)
Add Qdrant
PostgreSQL + Qdrant
100-500 customers

    ↓
    │ At 500+ customers
    │ OR need auto-scaling
    │
    ↓ 3-5 week migration
    
Phase 2 (Scale)
Replace with Weaviate
PostgreSQL (metadata) + Weaviate (vectors)
500-1000+ customers

    ↓
    │ Need GDPR compliance
    │ OR 1000+ customers
    │
    ↓ 4-8 week setup
    
Phase 3 (Enterprise)
Multi-region
Weaviate + PostgreSQL per region
1000+ customers, global reach
```

---

## Performance Metrics by Phase

```
Metric              Phase 0  Phase 1   Phase 2  Phase 3
─────               ───────  ────────  ────────  ──────
Query latency       50-100ms 50-100ms  10-50ms  5-20ms
P99 latency         <500ms   <300ms    <150ms   <100ms
Max chunk count     50M      100B+     500B+    1T+
Ingestion rate      10k/sec  100k/sec  1M/sec   1M+/sec
Backup time         2-4hrs   <1hr/shard <30m   <15m/region
RTO (Recovery Time) 30 min   15 min    5 min    <1 min
Uptime SLA          99.5%    99.9%     99.99%   99.99%+
```

---

## When NOT to Skip Phases

```
❌ Don't jump from Phase 0 → Phase 2
   Reason: Skip Phase 1 (Hybrid) - that's a proven growth stage

❌ Don't stay on Phase 0 beyond 100 customers
   Reason: Performance cliff at 50M chunks

❌ Don't use Phase 1 for 1000+ customers
   Reason: Manual Qdrant management becomes painful

❌ Don't skip Phase 3 if you need GDPR
   Reason: EU data MUST stay in EU (legal requirement)
```

---

## Timeline to Production

```
Month 1: Phase 0 (MVP)
├─ Week 1: Design & review
├─ Week 2-3: Development
└─ Week 4: Testing & launch

Month 3-4: Phase 1 (Growth - when hitting 100 customers)
├─ Week 1: Planning
├─ Week 2: Staging
└─ Week 3: Production migration (2-3 weeks)

Month 6-8: Phase 2 (Scale - when hitting 500 customers)
├─ Week 1-2: Planning
├─ Week 3-5: Migration
└─ Week 6: Stabilization

Month 12+: Phase 3 (Enterprise - when hitting 1000+ or needing GDPR)
├─ Week 1-2: Planning
├─ Week 3-6: Multi-region setup
└─ Week 7-8: Compliance verification & launch
```

---

**Summary:** Start with Phase 0 (simple), upgrade when needed (Phases 1-3), scale to any size. 🚀
