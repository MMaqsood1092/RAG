import { config } from "../config";

const HF_API_URL = "https://api-inference.huggingface.co";

interface HFEmbeddingResponse {
  error?: string;
  [key: number]: number[];
}

interface HFTextGenerationResponse {
  generated_text: string;
  error?: string;
}

interface HFInferenceResponse {
  error?: string;
  [key: string]: any;
}

export class HuggingFaceService {
  private apiKey: string;

  constructor() {
    this.apiKey = config.huggingfaceKey;
  }

  /**
   * Call any HuggingFace model endpoint
   */
  async invoke<T>(
    modelId: string,
    input: Record<string, any>,
    options?: { timeout?: number }
  ): Promise<T> {
    const url = `${HF_API_URL}/models/${modelId}`;
    const timeout = options?.timeout || 30000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HuggingFace API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      
      if ((data as HFInferenceResponse).error) {
        throw new Error(`HuggingFace error: ${(data as HFInferenceResponse).error}`);
      }

      return data as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Generate text embeddings using HuggingFace model
   * Model options: sentence-transformers/all-MiniLM-L6-v2, all-mpnet-base-v2, etc.
   */
  async embed(texts: string[], modelId: string = "sentence-transformers/all-mpnet-base-v2"): Promise<number[][]> {
    const response = await this.invoke<HFEmbeddingResponse>(modelId, {
      inputs: texts,
    });

    if ((response as HFEmbeddingResponse).error) {
      throw new Error(`Embedding failed: ${(response as HFEmbeddingResponse).error}`);
    }

    // Response is array of embeddings matching input texts
    return Object.values(response).filter((v) => Array.isArray(v)) as number[][];
  }

  /**
   * Text generation using HuggingFace model
   * Model options: meta-llama/Llama-2-7b, mistralai/Mistral-7B-Instruct-v0.1, etc.
   */
  async generateText(
    prompt: string,
    modelId: string = "mistralai/Mistral-7B-Instruct-v0.1",
    options?: {
      maxTokens?: number;
      temperature?: number;
      topP?: number;
    }
  ): Promise<string> {
    const response = await this.invoke<HFTextGenerationResponse>(modelId, {
      inputs: prompt,
      parameters: {
        max_new_tokens: options?.maxTokens || 256,
        temperature: options?.temperature || 0.7,
        top_p: options?.topP || 0.9,
      },
    });

    if ((response as HFTextGenerationResponse).error) {
      throw new Error(`Text generation failed: ${(response as HFTextGenerationResponse).error}`);
    }

    return (response as HFTextGenerationResponse).generated_text;
  }

  /**
   * Question answering using HuggingFace model
   */
  async questionAnswer(
    question: string,
    context: string,
    modelId: string = "deepset/roberta-base-squad2"
  ): Promise<{ answer: string; score: number }> {
    const response = await this.invoke<{
      answer?: string;
      score?: number;
      error?: string;
    }>(modelId, {
      inputs: {
        question,
        context,
      },
    });

    if (response.error) {
      throw new Error(`QA failed: ${response.error}`);
    }

    return {
      answer: response.answer || "",
      score: response.score || 0,
    };
  }

  /**
   * Classification using HuggingFace model
   */
  async classify(
    text: string,
    modelId: string = "distilbert-base-uncased-finetuned-sst-2-english"
  ): Promise<Array<{ label: string; score: number }>> {
    const response = await this.invoke<
      Array<{ label: string; score: number }> | { error?: string }
    >(modelId, {
      inputs: text,
    });

    if (Array.isArray(response)) {
      return response;
    }

    if ("error" in response && response.error) {
      throw new Error(`Classification failed: ${response.error}`);
    }

    return [];
  }

  /**
   * Summarization using HuggingFace model
   */
  async summarize(
    text: string,
    modelId: string = "facebook/bart-large-cnn",
    options?: {
      maxLength?: number;
      minLength?: number;
    }
  ): Promise<string> {
    const response = await this.invoke<Array<{ summary_text: string }> | { error?: string }>(
      modelId,
      {
        inputs: text,
        parameters: {
          max_length: options?.maxLength || 150,
          min_length: options?.minLength || 50,
        },
      }
    );

    if ("error" in response && response.error) {
      throw new Error(`Summarization failed: ${response.error}`);
    }

    if (Array.isArray(response)) {
      return response[0]?.summary_text || "";
    }

    return "";
  }

  /**
   * Token classification (NER, POS tagging, etc.)
   */
  async tokenClassify(
    text: string,
    modelId: string = "dslim/bert-base-NER"
  ): Promise<
    Array<{
      entity: string;
      score: number;
      index: number;
      word: string;
      start: number;
      end: number;
    }>
  > {
    const response = await this.invoke<
      Array<{
        entity: string;
        score: number;
        index: number;
        word: string;
        start: number;
        end: number;
      }> | { error?: string }
    >(modelId, {
      inputs: text,
    });

    if ("error" in response && response.error) {
      throw new Error(`Token classification failed: ${response.error}`);
    }

    return Array.isArray(response) ? response : [];
  }

  /**
   * Translation using HuggingFace model
   */
  async translate(
    text: string,
    modelId: string = "Helsinki-NLP/opus-mt-en-es"
  ): Promise<string> {
    const response = await this.invoke<Array<{ translation_text: string }> | { error?: string }>(
      modelId,
      {
        inputs: text,
      }
    );

    if ("error" in response && response.error) {
      throw new Error(`Translation failed: ${response.error}`);
    }

    if (Array.isArray(response)) {
      return response[0]?.translation_text || "";
    }

    return "";
  }

  /**
   * Conversational AI using HuggingFace model
   */
  async chat(
    message: string,
    history: Array<{ role: string; content: string }> = [],
    modelId: string = "microsoft/DialoGPT-medium"
  ): Promise<string> {
    const conversationHistory = history
      .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`)
      .join("\n");

    const prompt = `${conversationHistory}\nUser: ${message}\nAssistant:`;

    const response = await this.invoke<HFTextGenerationResponse>(modelId, {
      inputs: prompt,
      parameters: {
        max_new_tokens: 256,
      },
    });

    if ((response as HFTextGenerationResponse).error) {
      throw new Error(`Chat failed: ${(response as HFTextGenerationResponse).error}`);
    }

    return (response as HFTextGenerationResponse).generated_text;
  }
}

// Export singleton instance
export const huggingfaceService = new HuggingFaceService();
