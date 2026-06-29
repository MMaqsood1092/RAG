import { huggingfaceService } from "./huggingface";

/**
 * Chat response generation using HuggingFace models
 * Model options:
 * - mistralai/Mistral-7B-Instruct-v0.1 (good balance)
 * - microsoft/DialoGPT-large (conversational)
 * - meta-llama/Llama-2-7b-chat-hf (multi-turn)
 * - tiiuae/falcon-7b-instruct (fast)
 */
export async function generateChatResponseHF(
  systemPrompt: string,
  userMessage: string,
  context: string = "",
  modelId: string = "mistralai/Mistral-7B-Instruct-v0.1",
  options?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
  }
): Promise<string> {
  const fullPrompt = `${systemPrompt}

${context ? `Context:\n${context}\n` : ""}
User: ${userMessage}
Assistant:`;

  return huggingfaceService.generateText(fullPrompt, modelId, {
    maxTokens: options?.maxTokens || 512,
    temperature: options?.temperature || 0.7,
    topP: options?.topP || 0.9,
  });
}

/**
 * Question answering using HuggingFace QA models
 */
export async function answerQuestionHF(
  question: string,
  context: string,
  modelId: string = "deepset/roberta-base-squad2"
): Promise<{ answer: string; confidence: number }> {
  const result = await huggingfaceService.questionAnswer(question, context, modelId);
  return {
    answer: result.answer,
    confidence: result.score,
  };
}

/**
 * Classify text sentiment, intent, etc.
 */
export async function classifyTextHF(
  text: string,
  modelId: string = "distilbert-base-uncased-finetuned-sst-2-english"
): Promise<Array<{ label: string; score: number }>> {
  return huggingfaceService.classify(text, modelId);
}

/**
 * Summarize long text
 */
export async function summarizeTextHF(
  text: string,
  modelId: string = "facebook/bart-large-cnn",
  options?: { maxLength?: number; minLength?: number }
): Promise<string> {
  return huggingfaceService.summarize(text, modelId, options);
}

/**
 * Named Entity Recognition using HuggingFace
 */
export async function extractEntitiesHF(
  text: string,
  modelId: string = "dslim/bert-base-NER"
): Promise<
  Array<{
    entity: string;
    score: number;
    word: string;
    start: number;
    end: number;
  }>
> {
  const results = await huggingfaceService.tokenClassify(text, modelId);
  return results.map((r) => ({
    entity: r.entity,
    score: r.score,
    word: r.word,
    start: r.start,
    end: r.end,
  }));
}
