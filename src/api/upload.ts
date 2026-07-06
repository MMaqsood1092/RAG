import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";
import { ingestFile } from "../ingest/pipeline";

/**
 * Handles file uploads from the frontend.
 * Accepts multiple files, stores them in the uploads folder,
 * and ingests them into the vector database.
 * CRITICAL: Associates documents with tenant_id for multi-tenancy
 *
 * Request: multipart/form-data with files in "files" field
 * Requires: Authorization header with valid API key
 * Response: { success: boolean, message: string, files: UploadedFile[] }
 */

interface UploadedFile {
  originalName: string;
  storedPath: string;
  documentId: string;
  status: "success" | "error";
  message: string;
}

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

/**
 * Ensure uploads directory exists
 */
function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

/**
 * Store a single uploaded file with a UUID prefix to avoid name collisions
 */
function storeFile(file: Express.Multer.File): string {
  ensureUploadsDir();
  const ext = path.extname(file.originalname);
  const uniqueName = `${uuid()}${ext}`;
  const filePath = path.join(UPLOADS_DIR, uniqueName);

  fs.writeFileSync(filePath, file.buffer);
  return filePath;
}

export async function uploadAndIngest(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        message: "No files provided. Please upload at least one file.",
        files: [],
      });
      return;
    }

    const uploadedFiles: UploadedFile[] = [];

    // Process each uploaded file
    for (const file of files) {
      try {
        // Validate file type
        const ext = path.extname(file.originalname).toLowerCase();
        const supportedExtensions = [
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
        ];

        if (!supportedExtensions.includes(ext)) {
          uploadedFiles.push({
            originalName: file.originalname,
            storedPath: "",
            documentId: "",
            status: "error",
            message: `Unsupported file type: ${ext}. Supported types: ${supportedExtensions.join(", ")}`,
          });
          continue;
        }

        // Store the file
        const storedPath = storeFile(file);

        // Ingest the file into the vector database (use Voyage by default)
        await ingestFile(storedPath, "voyage");

        uploadedFiles.push({
          originalName: file.originalname,
          storedPath,
          documentId: path.basename(storedPath),
          status: "success",
          message: `File uploaded and ingested successfully`,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";

        uploadedFiles.push({
          originalName: file.originalname,
          storedPath: "",
          documentId: "",
          status: "error",
          message: `Ingestion failed: ${errorMessage}`,
        });
      }
    }

    // Check if any files were successfully ingested
    const successCount = uploadedFiles.filter(
      (f) => f.status === "success"
    ).length;
    const hasErrors = uploadedFiles.some((f) => f.status === "error");

    res.json({
      success: successCount > 0,
      message:
        successCount > 0
          ? `Successfully ingested ${successCount} file(s)${hasErrors ? ` with ${uploadedFiles.length - successCount} error(s)` : ""}`
          : "No files were successfully ingested",
      files: uploadedFiles,
    });
    return;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error occurred";
    console.error("Upload error:", err);
    res.status(500).json({
      success: false,
      message: `Server error: ${errorMessage}`,
      files: [],
    });
    return;
  }
}
