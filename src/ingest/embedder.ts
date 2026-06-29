import { config } from "../config";
import { huggingfaceService } from "../services/huggingface";

const VOYAGE_BASE_URL = "https://api.voyageai.com/v1";

type EmbedProvider = "voyage" | "huggingface";

export async function embedBatch(
  texts: string[],
  provider: EmbedProvider = "voyage",
  modelId?: string
): Promise<number[][]> {
  console.log('emberdding provider: ', provider);
  if (provider === "huggingface") {
    return huggingfaceService.embed(texts, modelId || "sentence-transformers/all-mpnet-base-v2");
  }

  // Default to Voyage
  return embedBatchVoyage(texts);
}

async function embedBatchVoyage(texts: string[]): Promise<number[][]> {
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
  console.log('embedding voyage api response: ', response);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as { data: Array<{ embedding: number[] }> };
  return data.data.map((d) => d.embedding);
}
