import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from '../db/client';
import { Tenant, User, AuthenticatedRequest } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '24h';

// ============================================================================
// API KEY VALIDATION - Primary authentication method
// ============================================================================

/**
 * Validate API key and return tenant
 * Called on every request to verify the API key
 */
export async function validateApiKey(apiKey: string): Promise<Tenant | null> {
  try {
    const { rows } = await pool.query<Tenant>(
      `SELECT * FROM tenants WHERE api_key = $1 AND status = 'active'`,
      [apiKey]
    );
    
    return rows[0] || null;
  } catch (err) {
    console.error('API key validation error:', err);
    return null;
  }
}

/**
 * Generate a new API key for a tenant
 */
export async function generateApiKey(): Promise<string> {
  return `sk_live_${Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('hex')}`;
}

/**
 * Get tenant by name
 */
export async function getTenantByName(name: string): Promise<Tenant | null> {
  try {
    const { rows } = await pool.query<Tenant>(
      `SELECT * FROM tenants WHERE name = $1`,
      [name]
    );
    
    return rows[0] || null;
  } catch (err) {
    console.error('Error getting tenant:', err);
    return null;
  }
}

/**
 * Get tenant by ID
 */
export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  try {
    const { rows } = await pool.query<Tenant>(
      `SELECT * FROM tenants WHERE id = $1`,
      [tenantId]
    );
    
    return rows[0] || null;
  } catch (err) {
    console.error('Error getting tenant by ID:', err);
    return null;
  }
}

// ============================================================================
// TENANT MANAGEMENT
// ============================================================================

/**
 * Create a new tenant (company/organization)
 * This automatically creates default roles (admin, manager, viewer)
 */
export async function createTenant(name: string, plan: 'free' | 'pro' | 'enterprise' = 'free'): Promise<{ tenant: Tenant; api_key: string } | null> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Generate API key
    const api_key = `sk_live_${Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('hex')}`;
    
    // Create tenant
    const { rows } = await client.query<Tenant>(
      `INSERT INTO tenants (name, api_key, plan, status) 
       VALUES ($1, $2, $3, 'active')
       RETURNING *`,
      [name, api_key, plan]
    );
    
    const tenant = rows[0];
    
    // Call function to create default roles
    await client.query(`SELECT create_default_roles_for_tenant($1)`, [tenant.id]);
    
    await client.query('COMMIT');
    
    return { tenant, api_key };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating tenant:', err);
    return null;
  } finally {
    client.release();
  }
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

/**
 * Create a new user for a tenant
 */
export async function createUser(
  tenantId: string,
  email: string,
  password: string,
  roleName: string = 'viewer'
): Promise<User | null> {
  try {
    // Hash password
    const password_hash = await bcrypt.hash(password, 10);
    
    // Get role
    const { rows: roleRows } = await pool.query(
      `SELECT id FROM roles WHERE tenant_id = $1 AND name = $2`,
      [tenantId, roleName]
    );
    
    if (roleRows.length === 0) {
      console.error(`Role '${roleName}' not found for tenant`);
      return null;
    }
    
    const role_id = roleRows[0].id;
    
    // Create user
    const { rows } = await pool.query<User>(
      `INSERT INTO users (tenant_id, email, password_hash, role_id, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id, tenant_id, email, role_id, status, created_at, updated_at`,
      [tenantId, email, password_hash, role_id]
    );
    
    return rows[0] || null;
  } catch (err) {
    console.error('Error creating user:', err);
    return null;
  }
}

/**
 * Get user by email
 */
export async function getUserByEmail(tenantId: string, email: string): Promise<User | null> {
  try {
    const { rows } = await pool.query<User>(
      `SELECT * FROM users WHERE tenant_id = $1 AND email = $2`,
      [tenantId, email]
    );
    
    return rows[0] || null;
  } catch (err) {
    console.error('Error getting user:', err);
    return null;
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  try {
    const { rows } = await pool.query<User>(
      `SELECT * FROM users WHERE id = $1`,
      [userId]
    );
    
    return rows[0] || null;
  } catch (err) {
    console.error('Error getting user by ID:', err);
    return null;
  }
}

/**
 * Verify password
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, storedHash);
  } catch (err) {
    console.error('Error verifying password:', err);
    return false;
  }
}

// ============================================================================
// JWT TOKEN MANAGEMENT
// ============================================================================

/**
 * Generate JWT token for user
 */
export function generateJWT(user: User): { token: string; expiresIn: number } {
  const token = jwt.sign(
    {
      user_id: user.id,
      tenant_id: user.tenant_id,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
  
  return {
    token,
    expiresIn: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  };
}

/**
 * Verify JWT token
 */
export function verifyJWT(token: string): { user_id: string; tenant_id: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return {
      user_id: decoded.user_id,
      tenant_id: decoded.tenant_id,
      email: decoded.email,
    };
  } catch (err) {
    console.error('JWT verification error:', err);
    return null;
  }
}

// ============================================================================
// ROLE-BASED ACCESS CONTROL
// ============================================================================

/**
 * Check if user has permission
 */
export async function userHasPermission(
  userId: string,
  permission: string
): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `SELECT permissions FROM roles 
       WHERE id = (SELECT role_id FROM users WHERE id = $1)`,
      [userId]
    );
    
    if (rows.length === 0) return false;
    
    const permissions = rows[0].permissions || {};
    return permissions[permission] === true;
  } catch (err) {
    console.error('Error checking permission:', err);
    return false;
  }
}

/**
 * Get user's role
 */
export async function getUserRole(userId: string): Promise<{ name: string; permissions: Record<string, boolean> } | null> {
  try {
    const { rows } = await pool.query(
      `SELECT r.name, r.permissions FROM roles r
       WHERE r.id = (SELECT role_id FROM users WHERE id = $1)`,
      [userId]
    );
    
    return rows[0] || null;
  } catch (err) {
    console.error('Error getting user role:', err);
    return null;
  }
}

// ============================================================================
// TENANT CONTEXT (RLS)
// ============================================================================

/**
 * Set tenant context for RLS policies
 * Must be called at the beginning of each request
 */
export async function setTenantContext(client: any, tenantId: string): Promise<void> {
  try {
    await client.query(`SET app.tenant_id = $1`, [tenantId]);
  } catch (err) {
    console.error('Error setting tenant context:', err);
  }
}

/**
 * Create a request context with tenant information
 */
export function createAuthContext(
  tenantId: string,
  userId?: string,
  ipAddress?: string,
  userAgent?: string
): AuthenticatedRequest {
  return {
    tenant_id: tenantId,
    user_id: userId,
    ip_address: ipAddress,
    user_agent: userAgent,
  };
}
