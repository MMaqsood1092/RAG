# Quick Start: File Upload Feature

## What's New

Your chatbot now has a **file upload API** (`POST /upload`) that replaces folder-based ingestion. You can now upload files directly from your frontend application, and they'll be automatically extracted and indexed.

## In 60 Seconds

### 1. Start the server
```bash
npm run dev
```

### 2. Upload a file (from browser or command line)

**Browser:**
```javascript
const formData = new FormData();
formData.append("files", fileFromInput);

const response = await fetch("http://localhost:3000/upload", {
  method: "POST",
  body: formData
});

const result = await response.json();
console.log(result.message); // "Successfully ingested 1 file(s)"
```

**Command line:**
```bash
curl -X POST http://localhost:3000/upload \
  -F "files=@document.pdf"
```

### 3. Chat with your documents
```javascript
const response = await fetch("http://localhost:3000/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ question: "What does the document say?" })
});

const result = await response.json();
console.log(result.answer);
```

## Supported Files

| Type | Extensions |
|------|-----------|
| Text | `.txt`, `.md`, `.log`, `.json`, `.csv`, `.eml`, `.mot` |
| PDF | `.pdf` |
| Excel | `.xlsx`, `.xls` |
| PowerPoint | `.pptx` |
| Images | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` |

## Key Limits

- **Max file size:** 50 MB
- **Max files per request:** 20
- **Upload speed:** Depends on file size and type (typically 2-10 seconds per file)

## Response Format

```json
{
  "success": true,
  "message": "Successfully ingested 2 file(s)",
  "files": [
    {
      "originalName": "document.pdf",
      "storedPath": "/uploads/uuid.pdf",
      "documentId": "uuid.pdf",
      "status": "success",
      "message": "File uploaded and ingested successfully"
    }
  ]
}
```

## Common Use Cases

### React Component
```jsx
const [files, setFiles] = useState([]);

const handleUpload = async () => {
  const formData = new FormData();
  files.forEach(f => formData.append("files", f));

  const res = await fetch("/upload", { method: "POST", body: formData });
  const result = await res.json();
  
  if (result.success) {
    alert("Files uploaded!");
  }
};

return (
  <>
    <input type="file" multiple onChange={e => setFiles(e.target.files)} />
    <button onClick={handleUpload}>Upload</button>
  </>
);
```

### Vue 3 Component
```vue
<template>
  <div>
    <input type="file" multiple @change="handleFiles" />
    <button @click="upload">Upload</button>
  </div>
</template>

<script setup>
const files = ref([]);

const upload = async () => {
  const formData = new FormData();
  files.value.forEach(f => formData.append("files", f));

  const res = await fetch("/upload", { method: "POST", body: formData });
  const result = await res.json();
  console.log(result);
};
</script>
```

### Next.js API Route
```typescript
// pages/api/upload-proxy.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') return res.status(405).end();

  const response = await fetch('http://localhost:3000/upload', {
    method: 'POST',
    body: req,
    headers: req.headers,
  });

  const data = await response.json();
  res.status(response.status).json(data);
};
```

## File Storage

- Files are stored in `./uploads/` directory
- Each file gets a UUID name to prevent collisions: `550e8400-e29b-41d4-a716-446655440000.pdf`
- Files are git-ignored (not committed to repository)
- Files persist across server restarts

## Troubleshooting

### "Unsupported file type"
Check the file extension. Only these are supported:
- `.txt`, `.md`, `.log`, `.json`, `.csv`, `.eml`, `.mot` (text)
- `.pdf` (PDF documents)
- `.xlsx`, `.xls` (Excel)
- `.pptx` (PowerPoint)
- `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` (images)

### "File size exceeds limit"
Split the file or compress it. Max is 50 MB per file.

### "Ingestion failed"
- File might be corrupted
- For PDFs: try exporting as text first
- For images: ensure format is valid
- Check browser console for detailed error

### Files not searchable after upload
- Confirm status was "success" ✓
- Wait a few seconds for indexing
- Try asking a specific question about the content

## Documentation

- **Full API Guide:** See `UPLOAD_API_GUIDE.md`
- **Implementation Details:** See `IMPLEMENTATION_SUMMARY.md`
- **Code Examples:** See `UPLOAD_EXAMPLES.md`
- **README:** Updated with new endpoints

## Migration from Old System

### Before (Folder-based)
```bash
# Copy file to folder
cp document.pdf src/Attachments/

# Manually run ingestion
npm run ingest:attachments

# Wait for processing...
```

### Now (API-based)
```javascript
// Upload directly
const formData = new FormData();
formData.append("files", file);
await fetch("/upload", { method: "POST", body: formData });

// Immediately searchable!
```

## Next Steps

1. ✅ Install dependencies: `npm install`
2. ✅ Start server: `npm run dev`
3. 📝 Try uploading a file (see examples above)
4. 💬 Chat with your documents via `/chat` endpoint
5. 📚 Read full docs for advanced usage

## Need Help?

- See `UPLOAD_API_GUIDE.md` for comprehensive documentation
- See `UPLOAD_EXAMPLES.md` for code snippets
- See `IMPLEMENTATION_SUMMARY.md` for architecture details

---

**Happy uploading! 🎉**
