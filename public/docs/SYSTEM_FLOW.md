# System Flow: Ingestion & Query

## Overview
This is a Vector Search system. We convert documents into searchable vectors and store them in a database. When you search, we convert your search query into a vector and find the most similar documents.

---

## INGESTION FLOW (npm run ingest)

### Step 1: Extract Text from File
**File:** `src/ingest/extractor.ts`
- Read the uploaded file (PDF, CSV, Excel, PNG, etc.)
- Convert to plain text
- Example: 
  - PDF → extract all text from pages
  - CSV → read as-is
  - Excel → convert sheets to CSV format
  - PNG → use OCR to extract visible text

### Step 2: Split into Sections (Chunking)
**File:** `src/ingest/chunker.ts`
- Break text into smaller, meaningful pieces
- **For CSV/Excel:** Each row becomes one section
  - Converts headers to key-value pairs
  - Example: `name: John, company: Acme` (instead of raw `John,Acme`)
- **For PDF/Text:** Split by paragraphs (separated by blank lines)
  - Large paragraphs (>900 chars) are further split

### Step 3: Generate Embeddings (Vectors)
**File:** `src/ingest/embedder.ts`
- Convert each section into a vector (array of 1024 numbers)
- Uses Voyage AI API (`voyage-3-lite` model)
- **Rate Limiting:** 
  - Free tier allows 3 requests per minute
  - System waits 20 seconds between requests
  - If API returns 429 (too many requests), automatically retries after waiting
- Example: `"John Smith works at Acme" → [0.123, -0.456, 0.789, ...]`

### Step 4: Store in Database
**File:** `src/ingest/pipeline.ts`
- Save to PostgreSQL with pgvector extension
- Table: `chunks`
  - `id`: unique chunk ID
  - `content`: the original text
  - `embedding`: the vector (1024 dimensions)
  - `document_id`: which file this came from
  - `metadata`: extra info (row number, sheet name, etc.)

### Complete Ingestion Example:
```
File: leads.csv
  ↓ Extract
Text: "name,company\nJohn,Acme\nJane,TechCorp"
  ↓ Chunk (section-wise)
Sections: 
  - "name: John, company: Acme"
  - "name: Jane, company: TechCorp"
  ↓ Embed (with rate limiting)
Vectors:
  - Section 1 → [0.12, -0.45, 0.78, ...]
  - Section 2 → [0.23, -0.34, 0.91, ...]
  ↓ Store
Database:
  - chunks table has 2 rows
  - Each row has content + embedding vector
```

---

## QUERY FLOW (POST /chat)

### Step 1: Convert Query to Vector
**File:** `src/api/chat.ts` → `embedQuery()`
- User asks: `"John Acme"`
- Convert to vector using same Voyage API
- Result: `[0.11, -0.46, 0.79, ...]`
- **Also has rate limiting:** waits 20 seconds between requests

### Step 2: Vector Search in Database
**File:** `src/api/chat.ts` → `chat()`
- Find chunks with vectors closest to query vector
- Uses PostgreSQL's `<=>` operator (cosine similarity)
- Retrieves top 10 most similar chunks

### Step 3: Calculate Relevance Scores
**File:** `src/api/chat.ts` → `calculateCosineSimilarity()`
- For each result, calculate how similar it is (0 to 1)
- Example scores:
  - 0.95 = very similar
  - 0.75 = moderately similar
  - 0.50 = somewhat similar

### Step 4: Return Results
**Response Format:**
```json
{
  "results": [
    {
      "content": "name: John, company: Acme",
      "score": 0.95
    },
    {
      "content": "name: Jane, company: TechCorp",
      "score": 0.72
    }
  ]
}
```

### Complete Query Example:
```
User Query: "John"
  ↓ Embed query
Query Vector: [0.11, -0.46, 0.79, ...]
  ↓ Search database
Found chunks:
  - Chunk 1 (score: 0.95): "name: John, company: Acme"
  - Chunk 2 (score: 0.88): "name: Jane, company: TechCorp"
  - Chunk 3 (score: 0.72): "contact: john@acme.com"
  ↓ Return top results
Response: 10 chunks with highest scores
```

---

## Key Concepts

### Vector (Embedding)
A list of 1024 numbers that represents the meaning of text. Similar texts have similar vectors.

### Cosine Similarity
How close two vectors are (0 = opposite, 1 = identical). Used to find relevant results.

### Rate Limiting
Voyage API free tier: 3 requests per minute. System automatically:
1. Waits 20 seconds between requests
2. Detects 429 errors (too many requests)
3. Retries after waiting (max 3 attempts)

### Database Table (chunks)
```
id | content | embedding | document_id | metadata
---|---------|-----------|-------------|----------
1  | "John..." | [vector] | doc-123 | {"row": 1, "type": "csv_row"}
2  | "Jane..." | [vector] | doc-123 | {"row": 2, "type": "csv_row"}
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `extractor.ts` | Extract text from files |
| `chunker.ts` | Split into sections (rows for CSV, paragraphs for text) |
| `embedder.ts` | Generate vectors + handle rate limiting |
| `pipeline.ts` | Orchestrate ingestion (extract → chunk → embed → store) |
| `chat.ts` | Handle queries (embed query → search → return results) |
| `client.ts` | PostgreSQL connection |

---

## Summary

**Ingestion:** File → Extract → Split into Sections → Generate Vectors → Store in DB

**Query:** User Question → Generate Vector → Find Similar Sections → Return with Scores
