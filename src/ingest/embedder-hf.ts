import { huggingfaceService } from "../services/huggingface";

export async function embedBatchHF(
  texts: string[],
  modelId: string = "sentence-transformers/all-mpnet-base-v2"
): Promise<number[][]> {
  return huggingfaceService.embed(texts, modelId);
}
