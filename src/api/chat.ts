import { pool } from "../db/client";
import { config } from "../config";
import { ChatResponse, ChunkSearchResult } from "../types";
import { Request } from "express";

const VOYAGE_BASE_URL = "https://api.voyageai.com/v1";

// Rate limiting for Voyage free tier: 3 RPM = 1 request per 20 seconds
const VOYAGE_MIN_REQUEST_INTERVAL_MS = 20000; // 20 seconds
let lastVoyageRequestTime = 0;

/**
 * Multi-tenant chat query using Voyage embeddings
 * Returns matching chunks with relevance scores (no LLM generation, no history)
 * CRITICAL: Filters by tenant_id for data isolation
 */
export async function chat(
  req: Request,
  question: string,
  filters?: any
): Promise<ChatResponse> {
  const startTime = Date.now();
  
  try {
    if (!req.tenant_id) {
      throw new Error('Tenant ID is required');
    }

    // Generate embedding for the query
    const embedding = await embedQuery(question);

    // Build dynamic WHERE clause based on filters
    let whereClause = 'c.tenant_id = $1';
    const params: any[] = [req.tenant_id];
    let paramIndex = 2;

    // Filter by specific document if provided
    if (filters?.doc_id) {
      whereClause += ` AND c.document_id = $${paramIndex}`;
      params.push(filters.doc_id);
      paramIndex++;
    }

    // Filter by access level if provided
    if (filters?.access_level) {
      whereClause += ` AND c.access_level = $${paramIndex}`;
      params.push(filters.access_level);
      paramIndex++;
    }

    // Add embedding vector as param
    const embeddingVector = `[${embedding.join(",")}]`;
    params.push(embeddingVector);

    // Vector search - get top 10 most relevant chunks
    // CRITICAL: Filter by tenant_id BEFORE vector search for security
    const { rows } = await pool.query<{
      id: string;
      document_id: string;
      content: string;
      embedding: string;
      access_level: string;
      metadata?: any;
    }>(
      `SELECT c.id, c.document_id, c.content, c.embedding, c.access_level, c.metadata
       FROM chunks c
       WHERE ${whereClause}
       ORDER BY c.embedding <=> $${paramIndex}::vector
       LIMIT 10`,
      params
    );

    // Calculate similarity scores for results
    const results: ChunkSearchResult[] = rows.map((row) => {
      const score = calculateCosineSimilarity(embedding, row.embedding);
      return {
        id: row.id,
        tenant_id: req.tenant_id!,
        document_id: row.document_id,
        content: row.content,
        access_level: row.access_level as 'private' | 'shared' | 'public',
        metadata: row.metadata,
        score: Math.round(score * 1000) / 1000,
      };
    });

    const executionTime = Date.now() - startTime;

    return {
      results,
      execution_time_ms: executionTime,
      tokens_used: Math.ceil(question.length / 4), // Rough estimate
    };
  } catch (err) {
    console.error("Chat query failed:", err);
    const executionTime = Date.now() - startTime;
    return {
      results: [],
      execution_time_ms: executionTime,
    };
  }
}

/**
 * Generate embedding using Voyage AI with rate limiting
 */
async function embedQuery(text: string): Promise<number[]> {
  // Apply rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastVoyageRequestTime;
  
  if (timeSinceLastRequest < VOYAGE_MIN_REQUEST_INTERVAL_MS) {
    const waitTime = VOYAGE_MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastVoyageRequestTime = Date.now();

  const response = await fetch(`${VOYAGE_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.voyageKey}`,
    },
    body: JSON.stringify({
      input: [text],
      model: "voyage-3-lite",
      input_type: "query",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

/**
 * Calculate cosine similarity between two vectors
 */
function calculateCosineSimilarity(vec1: number[], vec2: string): number {
  let vec2Array: number[] = [];
  if (typeof vec2 === "string") {
    const cleaned = vec2.replace(/[\[\]]/g, "");
    vec2Array = cleaned.split(",").map((v) => parseFloat(v.trim()));
  } else {
    vec2Array = vec2 as unknown as number[];
  }

  if (vec1.length !== vec2Array.length) {
    return 0;
  }

  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2Array[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2Array[i] * vec2Array[i];
  }

  mag1 = Math.sqrt(mag1);
  mag2 = Math.sqrt(mag2);

  if (mag1 === 0 || mag2 === 0) {
    return 0;
  }

  return dotProduct / (mag1 * mag2);
}
