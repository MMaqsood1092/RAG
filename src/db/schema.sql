CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY,
  source TEXT,
  path TEXT,
  checksum TEXT,
  embedding_model TEXT,
  embedding_dimension INT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  content TEXT,
  embedding VECTOR,
  metadata JSONB
);

-- IVFFlat index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
ON chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 200);

CREATE INDEX IF NOT EXISTS idx_chunks_metadata ON chunks USING GIN (metadata);

-- Chat history: one conversation can have many messages
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (conversation_id, created_at);

-- Events and projects (linked so chatbot can share both)
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT,
  details TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_project_id ON events (project_id);

-- Link ingested attachments (documents) to projects via event id in path.
-- Paths look like: .../Attatchments/.../events/3982/file.pdf or .../events/reliability/5626/file.csv
CREATE OR REPLACE VIEW project_attachments AS
SELECT
  p.id AS project_id,
  p.name AS project_name,
  e.id AS event_id,
  e.name AS event_name,
  d.path AS attachment_path,
  d.id AS document_id
FROM projects p
JOIN events e ON e.project_id = p.id
JOIN documents d ON (
  replace(d.path, '\', '/') LIKE '%events%'
  AND (
    replace(d.path, '\', '/') LIKE '%/' || e.id || '/%'
    OR replace(d.path, '\', '/') LIKE '%/' || e.id || '.%'
  )
);

-- Same as project_attachments but with a content preview from chunks (extracted text/OCR).
CREATE OR REPLACE VIEW project_attachment_details AS
SELECT
  pa.project_id,
  pa.project_name,
  pa.event_id,
  pa.event_name,
  pa.attachment_path,
  pa.document_id,
  (
    SELECT string_agg(c.content, E'\n' ORDER BY c.id)
    FROM chunks c
    WHERE c.document_id = pa.document_id
  ) AS content_preview
FROM project_attachments pa;
