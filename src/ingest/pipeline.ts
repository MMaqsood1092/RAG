import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { extractText } from "./extractor";
import { chunkText } from "./chunker";
import { embedBatch } from "./embedder";
import { pool } from "../db/client";

export const ATTACHMENTS_DIR = path.join(__dirname, "..", "Attachments");

const INGEST_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".log",
  ".csv",
  ".json",
  ".pdf",
  ".eml",
  ".mot",
  ".pptx",
  ".xlsx",
  ".xls",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);

async function ensureDocumentsTableUpdated() {
  try {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'documents' AND column_name = 'embedding_model'`
    );
    
    if (result.rows.length === 0) {
      await pool.query(`DROP INDEX IF EXISTS idx_chunks_embedding;`);
      await pool.query(`
        ALTER TABLE chunks
        ALTER COLUMN embedding TYPE vector USING embedding::vector;
      `).catch(() => {
      });
      
      await pool.query(`
        ALTER TABLE documents 
        ADD COLUMN embedding_model TEXT DEFAULT 'voyage-default',
        ADD COLUMN embedding_dimension INT DEFAULT 1024;
      `);
      
      await pool.query(`
        CREATE INDEX idx_chunks_embedding
        ON chunks
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 200);
      `);
      
      console.log("✅ Updated documents table schema");
    }
  } catch (err) {
    console.warn("Could not update table schema:", err);
  }
}

export async function ingestFile(
  filePath: string,
  embeddingProvider: "voyage" | "huggingface" = "voyage",
  embeddingModel?: string
) {
  try {
    const text = await extractText(filePath);
    console.log(`Extracted text length: ${text.length}`);
    
    const ext = path.extname(filePath).toLowerCase();
    let fileType = 'text';
    if (ext === '.csv') fileType = 'csv';
    else if (ext === '.xlsx' || ext === '.xls') fileType = 'excel';
    
    const chunks = await chunkText(text, fileType);
    console.log(`Created ${chunks.length} sections`);
    
    if (chunks.length === 0) {
      console.warn(`No chunks created for ${filePath}`);
      return;
    }

    const docId = uuid();

    let embeddingDimension = 0;
    const firstBatch = chunks.slice(0, 50);
    
    console.log(`Embedding first batch of ${firstBatch.length} sections (with rate limiting)...`);
    const firstEmbeddings = await embedBatch(
      firstBatch.map((c) => c.pageContent),
      embeddingProvider,
      embeddingModel
    );
    console.log(`Got ${firstEmbeddings.length} embeddings`);
    
    embeddingDimension = firstEmbeddings[0]?.length || 0;
    console.log(`Embedding dimension: ${embeddingDimension}`);

    const modelName = embeddingModel || `${embeddingProvider}-default`;

    try {
      await pool.query(
        `INSERT INTO documents (id, path, embedding_model, embedding_dimension) 
         VALUES ($1, $2, $3, $4)`,
        [docId, filePath, modelName, embeddingDimension]
      );
      console.log(`✅ Inserted document ${docId}`);
    } catch (err: any) {
      if (err.code === "42703") {
        await pool.query(
          `INSERT INTO documents (id, path) VALUES ($1, $2)`,
          [docId, filePath]
        );
        console.log(`✅ Inserted document (fallback) ${docId}`);
      } else {
        throw err;
      }
    }

    console.log(`Inserting ${firstBatch.length} sections...`);
    for (let j = 0; j < firstBatch.length; j++) {
      await pool.query(
        `INSERT INTO chunks (id, document_id, content, embedding, metadata)
         VALUES ($1, $2, $3, $4::vector, $5)`,
        [
          uuid(),
          docId,
          firstBatch[j].pageContent,
          `[${firstEmbeddings[j].join(",")}]`,
          JSON.stringify(firstBatch[j].metadata || {}),
        ]
      );
    }
    console.log(`✅ Inserted first batch of ${firstBatch.length} sections`);

    for (let i = 50; i < chunks.length; i += 50) {
      const batch = chunks.slice(i, i + 50);
      console.log(`Embedding batch ${i}-${i + batch.length} (with rate limiting)...`);
      const embeddings = await embedBatch(
        batch.map((c) => c.pageContent),
        embeddingProvider,
        embeddingModel
      );

      console.log(`Inserting ${batch.length} sections...`);
      for (let j = 0; j < batch.length; j++) {
        await pool.query(
          `INSERT INTO chunks (id, document_id, content, embedding, metadata)
           VALUES ($1, $2, $3, $4::vector, $5)`,
          [
            uuid(),
            docId,
            batch[j].pageContent,
            `[${embeddings[j].join(",")}]`,
            JSON.stringify(batch[j].metadata || {}),
          ]
        );
      }
      console.log(`✅ Inserted batch of ${batch.length} sections`);
    }
    
    console.log(`✅ Successfully ingested ${filePath}`);
  } catch (err) {
    console.error(`❌ Failed to ingest ${filePath}:`, err);
    throw err;
  }
}

export async function ingestDirectory(
  rootDir: string,
  embeddingProvider: "voyage" | "huggingface" = "voyage",
  embeddingModel?: string
) {
  await ensureDocumentsTableUpdated();

  const stats = fs.statSync(rootDir);

  if (!stats.isDirectory()) {
    await ingestFile(rootDir, embeddingProvider, embeddingModel);
    return;
  }

  const files: string[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (INGEST_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(rootDir);

  for (const file of files) {
    console.log(`📄 Ingesting ${file}`);
    await ingestFile(file, embeddingProvider, embeddingModel);
  }
}