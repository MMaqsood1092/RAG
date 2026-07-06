import { Request, Response, NextFunction } from 'express';
import { validateApiKey, verifyJWT, setTenantContext } from '../services/auth';
import { pool } from '../db/client';

// Extend Express Request to include auth context
declare global {
  namespace Express {
    interface Request {
      tenant_id?: string;
      user_id?: string;
      user_email?: string;
      ip_address?: string;
      user_agent?: string;
    }
  }
}

/**
 * API Key Authentication Middleware
 * Validates the API key from Authorization header
 * Format: Authorization: Bearer {api_key}
 */
export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header. Use: Bearer {api_key}',
      });
      return;
    }
    
    const apiKey = authHeader.slice(7); // Remove "Bearer " prefix
    
    // Validate API key
    const tenant = await validateApiKey(apiKey);
    
    if (!tenant) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or inactive API key',
      });
      return;
    }
    
    // Add tenant context to request
    req.tenant_id = tenant.id;
    req.ip_address = req.ip;
    req.user_agent = req.headers['user-agent'];
    
    // Set RLS context for database
    const client = await pool.connect();
    try {
      await setTenantContext(client, tenant.id);
    } finally {
      client.release();
    }
    
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication check failed',
    });
  }
}

/**
 * JWT Token Authentication Middleware
 * Validates JWT token from Authorization header
 * Format: Authorization: Bearer {jwt_token}
 */
export async function jwtAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header',
      });
      return;
    }
    
    const token = authHeader.slice(7);
    
    // Verify JWT
    const decoded = verifyJWT(token);
    
    if (!decoded) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
      return;
    }
    
    // Add user context to request
    req.tenant_id = decoded.tenant_id;
    req.user_id = decoded.user_id;
    req.user_email = decoded.email;
    req.ip_address = req.ip;
    req.user_agent = req.headers['user-agent'];
    
    // Set RLS context for database
    const client = await pool.connect();
    try {
      await setTenantContext(client, decoded.tenant_id);
    } finally {
      client.release();
    }
    
    next();
  } catch (err) {
    console.error('JWT auth middleware error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication check failed',
    });
  }
}

/**
 * Optional Auth Middleware
 * Tries to authenticate but doesn't fail if missing
 * Useful for endpoints that can work both authenticated and unauthenticated
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }
    
    const token = authHeader.slice(7);
    
    // Try JWT first
    let decoded = verifyJWT(token);
    
    // Fall back to API key
    if (!decoded) {
      const tenant = await validateApiKey(token);
      if (tenant) {
        req.tenant_id = tenant.id;
      }
    } else {
      req.tenant_id = decoded.tenant_id;
      req.user_id = decoded.user_id;
      req.user_email = decoded.email;
    }
    
    req.ip_address = req.ip;
    req.user_agent = req.headers['user-agent'];
    
    // Set RLS context if authenticated
    if (req.tenant_id) {
      const client = await pool.connect();
      try {
        await setTenantContext(client, req.tenant_id);
      } finally {
        client.release();
      }
    }
    
    next();
  } catch (err) {
    console.error('Optional auth middleware error:', err);
    next(); // Continue even on error for optional auth
  }
}

/**
 * Permission Check Middleware
 * Verify user has specific permission
 * Usage: app.post('/admin', permissionCheck('manage_users'), handler)
 */
export function permissionCheck(_requiredPermission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user_id) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'User authentication required for this action',
        });
        return;
      }
      
      // TODO: Implement permission checking
      // const hasPermission = await userHasPermission(req.user_id, _requiredPermission);
      
      // if (!hasPermission) {
      //   res.status(403).json({
      //     error: 'Forbidden',
      //     message: `Permission denied: ${_requiredPermission}`,
      //   });
      //   return;
      // }
      
      next();
    } catch (err) {
      console.error('Permission check error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Permission check failed',
      });
    }
  };
}

/**
 * Audit Logging Middleware
 * Logs all requests for compliance and debugging
 */
export async function auditLog(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Capture response time
  const startTime = Date.now();
  
  // Hook into response to log after it's sent
  const originalJson = res.json;
  res.json = function(data: any) {
    const executionTime = Date.now() - startTime;
    
    // Log the request (async, don't wait)
    if (req.tenant_id) {
      logAccessEvent(
        req.tenant_id,
        req.user_id,
        req.method,
        req.path,
        executionTime,
        res.statusCode,
        req.ip_address,
        req.user_agent
      ).catch(err => console.error('Error logging access event:', err));
    }
    
    return originalJson.call(this, data);
  };
  
  next();
}

/**
 * Helper function to log access events
 */
async function logAccessEvent(
  tenantId: string,
  userId: string | undefined,
  method: string,
  path: string,
  executionTimeMs: number,
  statusCode: number,
  ipAddress: string | undefined,
  userAgent: string | undefined
): Promise<void> {
  try {
    // Determine action from method and path
    let action = 'search';
    if (method === 'POST' && path.includes('/upload')) action = 'upload';
    if (method === 'DELETE') action = 'delete';
    if (path.includes('/login')) action = 'login';
    
    await pool.query(
      `INSERT INTO access_logs 
       (tenant_id, user_id, action, execution_time_ms, status, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tenantId,
        userId,
        action,
        executionTimeMs,
        statusCode >= 200 && statusCode < 300 ? 'success' : 'error',
        ipAddress,
        userAgent,
      ]
    );
  } catch (err) {
    console.error('Error logging access event:', err);
  }
}
