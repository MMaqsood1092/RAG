# Troubleshooting: ECONNRESET Error on Vercel

## Problem
```
Error: read ECONNRESET
at /var/task/node_modules/pg-pool/index.js:45:11
```

This means the PostgreSQL connection is being dropped by the server.

---

## Diagnosis Steps

### 1. Check Database Health
**Run this curl command**:
```bash
curl https://your-app.vercel.app/health
```

Expected response (healthy):
```json
{
  "status": "healthy",
  "timestamp": "2026-06-24T12:23:22.368Z",
  "database": "connected"
}
```

If you get connection error → **Database is unreachable**

---

### 2. Check DATABASE_URL

Your `DATABASE_URL` environment variable on Vercel must be set correctly.

**Verify on Vercel Dashboard**:
1. Go to your project → Settings → Environment Variables
2. Look for `DATABASE_URL`
3. Check it's NOT empty

**Format should be**:
```
postgresql://username:password@host:5432/database
```

---

## Common Issues & Solutions

### ❌ Issue 1: Database Firewall
**Error**: Connection times out or resets

**Solution**: 
- Add Vercel IP ranges to your database firewall
- Get Vercel IPs: https://vercel.com/docs/edge-network/deployments#vercel-region-ips
- Or allow all IPs (less secure): `0.0.0.0/0`

### ❌ Issue 2: Connection Pool Exhausted
**Error**: `ECONNRESET` after several attempts

**Solution**: 
- Reduce `max` connections in pool (currently 20)
- Use connection pooler service like PgBouncer
- Or upgrade PostgreSQL plan

### ❌ Issue 3: Database Offline
**Error**: Connection refused immediately

**Solution**:
- Check if PostgreSQL server is running
- Check if database exists
- Check port is correct (usually 5432)

### ❌ Issue 4: Wrong DATABASE_URL
**Error**: Authentication failed or unknown host

**Solution**:
- Verify username and password
- Verify hostname is correct
- Verify database name exists
- Test locally with same URL

---

## Quick Fixes

### Fix 1: Add Connection Pooler
Use a connection pooling service to handle serverless connections better.

**Option A: Supabase (recommended)**
```
# Replace your DATABASE_URL with Supabase's connection pooler
postgresql://user:password@db.supabase.co:6543/postgres?sslmode=require
```

**Option B: PgBouncer**
```
# Run PgBouncer in front of your PostgreSQL
# Add to connection string:
?sslmode=require
```

### Fix 2: Reduce Pool Size
In `src/db/client.ts`:
```typescript
return {
  // ... other config
  max: 5,  // Reduced from 20
  min: 1,  // Reduced from 2
  idleTimeoutMillis: 10000, // Reduced from 30000
  connectionTimeoutMillis: 5000, // Reduced from 10000
};
```

### Fix 3: Enable Connection Keepalive
In `src/db/client.ts`:
```typescript
return {
  // ... other config
  tcp_keepalives_idle: 30,
  tcp_keepalives_interval: 10,
  tcp_keepalives_count: 5,
};
```

### Fix 4: Check Environment Variable
On Vercel:
```bash
# From your local terminal
vercel env list

# Check DATABASE_URL is there
# If missing, add it:
vercel env add DATABASE_URL postgresql://...
```

---

## Testing Locally vs Vercel

### Local (works):
```bash
npm run dev
# Connects to local PostgreSQL
# No firewall issues
```

### Vercel (failing):
- Must pass through firewall
- Must have valid credentials
- Must handle connection pooling
- Must keep connections alive

---

## Recommended Solutions (Choose One)

### ✅ Solution A: Use Supabase (Easiest)
1. Create free Supabase project
2. Get connection string from Dashboard → Database → Connection Pooler
3. Use that as your `DATABASE_URL`
4. Set on Vercel with `vercel env add DATABASE_URL <url>`

### ✅ Solution B: Self-Hosted + Firewall Rules
1. Verify PostgreSQL server is running
2. Add Vercel IP ranges to firewall
3. Test connection with `psql` from Vercel region
4. Increase connection pool timeout

### ✅ Solution C: Local PostgreSQL + Ngrok (Testing Only)
```bash
# Expose local PostgreSQL to internet (for testing)
ngrok tcp 5432

# Use ngrok URL as DATABASE_URL
# Not recommended for production
```

---

## Verify Your Setup

**Test 1**: Can you connect locally?
```bash
psql "postgresql://user:password@host:5432/database"
```

**Test 2**: Is database online?
```bash
ping <your-host>
```

**Test 3**: Are credentials correct?
```bash
# Check in .env or environment variables
cat .env | grep DATABASE_URL
```

**Test 4**: Is firewall open?
- Ask your database provider if Vercel IPs are whitelisted
- If not, whitelist them

---

## Next Steps

1. **Run** `curl https://your-app.vercel.app/health`
2. **Check** Vercel environment variables
3. **Verify** DATABASE_URL is correct
4. **Add** Vercel IPs to database firewall OR use Supabase
5. **Test** again

---

## Still Failing?

**Provide these details** when asking for help:
- `curl https://your-app.vercel.app/health` response
- DATABASE_URL format (hide credentials)
- Error message exact text
- Local connection works? (yes/no)
- Database provider (PostgreSQL, Supabase, AWS RDS, etc.)

---

## Health Check Endpoint

You now have a `/health` endpoint:

```bash
# Check if database is reachable
curl https://your-app.vercel.app/health

# Response if healthy:
# {"status":"healthy","timestamp":"...","database":"connected"}

# Response if unhealthy:
# {"status":"unhealthy","error":"...","code":"ECONNRESET","database":"disconnected"}
```

Use this to quickly diagnose database connectivity!
