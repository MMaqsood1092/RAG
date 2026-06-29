import { config } from "../config";
import { huggingfaceService } from "../services/huggingface";

const VOYAGE_BASE_URL = "https://api.voyageai.com/v1";

type EmbedProvider = "voyage" | "huggingface";

// Rate limiting for Voyage free tier: 3 RPM = 1 request per 20 seconds
const VOYAGE_MIN_REQUEST_INTERVAL_MS = 20000; // 20 seconds
let lastVoyageRequestTime = 0;

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait to respect rate limits
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastVoyageRequestTime;
  
  if (timeSinceLastRequest < VOYAGE_MIN_REQUEST_INTERVAL_MS) {
    const waitTime = VOYAGE_MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
    console.log(`⏳ Rate limit: waiting ${Math.ceil(waitTime / 1000)}s before next request...`);
    await sleep(waitTime);
  }
  
  lastVoyageRequestTime = Date.now();
}

export async function embedBatch(
  texts: string[],
  provider: EmbedProvider = "voyage",
  modelId?: string
): Promise<number[][]> {
  console.log('embedding provider: ', provider);
  if (provider === "huggingface") {
    return huggingfaceService.embed(texts, modelId || "sentence-transformers/all-mpnet-base-v2");
  }

  // Default to Voyage
  return embedBatchVoyage(texts);
}

async function embedBatchVoyage(texts: string[], retries = 0): Promise<number[][]> {
  // Wait to respect rate limits
  await waitForRateLimit();

  const response = await fetch(`${VOYAGE_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.voyageKey}`,
    },
    body: JSON.stringify({
      input: texts,
      model: "voyage-3-lite",
      input_type: "document",
    }),
  });

  if (response.status === 429) {
    // Rate limited - wait and retry
    const retryAfter = response.headers.get('Retry-After');
    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : VOYAGE_MIN_REQUEST_INTERVAL_MS * 2;
    
    if (retries < 3) {
      console.warn(`⚠️  Rate limited (429). Retrying after ${Math.ceil(waitTime / 1000)}s (attempt ${retries + 1}/3)...`);
      await sleep(waitTime);
      return embedBatchVoyage(texts, retries + 1);
    } else {
      throw new Error(`Voyage API rate limit exceeded after ${retries} retries. Free tier limit: 3 RPM`);
    }
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as { data: Array<{ embedding: number[] }> };
  return data.data.map((d) => d.embedding);
}
