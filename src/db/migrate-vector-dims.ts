import { pool } from "./client";

/**
 * Migration to support flexible vector dimensions
 * This drops and recreates tables to support pgvector without fixed dimensions
 */
export async function migrateVectorDimensions() {
  try {
    console.log("🔄 Starting vector dimension migration...");

    // Drop dependent views first
    await pool.query(`DROP VIEW IF EXISTS project_attachment_details CASCADE;`);
    await pool.query(`DROP VIEW IF EXISTS project_attachments CASCADE;`);
    console.log("✅ Dropped views");

    // Drop and recreate chunks table
    await pool.query(`DROP TABLE IF EXISTS chunks CASCADE;`);
    console.log("✅ Dropped chunks table");

    // Recreate chunks with flexible vector dimension
    await pool.query(`
      CREATE TABLE chunks (
        id UUID PRIMARY KEY,
        document_id UUID REFERENCES documents(id),
        content TEXT,
        embedding VECTOR,
        metadata JSONB
      );
    `);
    console.log("✅ Recreated chunks table");

    // Add columns to documents if they don't exist
    try {
      await pool.query(`
        ALTER TABLE documents 
        ADD COLUMN embedding_model TEXT DEFAULT 'voyage-default',
        ADD COLUMN embedding_dimension INT DEFAULT 1024;
      `);
      console.log("✅ Added columns to documents table");
    } catch (err: any) {
      if (err.code !== "42701") {
        // 42701 = column already exists
        throw err;
      }
      console.log("ℹ️  Columns already exist");
    }

    // Recreate metadata index
    await pool.query(`
      CREATE INDEX idx_chunks_metadata ON chunks USING GIN (metadata);
    `);
    console.log("✅ Recreated metadata index");

    // Note: IVFFlat index requires fixed dimensions, skip for now
    // It will be created automatically when needed or can be added with specific dimension
    console.log("ℹ️  IVFFlat index skipped - will be created when dimension is known");

    // Recreate views
    await pool.query(`
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
        replace(d.path, '\\', '/') LIKE '%events%'
        AND (
          replace(d.path, '\\', '/') LIKE '%/' || e.id || '/%'
          OR replace(d.path, '\\', '/') LIKE '%/' || e.id || '.%'
        )
      );
    `);

    await pool.query(`
      CREATE OR REPLACE VIEW project_attachment_details AS
      SELECT
        pa.project_id,
        pa.project_name,
        pa.event_id,
        pa.event_name,
        pa.attachment_path,
        pa.document_id,
        (
          SELECT string_agg(c.content, E'\\n' ORDER BY c.id)
          FROM chunks c
          WHERE c.document_id = pa.document_id
        ) AS content_preview
      FROM project_attachments pa;
    `);
    console.log("✅ Recreated views");

    console.log("✅ Migration completed successfully!");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    throw err;
  }
}

if (require.main === module) {
  migrateVectorDimensions()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
