// import { Request, Response } from 'express';
// import { huggingfaceService } from "../services/huggingface";
// import { embedBatch } from "../ingest/embedder";

/**
 * DISABLED: HuggingFace model invocation
 * TODO: Implement when multi-model support is needed
 * POST /models/invoke
 * Body: {
 *   "modelId": "sentence-transformers/all-mpnet-base-v2",
 *   "input": { ... }
 * }
 */
// export async function invokeModel(req: Request, res: Response): Promise<void> {
//   try {
//     const { modelId, input } = req.body;

//     if (!modelId || !input) {
//       res.status(400).json({
//         error: "Missing modelId or input",
//       });
//       return;
//     }

//     const result = await huggingfaceService.invoke(modelId, input);

//     res.json({ success: true, result });
//     return;
//   } catch (err) {
//     const message = err instanceof Error ? err.message : "Unknown error";
//     res.status(500).json({ error: message });
//     return;
//   }
// }

/**
 * DISABLED: Multi-provider embedding endpoint
 * TODO: Implement when HuggingFace support is needed
 * Currently using Voyage AI in chat.ts for embeddings
 * POST /models/embed
 * Body: {
 *   "texts": ["hello", "world"],
 *   "provider": "huggingface", // or "voyage"
 *   "modelId": "sentence-transformers/all-mpnet-base-v2"
 * }
 */
// export async function embedTexts(req: Request, res: Response): Promise<void> {
//   try {
//     const {
//       texts,
//       provider = "voyage",
//       modelId,
//     } = req.body as {
//       texts: string[];
//       provider: "voyage" | "huggingface";
//       modelId?: string;
//     };

//     if (!Array.isArray(texts) || texts.length === 0) {
//       res.status(400).json({
//         error: "texts must be a non-empty array",
//       });
//       return;
//     }

//     const embeddings = await embedBatch(texts, provider, modelId);

//     res.json({
//       success: true,
//       provider,
//       modelId: modelId || (provider === "voyage" ? "voyage-3-lite" : "sentence-transformers/all-mpnet-base-v2"),
//       count: embeddings.length,
//       dimension: embeddings[0].length,
//       embeddings,
//     });
//     return;
//   } catch (err) {
//     const message = err instanceof Error ? err.message : "Unknown error";
//     res.status(500).json({ error: message });
//     return;
//   }
// }

/**
 * DISABLED: Question answering endpoint
 * TODO: Implement when QA model support is needed
 * POST /models/qa
 * Body: {
 *   "question": "What is AI?",
 *   "context": "AI is artificial intelligence...",
 *   "modelId": "deepset/roberta-base-squad2"
 * }
 */
// export async function answerQuestion(req: Request, res: Response): Promise<void> {
//   try {
//     const { question, context, modelId = "deepset/roberta-base-squad2" } = req.body;

//     if (!question || !context) {
//       res.status(400).json({
//         error: "question and context are required",
//       });
//       return;
//     }

//     const result = await huggingfaceService.questionAnswer(question, context, modelId);

//     res.json({
//       success: true,
//       question,
//       answer: result.answer,
//       confidence: result.score,
//       modelId,
//     });
//     return;
//   } catch (err) {
//     const message = err instanceof Error ? err.message : "Unknown error";
//     res.status(500).json({ error: message });
//     return;
//   }
// }

/**
 * DISABLED: Text classification endpoint
 * TODO: Implement when classification support is needed
 * POST /models/classify
 * Body: {
 *   "text": "This is great!",
 *   "modelId": "distilbert-base-uncased-finetuned-sst-2-english"
 * }
 */
// export async function classifyText(req: Request, res: Response): Promise<void> {
//   try {
//     const { text, modelId = "distilbert-base-uncased-finetuned-sst-2-english" } = req.body;

//     if (!text) {
//       res.status(400).json({
//         error: "text is required",
//       });
//       return;
//     }

//     const result = await huggingfaceService.classify(text, modelId);

//     res.json({
//       success: true,
//       text,
//       classifications: result,
//       modelId,
//     });
//     return;
//   } catch (err) {
//     const message = err instanceof Error ? err.message : "Unknown error";
//     res.status(500).json({ error: message });
//     return;
//   }
// }

/**
 * DISABLED: Summarization endpoint
 * TODO: Implement when summarization support is needed
 * POST /models/summarize
 * Body: {
 *   "text": "Long text to summarize...",
 *   "modelId": "facebook/bart-large-cnn"
 * }
 */
// export async function summarizeText(req: Request, res: Response): Promise<void> {
//   try {
//     const { text, modelId = "facebook/bart-large-cnn", maxLength = 150, minLength = 50 } = req.body;

//     if (!text) {
//       res.status(400).json({
//         error: "text is required",
//       });
//       return;
//     }

//     const result = await huggingfaceService.summarize(text, modelId, {
//       maxLength,
//       minLength,
//     });

//     res.json({
//       success: true,
//       originalLength: text.length,
//       summary: result,
//       summaryLength: result.length,
//       modelId,
//     });
//     return;
//   } catch (err) {
//     const message = err instanceof Error ? err.message : "Unknown error";
//     res.status(500).json({ error: message });
//     return;
//   }
// }

/**
 * DISABLED: NER (Named Entity Recognition) endpoint
 * TODO: Implement when NER support is needed
 * POST /models/ner
 * Body: {
 *   "text": "John works at OpenAI in San Francisco.",
 *   "modelId": "dslim/bert-base-NER"
 * }
 */
// export async function extractNER(req: Request, res: Response): Promise<void> {
//   try {
//     const { text, modelId = "dslim/bert-base-NER" } = req.body;

//     if (!text) {
//       res.status(400).json({
//         error: "text is required",
//       });
//       return;
//     }

//     const result = await huggingfaceService.tokenClassify(text, modelId);

//     res.json({
//       success: true,
//       text,
//       entities: result,
//       modelId,
//     });
//     return;
//   } catch (err) {
//     const message = err instanceof Error ? err.message : "Unknown error";
//     res.status(500).json({ error: message });
//     return;
//   }
// }

/**
 * DISABLED: Text generation endpoint
 * TODO: Implement when text generation support is needed
 * POST /models/generate
 * Body: {
 *   "prompt": "The future of AI is",
 *   "modelId": "mistralai/Mistral-7B-Instruct-v0.1"
 * }
 */
// export async function generateText(req: Request, res: Response): Promise<void> {
//   try {
//     const { prompt, modelId = "mistralai/Mistral-7B-Instruct-v0.1", maxTokens = 256, temperature = 0.7 } = req.body;

//     if (!prompt) {
//       res.status(400).json({
//         error: "prompt is required",
//       });
//       return;
//     }

//     const result = await huggingfaceService.generateText(prompt, modelId, {
//       maxTokens,
//       temperature,
//     });

//     res.json({
//       success: true,
//       prompt,
//       generated: result,
//       modelId,
//     });
//     return;
//   } catch (err) {
//     const message = err instanceof Error ? err.message : "Unknown error";
//     res.status(500).json({ error: message });
//     return;
//   }
// }
