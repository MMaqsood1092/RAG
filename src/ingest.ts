import fs from "fs";
import path from "path";
import { ingestFile, ingestDirectory } from "./ingest/pipeline";
import { pool } from "./db/client";

async function ingest() {
  // If a path is passed, use it; otherwise default to the / folder
  const target =
    process.argv[2] || path.join(__dirname, "/");

  const stats = fs.statSync(target);

  if (stats.isDirectory()) {
    await ingestDirectory(target);
  } else {
    await ingestFile(target);
  }

  console.log("✅ Ingestion completed");
  
  // Close database connection pool
  await pool.end();
}

ingest().catch((err) => {
  console.error(err);
  process.exit(1);
});
