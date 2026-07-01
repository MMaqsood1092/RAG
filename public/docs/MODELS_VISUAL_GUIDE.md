# 🤖 AI Models - Visual Guide

A visual, easy-to-understand guide to all AI models used in the chatbot project.

---

## 🎯 At a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                   CHATBOT ARCHITECTURE                       │
└─────────────────────────────────────────────────────────────┘

                         FRONTEND (Upload/Chat)
                                  │
                    ┌─────────────┴──────────────┐
                    ▼                            ▼
            ┌──────────────┐          ┌──────────────────┐
            │ POST /upload │          │  POST /chat      │
            └──────────────┘          └──────────────────┘
                    │                            │
        ┌───────────┴────────────┐              │
        ▼                        ▼              ▼
   [File Extract]        [text-embedding-    [Conversation]
   [Chunk Text]          3-small] ◄────────► [Context]
   [Batch 50]                  ▲
        │                      │
        │      Vector Search   │
        │    (Cosine Distance) │
        │                      │
        └──────────────────────┘
                    │
        ┌───────────┴────────────────────┐
        ▼                                ▼
   [Structured Query?]         [Unstructured Query?]
   (SQL/Attachment)            
        │                                │
   [gpt-4o-mini] ◄──────────┬──────────► [gpt-4o]
   (Fast, Cheap)            │            (Smart, Quality)
        │                   │                   │
        └───────────────────┴───────────────────┘
                            │
                            ▼
                    [Response to User]
                            │
                            ▼
                    [Store in Database]
```

---

## 🧠 Model 1: Text Embedding Model

### `text-embedding-3-small`

**What it does:** Converts words into numbers (vectors)

```
Input:
"The quick brown fox jumps over the lazy dog"

                    ↓
        [text-embedding-3-small]
                    ↓

Output (1536 numbers):
[0.123, -0.456, 0.789, ..., 0.234]
     1      2      3         1536
```

**Why?** Computers understand numbers better than words for finding similar documents

### How It Works in Your Chatbot

```
┌─────────────────────────────────────────────────────────┐
│ INGESTION (Document Upload → Vector Storage)            │
└─────────────────────────────────────────────────────────┘

Document Uploaded
      │
      ▼
  Extract Text
  "Introduction: This project tracks..."
      │
      ▼
  Split into Chunks (900 tokens each)
  ┌─ Chunk 1: "Introduction: This project..."
  ├─ Chunk 2: "...tracks events and..."
  └─ Chunk 3: "...manages failures with..."
      │
      ▼
  Batch 50 Chunks
      │
      ▼
  Send to text-embedding-3-small
  ┌─ Chunk 1 → Vector [0.1, -0.2, 0.3, ...]
  ├─ Chunk 2 → Vector [0.4, 0.5, -0.1, ...]
  └─ Chunk 3 → Vector [-0.2, 0.3, 0.7, ...]
      │
      ▼
  Store in PostgreSQL (pgvector)
  ┌─ Document ID: abc-123
  ├─ Chunk 1: Text + Vector
  ├─ Chunk 2: Text + Vector
  └─ Chunk 3: Text + Vector
      │
      ▼
  Create Index (IVFFlat) for Fast Search
```

### How It Works During Chat

```
┌─────────────────────────────────────────────────────────┐
│ RETRIEVAL (Question → Finding Related Documents)        │
└─────────────────────────────────────────────────────────┘

User Asks:
"What happened with failures in Q4?"
      │
      ▼
  Convert to Vector
  Question → text-embedding-3-small
         → Vector [0.15, -0.25, 0.35, ...]
      │
      ▼
  Search Database
  Find vectors MOST SIMILAR to question vector
  (Using Cosine Distance: 🔍)
      │
      ▼
  Top 5 Similar Chunks Found:
  1. "Q4 failures included..." ✓ MATCH
  2. "Failed systems were..." ✓ MATCH
  3. "Impact assessment..." ✓ MATCH
  4. "Resolution timeline..." ✓ MATCH
  5. "Preventive measures..." ✓ MATCH
      │
      ▼
  Send These 5 Chunks to gpt-4o
```

### Vector Visualization

```
Think of vectors as points in 3D space (actually 1536D, but we simplify):

    Z
    │     Questions about "Failures"
    │       ✓ "Q4 failures"
    │       ✓ "System failures"
    │    ╱╱╱
    │   ╱ ✓ ← Similar documents cluster together
    │  ╱   ✓
    │ ╱     ✓
    └─────────► X (Abstract dimension 1)
   ╱
  ╱ Y (Abstract dimension 2)

