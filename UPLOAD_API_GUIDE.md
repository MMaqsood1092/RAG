# Upload API Implementation Guide

## Overview

The chatbot now includes a `POST /upload` endpoint that allows frontend applications to upload and ingest multiple documents of various types directly from the frontend.

## Quick Start

### 1. Basic Upload (HTML Form)

```html
<!DOCTYPE html>
<html>
<head>
  <title>Chatbot Upload</title>
</head>
<body>
  <h1>Upload Documents</h1>
  <form id="uploadForm">
    <input type="file" id="fileInput" multiple accept=".pdf,.xlsx,.txt,.csv,.png,.jpg" />
    <button type="submit">Upload</button>
  </form>
  <div id="result"></div>

  <script>
    document.getElementById('uploadForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData();
      const files = document.getElementById('fileInput').files;
      
      for (let file of files) {
        formData.append('files', file);
      }

      try {
        const response = await fetch('http://localhost:3000/upload', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        document.getElementById('result').innerHTML = `
          <h2>${result.message}</h2>
          <ul>
            ${result.files.map(f => `
              <li style="color: ${f.status === 'success' ? 'green' : 'red'}">
                <strong>${f.originalName}</strong>: ${f.message}
              </li>
            `).join('')}
          </ul>
        `;
      } catch (error) {
        document.getElementById('result').innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
      }
    });
  </script>
</body>
</html>
```

### 2. React Component Example

```typescript
import React, { useState } from 'react';

interface UploadedFile {
  originalName: string;
  status: 'success' | 'error';
  message: string;
}

export const DocumentUpload: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadedFile[]>([]);

  const handleUpload = async (files: FileList) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    const formData = new FormData();

    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const response = await fetch('http://localhost:3000/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      setResults(result.files);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h2>Upload Documents</h2>
      <input
        type="file"
        multiple
        onChange={(e) => handleUpload(e.target.files!)}
        disabled={uploading}
        accept=".pdf,.xlsx,.xls,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.pptx,.eml,.mot,.json,.md,.log"
      />
      
      {uploading && <p>Uploading...</p>}
      
      {results.length > 0 && (
        <ul>
          {results.map((file, idx) => (
            <li key={idx} style={{ color: file.status === 'success' ? 'green' : 'red' }}>
              <strong>{file.originalName}</strong>: {file.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
```

### 3. Node.js/Backend Upload Example

```typescript
import FormData from 'form-data';
import fs from 'fs';
import axios from 'axios';

async function uploadDocuments(filePaths: string[]) {
  const formData = new FormData();

  for (const filePath of filePaths) {
    formData.append('files', fs.createReadStream(filePath));
  }

  try {
    const response = await axios.post('http://localhost:3000/upload', formData, {
      headers: formData.getHeaders()
    });

    console.log('Upload successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
}

// Usage
uploadDocuments([
  './documents/report.pdf',
  './data/spreadsheet.xlsx',
  './images/diagram.png'
]);
```

### 4. cURL Command Line

```bash
# Single file
curl -X POST http://localhost:3000/upload \
  -F "files=@document.pdf"

# Multiple files
curl -X POST http://localhost:3000/upload \
  -F "files=@document.pdf" \
  -F "files=@spreadsheet.xlsx" \
  -F "files=@image.png"

# Using form ID
curl -X POST http://localhost:3000/upload \
  -F "files=@reports/Q4_Report.pdf" \
  -F "files=@data/customers.csv" \
  -F "files=@charts/sales_trend.png"
```

## Supported File Types

| Category | Extensions | Processing |
|----------|-----------|------------|
| **Text Files** | `.txt`, `.md`, `.log`, `.json`, `.eml`, `.mot` | Direct text extraction |
| **Documents** | `.pdf` | Text extraction from PDF |
| **Spreadsheets** | `.xlsx`, `.xls` | Convert sheets to CSV format |
| **Presentations** | `.pptx` | Extract slide text |
| **Images** | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` | OCR text extraction |

## API Response

### Success Response

```json
{
  "success": true,
  "message": "Successfully ingested 3 file(s)",
  "files": [
    {
      "originalName": "report.pdf",
      "storedPath": "/uploads/550e8400-e29b-41d4-a716-446655440000.pdf",
      "documentId": "550e8400-e29b-41d4-a716-446655440000.pdf",
      "status": "success",
      "message": "File uploaded and ingested successfully"
    },
    {
      "originalName": "data.xlsx",
      "storedPath": "/uploads/6ba7b810-9dad-11d1-80b4-00c04fd430c8.xlsx",
      "documentId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8.xlsx",
      "status": "success",
      "message": "File uploaded and ingested successfully"
    },
    {
      "originalName": "unsupported.docx",
      "storedPath": "",
      "documentId": "",
      "status": "error",
      "message": "Unsupported file type: .docx. Supported types: .txt, .md, .log, .csv, .json, .pdf, .eml, .mot, .pptx, .xlsx, .xls, .png, .jpg, .jpeg, .gif, .webp"
    }
  ]
}
```

### Partial Failure Response

```json
{
  "success": true,
  "message": "Successfully ingested 2 file(s) with 1 error(s)",
  "files": [
    {
      "originalName": "valid.pdf",
      "status": "success",
      "message": "File uploaded and ingested successfully"
    },
    {
      "originalName": "invalid.docx",
      "status": "error",
      "message": "Unsupported file type: .docx. Supported types: ..."
    }
  ]
}
```

### All Failures Response

```json
{
  "success": false,
  "message": "No files were successfully ingested",
  "files": [
    {
      "originalName": "invalid.xyz",
      "status": "error",
      "message": "Unsupported file type: .xyz. Supported types: ..."
    }
  ]
}
```

## Error Handling

### Possible Errors

| Error | Cause | Solution |
|-------|-------|----------|
| No files provided | Empty request | Include at least one file in the form |
| Unsupported file type | File extension not in whitelist | Convert to a supported format |
| File size exceeds limit | File > 50 MB | Split file or compress before upload |
| Too many files | More than 20 files in request | Upload in batches of 20 or fewer |
| Ingestion failed | Extraction/parsing error | Check file integrity and format |

### Error Handling Examples

**JavaScript:**
```javascript
const response = await fetch('/upload', { method: 'POST', body: formData });
const result = await response.json();

