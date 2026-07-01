import { pool } from "../db/client";
import { config } from "../config";

const VOYAGE_BASE_URL = "https://api.voyageai.com/v1";

// Rate limiting for Voyage free tier: 3 RPM = 1 request per 20 seconds
const VOYAGE_MIN_REQUEST_INTERVAL_MS = 20000; // 20 seconds
let lastVoyageRequestTime = 0;

interface ChunkResult {
  content: string;
  score: number;
}

interface ChatResult {
  results: ChunkResult[];
}

/**
 * Query the vector database using Voyage embeddings
 * Returns matching chunks with relevance scores (no LLM generation, no history)
 */
export async function chat(question: string): Promise<ChatResult> {
  try {
    // Generate embedding for the query
    const embedding = await embedQuery(question);

    // Vector search - get top 10 most relevant chunks
    const embeddingVector = `[${embedding.join(",")}]`;
    const { rows } = await pool.query<{
      content: string;
      embedding: string;
    }>(
      `SELECT content, embedding FROM chunks ORDER BY embedding <=> $1::vector LIMIT 10`,
      [embeddingVector]
    );

    // Calculate similarity scores for results
    const results: ChunkResult[] = rows.map((row) => {
      const score = calculateCosineSimilarity(embedding, row.embedding);
      return {
        content: row.content,
        score: Math.round(score * 1000) / 1000,
      };
    });

    return { results };
  } catch (err) {
    console.error("Chat query failed:", err);
    return { results: [] };
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