Our search: Find vectors CLOSEST to the question vector
Result: The 5 closest = most relevant documents
```

---

## 🗣️ Model 2: Main Chat Model

### `gpt-4o` (GPT-4 Optimized)

**What it does:** Thinks and writes like a human, understands documents

```
Input:
- System Prompt: "You are a helpful assistant..."
- Chat History: 20 previous messages
- RAG Context: 5 similar document chunks
- User Question: "What were Q4 failures?"

                    ↓
              [gpt-4o]
                    ↓

Output:
"Based on the documents, Q4 failures included:
1. Database outage on December 15th
2. Network issues affecting region 2
3. API rate limiting issues
..."
```

### How It Works

```
┌─────────────────────────────────────────────────────────┐
│ GPT-4O REASONING PROCESS                                │
└─────────────────────────────────────────────────────────┘

[Step 1] Understand Context
   └─ Read system prompt: "Be helpful and accurate"
   └─ Read chat history: Previous 20 messages
   └─ Read RAG chunks: 5 document snippets
   └─ Read question: User's actual question

[Step 2] Reason About Answer
   └─ "The question asks about Q4 failures"
   └─ "Documents mention December outages"
   └─ "Previous chat mentioned Region 2"
   └─ "I should combine this information"

[Step 3] Generate Response
   └─ Write clear, structured answer
   └─ Include specific facts from documents
   └─ Use conversation tone
   └─ Cite sources implicitly

[Step 4] Quality Check
   └─ Is it accurate? ✓
   └─ Is it complete? ✓
   └─ Is it relevant? ✓
   └─ Is it in format? ✓

[Step 5] Return to User
   └─ Send response
   └─ Save to database
   └─ Update conversation history
```

### Information Flow

```
Memory: Stores 20 previous messages
   │
   ├─ User (Q1): "What are failures?"
   ├─ Bot (A1): "There were 3 major failures..."
   ├─ User (Q2): "In what region?"
   ├─ Bot (A2): "Primarily in Region 2..."
   ├─ User (Q3): "More details?"  ← CURRENT QUESTION
   │
   ▼
gpt-4o reads ALL this history
Understands Q3 refers to Region 2 failures
Generates answer with full context
```

---

## ⚡ Model 3: Fast Processing Model

### `gpt-4o-mini` (GPT-4 Mini)

**What it does:** Quick thinking for simple tasks (100x cheaper!)

```
Input:
"Convert to SQL: List all events for project xyz"

                    ↓
           [gpt-4o-mini]
                    ↓

Output:
{
  "is_sql_query": true,
  "sql": "SELECT * FROM events WHERE project_id = 'xyz'"
}
```

### Use Case 1: Query Expansion

```
❌ Bad Question: "More?"
   └─ Too short for good search

✓ After gpt-4o-mini:
  "Show me additional system failures besides A, B, C"
  └─ Now we can search properly!

Flow:
Previous Answer → "Failures: A, B, C"
Short Question → "More?"
     │
     ▼
gpt-4o-mini expands to proper question
     │
     ▼
Better vector search results
```

### Use Case 2: SQL Conversion

```
"Show me all events in 2024"
     │
     ▼
gpt-4o-mini analyzes:
- Is this a structured query? ✓
- What table? events
- What condition? date in 2024
     │
     ▼
Generated SQL:
SELECT * FROM events 
WHERE date_created BETWEEN '2024-01-01' AND '2024-12-31'
     │
     ▼
Execute directly
     │
     ▼
Return exact results (No guessing!)
```

### Use Case 3: Document Q&A

```
User asks: "What's in the report.pdf?"
     │
     ▼
Find attachment "report.pdf"
Read extracted content
     │
     ▼
gpt-4o-mini answers ONLY based on content
(NOT from general knowledge)
     │
     ▼
"The report contains: [specific facts]"
```

---

## 💰 Cost Comparison

```
Per 1000 API Calls:

text-embedding-3-small
├─ Cost: $0.01
└─ Time: 100ms
   "Good for batching"

gpt-4o-mini
├─ Cost: $0.20
└─ Time: 500ms
   "30x cheaper than gpt-4o"

gpt-4o
├─ Cost: $6.00
└─ Time: 2 seconds
   "Smart but expensive"

