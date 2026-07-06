import express, { Request, Response } from "express";
import multer from "multer";
import { chat } from "./api/chat";
import { uploadAndIngest } from "./api/upload";
import { apiKeyAuth, auditLog } from "./middleware/auth";
import {
  createTenant,
  createUser,
  getTenantById,
} from "./services/auth";
// import {
//   invokeModel,
//   embedTexts,
//   answerQuestion,
//   classifyText,
//   summarizeText,
//   extractNER,
//   generateText,
// } from "./api/models";
import { config } from "./config";
import { pool } from "./db/client";

const app = express();
app.use(express.json());
app.use(auditLog); // Log all requests

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max file size
  },
});

/**
 * Health check endpoint - diagnose database connectivity
 */
app.get("/health", async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query("SELECT NOW() as timestamp");
    res.json({
      status: "healthy",
      timestamp: result.rows[0].timestamp,
      database: "connected",
    });
  } catch (err: any) {
    console.error("Health check failed:", err);
    res.status(503).json({
      status: "unhealthy",
      error: err.message,
      code: err.code,
      database: "disconnected",
    });
  }
});

/**
 * ============================================================================
 * AUTHENTICATION ENDPOINTS
 * ============================================================================
 */

/**
 * POST /auth/register
 * Create a new tenant (company/organization)
 * Body: { name: string, plan?: 'free' | 'pro' | 'enterprise' }
 * Response: { tenant_id, api_key, admin_user }
 */
app.post("/auth/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, plan = "free" } = req.body;

    if (!name) {
      res.status(400).json({ error: "Tenant name is required" });
      return;
    }

    // Create tenant
    const result = await createTenant(name, plan);

    if (!result) {
      res.status(400).json({ error: "Failed to create tenant (name may already exist)" });
      return;
    }

    const { tenant, api_key } = result;

    // Create default admin user
    const adminUser = await createUser(tenant.id, `admin@${name.toLowerCase()}.local`, "change-me", "admin");

    res.status(201).json({
      success: true,
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      api_key,
      admin_user: adminUser ? { id: adminUser.id, email: adminUser.email } : null,
      message: "Tenant created successfully. Use api_key for authentication.",
    });
    return;
  } catch (err: any) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Failed to create tenant" });
    return;
  }
});

/**
 * POST /auth/login
 * Authenticate using API key
 * Body: { api_key: string }
 * Response: { access_token, tenant_id, expires_in }
 */
app.post("/auth/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { api_key } = req.body;

    if (!api_key) {
      res.status(400).json({ error: "API key is required" });
      return;
    }

    // Validate API key (this checks if tenant exists and is active)
    const tenant = await getTenantById(api_key.substring(8)); // Extract tenant_id from key format

    if (!tenant) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    // For now, create a basic token (no user context)
    // const token = `tenant_${tenant.id}_${Math.random().toString(36).substring(7)}`;

    res.json({
      success: true,
      access_token: `Bearer ${api_key}`,
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      expires_in: 24 * 60 * 60,
      message: "Use the access_token in Authorization header: Bearer {api_key}",
    });
    return;
  } catch (err: any) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Authentication failed" });
    return;
  }
});

/**
 * ============================================================================
 * PROTECTED ENDPOINTS (Require API Key)
 * ============================================================================
 */

/**
 * POST /chat
 * Search documents using semantic similarity
 * Requires: Authorization header with API key
 * Body: { question: string, doc_id?: string, filters?: {...} }
 */
app.post("/chat", apiKeyAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { question, doc_id, filters } = req.body;

    if (!question) {
      res.status(400).json({ error: "Question is required" });
      return;
    }

    const result = await chat(req, question, { doc_id, ...filters });

    res.json(result);
    return;
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

/**
 * POST /upload
 * Upload and ingest documents
 * Requires: Authorization header with API key
 * Accepts: multipart/form-data with "files" field
 */
app.post("/upload", apiKeyAuth, upload.array("files", 20), uploadAndIngest);

/**
 * GET /documents
 * List tenant's documents
 * Requires: Authorization header with API key
 */
app.get("/documents", apiKeyAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.tenant_id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, name, source, status, file_size, access_level, created_at
       FROM documents
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [req.tenant_id]
    );

    res.json({ success: true, documents: rows });
    return;
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

/**
 * GET /stats
 * Get tenant usage statistics
 * Requires: Authorization header with API key
 */
app.get("/stats", apiKeyAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.tenant_id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [docsResult, chunksResult, usersResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM documents WHERE tenant_id = $1`, [req.tenant_id]),
      pool.query(`SELECT COUNT(*) as count FROM chunks WHERE tenant_id = $1`, [req.tenant_id]),
      pool.query(`SELECT COUNT(*) as count FROM users WHERE tenant_id = $1`, [req.tenant_id]),
    ]);

    res.json({
      success: true,
      stats: {
        documents_count: parseInt(docsResult.rows[0].count),
        chunks_count: parseInt(chunksResult.rows[0].count),
        users_count: parseInt(usersResult.rows[0].count),
      },
    });
    return;
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

// /**
//  * DISABLED: HuggingFace Model Integration Endpoints
//  * TODO: Enable when multi-model support is implemented
//  */

// // Generic model invocation
// app.post("/models/invoke", invokeModel);

// // Embedding endpoint (supports both Voyage and HuggingFace)
// app.post("/models/embed", embedTexts);

// // Question Answering
// app.post("/models/qa", answerQuestion);

// // Text Classification
// app.post("/models/classify", classifyText);

// // Summarization
// app.post("/models/summarize", summarizeText);

// // Named Entity Recognition
// app.post("/models/ner", extractNER);

// // Text Generation
// app.post("/models/generate", generateText);

app.listen(config.port, () => {
  console.log(`🚀 Server on port ${config.port}`);
});
