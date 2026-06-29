/**
 * Check if a file (or files) has been ingested.
 * Usage:
 *   npm run ingest:check                          -- list recently ingested documents with chunk counts
 *   npm run ingest:check -- 79bb4f92-....xls      -- check a specific file by name
 *   npm run ingest:check -- ".xls"                -- list all ingested xls files
 */
import { pool } from "../db/client";

async function checkIngested(filter?: string) {
  if (filter) {
    const safePattern =
      "%" +
      filter
        .trim()
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_") +
      "%";
    const { rows } = await pool.query<{
      id: string;
      path: string | null;
      chunk_count: string;
    }>(
      `SELECT d.id, d.path,
              (SELECT count(*) FROM chunks c WHERE c.document_id = d.id) AS chunk_count
       FROM documents d
       WHERE d.path LIKE $1 ESCAPE E'\\\\'
          OR replace(d.path, E'\\\\', '/') LIKE $1 ESCAPE E'\\\\'
       ORDER BY d.path`,
      [safePattern]
    );
    if (rows.length === 0) {
      console.log(`No ingested document found matching: ${filter}`);
      console.log(
        "Tip: Use the exact filename (e.g. 79bb4f92-7321-4ff6-9598-3645f0a4811e.xls) or run 'npm run ingest:attachments' to ingest."
      );
      return;
    }
    console.log(`Found ${rows.length} ingested document(s) matching "${filter}":\n`);
    for (const r of rows) {
      const name = ((r.path ?? "").replace(/^.*[/\\]/, "") || (r.path ?? "")) || "(no path)";
      const ok = parseInt(r.chunk_count, 10) > 0 ? "✓" : "⚠ no chunks";
      console.log(`  ${ok} ${name}`);
      console.log(`    document_id: ${r.id}`);
      console.log(`    path: ${r.path ?? "—"}`);
      console.log(`    chunks: ${r.chunk_count}`);
      console.log("");
    }
    return;
  }

  const { rows } = await pool.query<{
    id: string;
    path: string | null;
    chunk_count: string;
  }>(
    `SELECT d.id, d.path,
            (SELECT count(*) FROM chunks c WHERE c.document_id = d.id) AS chunk_count
     FROM documents d
     ORDER BY d.path
     LIMIT 100`
  );
  console.log(`Ingested documents (up to 100):\n`);
  for (const r of rows) {
    const name = ((r.path ?? "").replace(/^.*[/\\]/, "") || (r.path ?? "")) || "(no path)";
    const ok = parseInt(r.chunk_count, 10) > 0 ? "✓" : "⚠";
    console.log(`  ${ok} ${name}  (chunks: ${r.chunk_count})`);
  }
  if (rows.length === 0) {
    console.log("  No documents in the database. Run: npm run ingest:attachments");
  }
}

const filter = process.argv[2];
checkIngested(filter)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