Cost Ratio: mini is 30x cheaper, still 90% as smart!
```

---

## 🔄 Complete Chat Flow

```
User Message: "What were the Q4 failures?"
│
├─ Check if structured query? NO
│
├─ Is it short + has history? YES
│  └─ [gpt-4o-mini] Expand query
│     "Expand 'failures' in Q4 context"
│     → "What failures occurred in Q4?"
│
├─ Embed question
│  └─ [text-embedding-3-small] 
│     Question → Vector [0.1, -0.2, ...]
│
├─ Vector search
│  └─ SELECT * FROM chunks 
│     ORDER BY embedding <=> question_vector
│     LIMIT 5
│     → Get 5 similar chunks
│
├─ Get chat history
│  └─ Last 20 messages from DB
│
├─ Prepare context
│  ├─ System Prompt
│  ├─ Chat History
│  ├─ RAG Chunks (5)
│  └─ User Question
│
├─ Call main model
│  └─ [gpt-4o]
│     Full context → Generate response
│     → "Q4 failures included..."
│
├─ Save response
│  └─ Save user message
│  └─ Save bot response
│  └─ Update conversation updated_at
│
└─ Return to user
   Response + Conversation ID
```

---

## 📊 Model Selection Decision Tree

```
                    ┌─ User Question ─┐
                    │                 │
            Is it STRUCTURED?          
            (SQL/Attachment/Events)    
                    │
        ┌───────────┴──────────┐
        YES                    NO
        │                      │
        ▼                      ▼
   [gpt-4o-mini]      Is query SHORT + 
   Fast ⚡            history exists? 
   Cheap 💰                  │
                    ┌────────┴────────┐
                    YES              NO
                    │                │
                    ▼                ▼
                [gpt-4o-mini]   Skip mini
                Expand query   Direct search
                    │                │
                    └────────┬───────┘
                             │
                    ┌────────▼────────┐
                    │ [Embedding]     │
                    │ Get vectors     │
                    │ Search DB       │
                    │ Get top 5       │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ [gpt-4o]        │
                    │ Main response   │
                    │ Full context    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Save & Return   │
                    │ Response ready! │
                    └─────────────────┘
```

---

## 🎓 Understanding Vector Search

```
The Problem: How do we find documents similar to a question?

Traditional Keyword Search:
❌ Question: "failures in Q4"
❌ Search: Find exact words "failures" and "Q4"
❌ Problem: Misses "system outages" or "downtime in quarter 4"

Vector Search (What we use):
✓ Question: "failures in Q4"
✓ Convert to meaning vector: [0.1, -0.2, 0.3, ...]
✓ Find closest meaning vectors in DB
✓ Finds: "downtime", "outages", "incidents" - all relevant!

Why is vector better?
- It understands MEANING, not just words
- Similar documents cluster together in vector space
- Works across languages
- Synonyms recognized automatically
```

---

## 🔐 Security: What Models Can See

```
❌ Models CANNOT:
   - Access your database directly
   - See other users' conversations
   - Access the internet
   - Execute code
   - Modify anything

✓ Models CAN ONLY:
   - Read text you give them
   - Analyze it
   - Generate text response
   - That's it!

Example:
User: "Delete my data"
Model: "I can't delete data. I can only analyze and respond."

Actual file deletion: Handled by backend code (safe!)
Model involvement: ZERO
```

---

## 📈 Performance Timeline

```
User sends question
│ 0ms
├─ Query analysis        50ms ─ Structured? SQL? Event?
├─ Embedding query      200ms ─ Convert to vector
├─ Database search       50ms ─ Vector cosine similarity
├─ Load history          25ms ─ Get previous 20 messages
├─ Prepare context       25ms ─ Combine all info
└─ LLM processing     2000ms ─ gpt-4o generates response
                    ──────────
Total:              ~2350ms (2.3 seconds)

This includes:
✓ 5 network round trips
✓ Database query
✓ Complex AI reasoning
✓ Not bad! ⚡
```

---

## 🎯 Model Usage Per User

```
If 1000 users send 5 messages per day:

Per user:
├─ 5 embeddings (questions)     × 0.000001 = $0.000005
├─ 5 gpt-4o-mini calls         × 0.0002  = $0.001
└─ 5 gpt-4o responses          × 0.004   = $0.02
   User cost: ~$0.021/day = $0.63/month

Total for 1000 users:
├─ Embeddings: $5
├─ Mini model: $5  
├─ Main model: $600
└─ **Monthly: ~$610**

Per message: ~$0.12
→ Very affordable at scale!
```

---

## 🚀 Future Improvements

```
Current Setup:
text-embedding-3-small ─┐
                        ├─ gpt-4o ─ Response
gpt-4o-mini ────────────┘

Possible Future:
Open-source embeddings ─┐  (Self-hosted, no API calls)
                        ├─ Claude 3 Haiku ─ Response  (50% cost)
