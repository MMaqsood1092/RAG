import { huggingfaceService } from "../services/huggingface";

/**
 * Embed texts using HuggingFace models
 * Options:
 * - sentence-transformers/all-mpnet-base-v2 (good quality, 768-dim)
 * - sentence-transformers/all-MiniLM-L12-v2 (fast, 384-dim)
 * - sentence-transformers/all-MiniLM-L6-v2 (very fast, 384-dim)
 */
export async function embedBatchHF(
  texts: string[],
  modelId: string = "sentence-transformers/all-mpnet-base-v2"
): Promise<number[][]> {
  return huggingfaceService.embed(texts, modelId);
}
