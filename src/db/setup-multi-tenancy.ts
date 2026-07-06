/**
 * Setup Multi-Tenancy
 * Run this after running the SQL migration to verify everything is working
 * Usage: ts-node src/db/setup-multi-tenancy.ts
 */

import { pool } from "./client";
import { createTenant, createUser } from "../services/auth";

async function setup() {
  console.log("🔧 Setting up multi-tenancy...\n");

  try {
    // Create test tenants
    console.log("📝 Creating test tenants...");

    const tenant1 = await createTenant("Acme Corp", "pro");
    if (tenant1) {
      console.log(`✓ Tenant 1 created:`);
      console.log(`  - ID: ${tenant1.tenant.id}`);
      console.log(`  - Name: ${tenant1.tenant.name}`);
      console.log(`  - API Key: ${tenant1.api_key}`);
      console.log(`  - Plan: ${tenant1.tenant.plan}\n`);
    }

    const tenant2 = await createTenant("TechCorp", "pro");
    if (tenant2) {
      console.log(`✓ Tenant 2 created:`);
      console.log(`  - ID: ${tenant2.tenant.id}`);
      console.log(`  - Name: ${tenant2.tenant.name}`);
      console.log(`  - API Key: ${tenant2.api_key}`);
      console.log(`  - Plan: ${tenant2.tenant.plan}\n`);
    }

    // Create test users for tenant 1
    if (tenant1) {
      console.log("👥 Creating users for Acme Corp...");
      
      const admin = await createUser(tenant1.tenant.id, "alice@acme.com", "password123", "admin");
      if (admin) {
        console.log(`  ✓ Admin: ${admin.email}`);
      }

      const manager = await createUser(tenant1.tenant.id, "bob@acme.com", "password123", "manager");
      if (manager) {
        console.log(`  ✓ Manager: ${manager.email}`);
      }

      const viewer = await createUser(tenant1.tenant.id, "carol@acme.com", "password123", "viewer");
      if (viewer) {
        console.log(`  ✓ Viewer: ${viewer.email}\n`);
      }
    }

    // Verify tables
    console.log("📊 Verifying setup...");

    const tenantCount = await pool.query("SELECT COUNT(*) as count FROM tenants");
    console.log(`  - Tenants: ${tenantCount.rows[0].count}`);

    const userCount = await pool.query("SELECT COUNT(*) as count FROM users");
    console.log(`  - Users: ${userCount.rows[0].count}`);

    const roleCount = await pool.query("SELECT COUNT(*) as count FROM roles");
    console.log(`  - Roles: ${roleCount.rows[0].count}\n`);

    console.log("✅ Multi-tenancy setup complete!");
    console.log("\n📝 Next steps:");
    console.log("   1. Update your .env with one of the API keys above");
    console.log("   2. Start the server: npm run dev");
    console.log("   3. Test the endpoints using the provided API key");

    process.exit(0);
  } catch (err) {
    console.error("❌ Setup failed:", err);
    process.exit(1);
  }
}

setup();