Llama 3 preprocessing ──┘  (100% local, private)

Benefits:
✓ 70% cost reduction
✓ 100% privacy
✓ No API rate limits
✓ Custom fine-tuning possible
```

---

## ✅ Quick Reference

```
┌──────────────────────┬──────────────────┬────────────┐
│ MODEL                │ PURPOSE          │ FREQUENCY  │
├──────────────────────┼──────────────────┼────────────┤
│ text-embedding-      │ Convert text to  │ Every      │
│ 3-small              │ vectors          │ message    │
│                      │ for search       │ + upload   │
├──────────────────────┼──────────────────┼────────────┤
│ gpt-4o-mini          │ Quick tasks:     │ 20-30%     │
│                      │ - SQL generation │ of messages│
│                      │ - Query expand   │            │
│                      │ - Doc Q&A        │            │
├──────────────────────┼──────────────────┼────────────┤
│ gpt-4o               │ Main response    │ 70-80%     │
│                      │ generation with  │ of messages│
│                      │ full context     │            │
└──────────────────────┴──────────────────┴────────────┘
```

---

## 🎬 In Action Example

```
EXAMPLE: User uploads "Q4_report.pdf" and asks questions

┌─────────────────────────────────────────────────┐
│ UPLOAD PHASE                                    │
└─────────────────────────────────────────────────┘

File: Q4_report.pdf (50 pages)
   │
   ▼ Extract text
"Q4 Results: Revenue up 15%
Q4 Failures: 3 major outages..."
   │
   ▼ Split into chunks
Chunk 1: "Q4 Results: Revenue up 15%..."
Chunk 2: "Q4 Failures: 3 major outages..."
... 120 chunks total
   │
   ▼ Batch in 50s
Batch 1: chunks 1-50
Batch 2: chunks 51-100
Batch 3: chunks 101-120
   │
   ▼ [text-embedding-3-small]
Chunk 1 → [0.123, -0.456, ...]
Chunk 2 → [0.789, 0.234, ...]
... etc
   │
   ▼ Store in DB
Database now has 120 vectors ready for search!

┌─────────────────────────────────────────────────┐
│ CHAT PHASE                                      │
└─────────────────────────────────────────────────┘

User Q1: "What were the Q4 failures?"
   │
   ▼ [text-embedding-3-small]
Question → [0.125, -0.450, ...]
   │
   ▼ Find similar vectors
Vector Search Results:
1. Chunk 2: "Q4 Failures: 3 major outages..." ✓ MATCH
2. Chunk 15: "Outage details: Database..." ✓ MATCH
3. Chunk 22: "Regional impact..." ✓ MATCH
4. Chunk 30: "Root cause analysis..." ✓ MATCH
5. Chunk 45: "Resolution steps..." ✓ MATCH
   │
   ▼ [gpt-4o]
System: "You are a helpful assistant analyzing reports"
History: [Empty - first question]
Context: [5 chunks about Q4 failures above]
Question: "What were the Q4 failures?"
   │
   ▼ Generate response
"Based on the Q4 report, there were 3 major failures:
1. Database outage (details in document)
2. Regional network issues (affected 2 regions)
3. API rate limiting (temporary service disruption)

Each lasted approximately 2-4 hours."
   │
   ▼ Save to database
Store conversation + message for next turn
   │
   ▼ Return to user ✓

User Q2: "How long did each last?"
   │
   ▼ [gpt-4o-mini - Optional Expansion]
Question is clear enough, skip expansion
   │
   ▼ [text-embedding-3-small]
Question → [0.110, -0.440, ...]
   │
   ▼ Find similar vectors
Results now include duration-specific chunks
   │
   ▼ [gpt-4o]
History: Q1 + A1 (what failures)
Context: Duration-specific chunks
Question: "How long did each last?"
   │
   ▼ "The durations were:
1. Database outage: 3 hours 15 minutes
2. Network issues: 4 hours
3. API limiting: 2 hours 30 minutes"
```

---

## 🎓 Summary Table

| Model | What | How | When | Cost | Speed |
|-------|------|-----|------|------|-------|
| **text-embedding-3-small** | Text→Vectors | Neural net | Always | $$ | ⚡⚡⚡ |
| **gpt-4o-mini** | Smart preprocessing | Fast AI | 20-30% | $ | ⚡⚡⚡ |
| **gpt-4o** | Smart responses | Advanced AI | 70-80% | $$$$ | ⚡⚡ |

---

**This is how AI makes your chatbot smart! 🧠**

For detailed information, see **MODELS.md**
