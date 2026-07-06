import express, { Request, Response } from "express";
import multer from "multer";
import { chat } from "./api/chat";
import { uploadAndIngest } from "./api/upload";
// import {
//   invokeModel,
//   embedTexts,
//   answerQuestion,
//   classifyText,
//   summarizeText,
//   extractNER,
//   generateText,
// } from "./api/models";
import { config } from "./config";
import { pool } from "./db/client";

const app = express();
app.use(express.json());

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max file size
  },
});

/**
 * Health check endpoint - diagnose database connectivity
 */
app.get("/health", async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('req', req);
    const result = await pool.query("SELECT NOW() as timestamp");
    res.json({
      status: "healthy",
      timestamp: result.rows[0].timestamp,
      database: "connected",
    });
  } catch (err: any) {
    console.error("Health check failed:", err);
    res.status(503).json({
      status: "unhealthy",
      error: err.message,
      code: err.code,
      database: "disconnected",
    });
  }
});

app.post("/chat", async (req: Request, res: Response): Promise<void> => {
  try {
    const { question } = req.body;

    if (!question) {
      res.status(400).json({ error: "Question is required" });
      return;
    }

    const result = await chat(question);

    res.json(result);
    return;
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

/**
 * POST /upload
 * Accepts multiple files via multipart/form-data with field name "files"
 * Stores them in the uploads/ directory and ingests into vector database
 */
app.post("/upload", upload.array("files", 20), uploadAndIngest);

/**
 * DISABLED: HuggingFace Model Integration Endpoints
 * TODO: Enable when multi-model support is implemented
 */

// // Generic model invocation
// app.post("/models/invoke", invokeModel);

// // Embedding endpoint (supports both Voyage and HuggingFace)
// app.post("/models/embed", embedTexts);

// // Question Answering
// app.post("/models/qa", answerQuestion);

// // Text Classification
// app.post("/models/classify", classifyText);

// // Summarization
// app.post("/models/summarize", summarizeText);

// // Named Entity Recognition
// app.post("/models/ner", extractNER);

// // Text Generation
// app.post("/models/generate", generateText);

app.listen(config.port, () => {
  console.log(`🚀 Server on port ${config.port}`);
});
