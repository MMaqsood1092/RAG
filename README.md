# Chatbot Backend

A production-grade RAG (Retrieval-Augmented Generation) chatbot built with Node.js, TypeScript, PostgreSQL + pgvector, and OpenAI.

## Features

- ✅ Handles millions of document chunks
- ✅ PostgreSQL + pgvector for scalable vector search
- ✅ Streaming + batch ingestion
- ✅ Parallel embeddings with batching
- ✅ Incremental ingestion support
- ✅ RAG-ready API

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start PostgreSQL with pgvector using Docker:
```bash
docker-compose up -d
```
   If you get "password authentication failed", the volume may have been created with different credentials. Reset it:
   ```bash
   docker-compose down -v
   docker-compose up -d
   ```
   Then run `npm run db:init` again.

3. Initialize the database schema:
```bash
npm run db:init
```

4. Create a `.env` file with the following variables:
```env
PORT=3000
OPENAI_API_KEY=your_openai_api_key
DATABASE_URL=postgresql://raguser:ragpass@localhost:5432/rag
```

5. Start the server:
```bash
# Development mode (with nodemon and ts-node)
npm run dev

# Build TypeScript to JavaScript
npm run build

# Production mode (runs compiled JavaScript)
npm start

# Type check without building
npm run type-check
```

## Upload and Ingestion

Documents are now ingested via the `POST /upload` API endpoint from your frontend application. See the API Endpoints section below for details.

### Supported File Types

- Text: `.txt`, `.md`, `.log`, `.json`, `.csv`, `.eml`, `.mot`
- Documents: `.pdf`, `.pptx`, `.xlsx`, `.xls`
- Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` (with OCR text extraction)

### Upload Limits

- **Max file size:** 50 MB per file
- **Max files per request:** 20 files

## Project Structure

```
├── src/
│   ├── api/
│   │   └── chat.ts          # RAG chat endpoint
│   ├── db/
│   │   ├── client.ts        # PostgreSQL connection pool
│   │   ├── init.ts          # Database initialization
│   │   └── schema.sql       # Database schema
│   ├── ingest/
│   │   ├── extractor.ts    # Text extraction
│   │   ├── chunker.ts      # Text chunking
│   │   ├── embedder.ts     # Embedding generation
│   │   └── pipeline.ts     # Ingestion pipeline
│   ├── config.ts           # Configuration
│   ├── server.ts           # Express server
│   └── ingest.ts           # Ingestion script
├── docker-compose.yml      # PostgreSQL setup
├── dist/                   # Compiled JavaScript (generated)
├── tsconfig.json           # TypeScript configuration
└── package.json
```

## API Endpoints

### POST /chat
Chat with the RAG system (history is kept per conversation)
- **Request:** `{ "question": "Your question", "conversationId": "optional-uuid" }`
- **Response:** `{ "answer": "...", "conversationId": "uuid" }`
- For follow-up questions (e.g. "more failures", "expand on that"), send the same `conversationId` from the previous response so the bot has context.

### POST /upload
Upload and ingest documents into the vector database

**Request:** multipart/form-data with files in the "files" field

**Response:** 
```json
{
  "success": true,
  "message": "Successfully ingested 2 file(s)",
  "files": [
    {
      "originalName": "document.pdf",
      "storedPath": "/path/to/uploads/uuid.pdf",
      "documentId": "uuid.pdf",
      "status": "success",
      "message": "File uploaded and ingested successfully"
    },
    {
      "originalName": "invalid.xyz",
      "storedPath": "",
      "documentId": "",
      "status": "error",
      "message": "Unsupported file type: .xyz. Supported types: ..."
    }
  ]
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/upload \
  -F "files=@document.pdf" \
  -F "files=@spreadsheet.xlsx" \
  -F "files=@image.png"
```

**JavaScript/Fetch Example:**
```javascript
const formData = new FormData();
formData.append("files", document.querySelector('input[type="file"]').files[0]);
formData.append("files", document.querySelector('input[type="file"]').files[1]);

const response = await fetch("http://localhost:3000/upload", {
  method: "POST",
  body: formData
});

const result = await response.json();
console.log(result.message); // "Successfully ingested 2 file(s)"
result.files.forEach(file => {
  if (file.status === "success") {
    console.log(`✓ ${file.originalName}`);
  } else {
    console.log(`✗ ${file.originalName}: ${file.message}`);
  }
});
```

**Response Details:**
- `success`: true if at least one file was successfully ingested
- `message`: Summary of ingestion results
- `files`: Array of file results with status and message for each
  - `status`: "success" or "error"
  - `originalName`: Name of the file as uploaded
  - `storedPath`: Path where file is stored on server (only on success)
  - `documentId`: UUID identifier for the document (only on success)

## Events and linked projects

Events and projects are stored in linked tables so the chatbot can share both when you ask about events.

- **Tables:** `projects` (id, name, description), `events` (id, project_id, name, details). Each event has a `project_id` linking to a project.
- **Chat behavior:** When you ask for events (or related questions), the API injects “events with their linked projects” into the context so answers can include which project each event belongs to.
- **Seeding:** Running `npm run db:init` applies `src/db/seed_linked_data.sql` (example project and events). Replace or extend that SQL with your real data, or add rows via your own script/API.

## Environment Variables

- `PORT` - Server port (default: 3000)
- `OPENAI_API_KEY` - OpenAI API key (required)
- `DATABASE_URL` - PostgreSQL connection string (required)


## Legacy CLI Ingestion (Deprecated)

**Note:** The CLI-based ingestion commands are deprecated in favor of the `POST /upload` API. They remain available for local development and testing.

```bash
# Ingest a single file
npm run ingest <path_to_file>

# Ingest from src/Attachments directory
npm run ingest:attachments

# Check ingested documents
npm run ingest:check
npm run ingest:check <filename>
```

## Migration from CLI to API Ingestion

If you have an existing frontend or application that was using the file system for uploads:

1. Replace file system writes with `POST /upload` calls
2. Files are now automatically stored in the `uploads/` directory (git-ignored)
3. The `/upload` endpoint extracts and indexes files in a single operation
4. No need to manually run `npm run ingest` commands

Example migration:

**Before (File System):**
```javascript
// Write file to disk, then run npm run ingest manually
fs.writeFileSync('path/to/file.pdf', buffer);
// Then manually: npm run ingest path/to/file.pdf
```

**After (Upload API):**
```javascript
// Upload directly to the backend
const formData = new FormData();
formData.append("files", file);
const response = await fetch("/upload", { method: "POST", body: formData });
// File is automatically ingested and searchable
```