if (!response.ok) {
  console.error('Upload failed:', result.message);
}

for (const file of result.files) {
  if (file.status === 'error') {
    console.warn(`${file.originalName}: ${file.message}`);
  }
}
```

**React with Toast Notifications:**
```typescript
const handleUpload = async (files: FileList) => {
  const response = await fetch('/upload', { method: 'POST', body: formData });
  const result = await response.json();

  if (result.success) {
    toast.success(result.message);
  } else {
    toast.error(result.message);
  }

  result.files.forEach(file => {
    if (file.status === 'success') {
      toast.info(`✓ ${file.originalName}`);
    } else {
      toast.error(`✗ ${file.originalName}: ${file.message}`);
    }
  });
};
```

## Storage & File Location

- **Upload directory:** `./uploads/` (relative to project root)
- **File naming:** Files are stored with UUID prefix + original extension to prevent collisions
  - Example: `550e8400-e29b-41d4-a716-446655440000.pdf`
- **Git ignored:** The `uploads/` directory is git-ignored and not committed to the repository
- **Persistence:** Files persist across server restarts (stored on disk)

## Ingestion Process

When a file is uploaded:

1. **Validation** – File type is checked against supported extensions
2. **Storage** – File is written to `uploads/` directory with UUID name
3. **Extraction** – Content is extracted based on file type:
   - Text files: read directly
   - PDFs: extract text
   - Excel: convert sheets to CSV
   - PowerPoint: extract slide text
   - Images: OCR text extraction
4. **Chunking** – Text is split into 900-token chunks with 150-token overlap
5. **Embedding** – Each chunk is embedded using OpenAI's `text-embedding-3-small`
6. **Storage** – Embeddings and chunks are stored in PostgreSQL with pgvector
7. **Response** – Client receives success/error status for each file

## Performance Considerations

- **Sequential Processing:** Files are processed one at a time to avoid database contention
- **Batch Size:** Embeddings are generated in batches of 50 for efficiency
- **Indexing:** IVFFlat index on vector column provides O(1) average search time
- **Max Concurrency:** Single-threaded by design; consider load balancing for production

## Next Steps

After uploading documents, you can immediately:

1. **Query the chatbot:** Send questions to `/chat` endpoint
2. **Check ingestion:** Use legacy `npm run ingest:check` command
3. **Monitor:** Check database directly via PostgreSQL client

```sql
SELECT COUNT(*) as total_chunks FROM chunks;
SELECT COUNT(*) as total_documents FROM documents;
```

## Troubleshooting

### Files not searchable after upload

**Check:**
1. Upload returned `status: "success"` ✓
2. Documents exist in database: `SELECT COUNT(*) FROM documents;`
3. Chunks were created: `SELECT COUNT(*) FROM chunks;`
4. Query with exact filename mentioned in upload

### Extraction failed for PDF/Excel

**Causes:**
- Corrupted file
- Unsupported encoding
- Complex formatting (scanned images in PDF)

**Solutions:**
- Test file with command line tool
- Convert to simpler format (e.g., export Excel to CSV)
- For scanned PDFs, ensure OCR is enabled

### Server returns 413 Payload Too Large

**Cause:** File size exceeds 50 MB limit

**Solution:**
- Compress the file
- Upload in parts
- Modify `multer` limits in `src/server.ts` if needed

```typescript
const upload = multer({
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB
  }
});
```

## Architecture Diagram

```
Frontend (Upload)
       ↓
[POST /upload]
       ↓
[Multer Middleware]
       ↓
[File Storage: uploads/]
       ↓
[Extractor] → Extract text from any file type
       ↓
[Chunker] → Split into 900-token chunks
       ↓
[Embedder] → Generate embeddings (OpenAI API)
       ↓
[PostgreSQL + pgvector] → Store in database
       ↓
[Response] → Return success/error status
       ↓
Frontend (Results)
```

