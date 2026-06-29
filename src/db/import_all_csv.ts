import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { pool } from "./client";

const PUBLIC_TABLES_DIR = path.join(
  __dirname,
  "..",
  "Tables",
  "public",
);

// We already have custom schema/logic for some tables; skip only those.
// Note: events.csv is imported into a separate events_raw table so we can
// preserve all CSV columns without conflicting with the structured events table.
const SKIP_TABLES = new Set<string>(["projects"]);

async function importCsvFile(filePath: string): Promise<void> {
  const base = path.basename(filePath);
  const baseName = base.replace(/\.csv$/i, "");
  const tableName =
    baseName.toLowerCase() === "events" ? "events_raw" : baseName;

  if (SKIP_TABLES.has(tableName)) {
    console.log(`↷ Skipping ${base} (handled by specialized logic)`);
    return;
  }

  console.log(`📥 Importing ${tableName} from ${filePath} ...`);

  const stream = fs.createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
    }),
  );

  let created = false;
  let count = 0;

  for await (const record of stream as any) {
    const row = record as Record<string, unknown>;

    if (!created) {
      const columns = Object.keys(row).map((c) => c.trim());
      if (columns.length === 0) {
        console.warn(`⚠️ No columns found in ${base}, skipping`);
        return;
      }

      const colsSql = columns.map((c) => `"${c}" TEXT`).join(", ");

      await pool.query(
        `CREATE TABLE IF NOT EXISTS "${tableName}" (${colsSql});`,
      );

      created = true;
    }

    const columns = Object.keys(row).map((c) => c.trim());
    const values = columns.map((c) => (row as any)[c]);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
    const colList = columns.map((c) => `"${c}"`).join(", ");

    await pool.query(
      `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders})`,
      values,
    );

    count += 1;
    if (count % 1000 === 0) {
      console.log(`  ${tableName}: ${count} rows imported...`);
    }
  }

  console.log(`✅ Finished importing ${count} row(s) into ${tableName}`);
}

async function main() {
  try {
    if (!fs.existsSync(PUBLIC_TABLES_DIR)) {
      console.error(
        `❌ Public tables directory not found: ${PUBLIC_TABLES_DIR}`,
      );
      return;
    }

    const files = fs
      .readdirSync(PUBLIC_TABLES_DIR)
      .filter((f) => f.toLowerCase().endsWith(".csv"))
      .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) {
      console.warn("⚠️ No CSV files found to import.");
      return;
    }

    console.log(
      `🚀 Importing ${files.length} CSV file(s) from ${PUBLIC_TABLES_DIR}`,
    );

    const failed: string[] = [];

    for (const file of files) {
      const fullPath = path.join(PUBLIC_TABLES_DIR, file);
      try {
        await importCsvFile(fullPath);
      } catch (err) {
        failed.push(file);
        console.error(`❌ Failed to import ${file}`, err);
      }
    }

    if (failed.length === 0) {
      console.log("🎉 All CSV imports completed successfully");
    } else {
      console.warn(
        `⚠️ Completed CSV import with failures in ${failed.length} file(s): ${failed.join(
          ", ",
        )}`,
      );
    }
  } catch (err) {
    console.error("❌ CSV import failed", err);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main();
}
