import { config } from "../config";

const VOYAGE_BASE_URL = "https://api.voyageai.com/v1";

interface RerankResult {
  index: number;
  relevance_score: number;
}

/**
 * Rerank documents using Voyage AI's reranking model
 * Improves relevance of search results
 */
export async function rerankDocuments(
  query: string,
  documents: string[],
  topK: number = 5
): Promise<{ document: string; score: number }[]> {
  if (documents.length === 0) {
    return [];
  }

  try {
    const response = await fetch(`${VOYAGE_BASE_URL}/rerank`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.voyageKey}`,
      },
      body: JSON.stringify({
        model: "rerank-1",
        query: query,
        documents: documents,
        top_k: topK,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Voyage Rerank API error: ${response.status} - ${error}`);
      throw new Error(`Voyage Rerank API error: ${response.status}`);
    }

    const data = await response.json() as any;
    
    // Validate response structure
    if (!data || !Array.isArray(data?.results)) {
      console.error("Invalid rerank response structure:", data);
      // Fallback to simple reranking
      return simpleRerank(query, documents, topK);
    }

    // Sort by relevance score descending
    return (data.results as RerankResult[])
      .map((result: RerankResult) => ({
        document: documents[result.index],
        score: result.relevance_score,
      }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, topK);
  } catch (err) {
    console.error("Reranking failed, using simple fallback:", err);
    // Fallback: use simple keyword-based reranking
    return simpleRerank(query, documents, topK);
  }
}

/**
 * Simple relevance scoring as fallback when Voyage API is unavailable
 */
export function simpleRerank(
  query: string,
  documents: string[],
  topK: number = 5
): { document: string; score: number }[] {
  const queryWords = query.toLowerCase().split(/\s+/);

  const scored = documents.map((doc) => {
    const docLower = doc.toLowerCase();
    let score = 0;

    // Exact phrase match
    if (docLower.includes(query.toLowerCase())) {
      score += 2.0;
    }

    // Word matches
    for (const word of queryWords) {
      if (word.length > 2) {
        const matches = (docLower.match(new RegExp(word, "g")) || []).length;
        score += matches * 0.5;
      }
    }

    // Normalize score (0-1)
    score = Math.min(score / (queryWords.length * 0.5 + 2), 1.0);

    return { document: doc, score };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
