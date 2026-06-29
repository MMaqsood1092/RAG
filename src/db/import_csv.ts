import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { pool } from "./client";

const PUBLIC_TABLES_DIR = path.join(
  __dirname,
  "..",
  "Tables",
  "public"
);

async function importEvents(): Promise<void> {
  const eventsPath = path.join(PUBLIC_TABLES_DIR, "events.csv");
  if (!fs.existsSync(eventsPath)) {
    console.warn(`⚠️ events.csv not found at ${eventsPath}, skipping events import`);
    return;
  }

  console.log(`📥 Importing events from ${eventsPath} ...`);

  const stream = fs.createReadStream(eventsPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
    })
  );

  let count = 0;
  for await (const record of stream as any) {
    // events.csv header:
    // project_id,assigned_to,unit_id,priority,created_at,updated_at,id,event_sub_category_id,...
    const projectId = String(record.project_id || "").trim();
    const eventId = String(record.id || "").trim();
    if (!projectId || !eventId) continue;

    const title = (record.title as string | undefined) ?? null;
    const description = (record.description as string | undefined) ?? null;

    // Upsert project (we only know the id here)
    await pool.query(
      `INSERT INTO projects (id)
       VALUES ($1)
       ON CONFLICT (id) DO NOTHING`,
      [projectId]
    );

    // Upsert event linked to project
    await pool.query(
      `INSERT INTO events (id, project_id, name, details)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
       SET project_id = EXCLUDED.project_id,
           name       = COALESCE(EXCLUDED.name, events.name),
           details    = COALESCE(EXCLUDED.details, events.details)`,
      [eventId, projectId, title, description]
    );

    count += 1;
    if (count % 1000 === 0) {
      console.log(`  Imported ${count} events...`);
    }
  }

  console.log(`✅ Imported/updated ${count} events from events.csv`);
}

async function main() {
  try {
    console.log("🚀 Starting CSV import into events/projects tables...");
    await importEvents();
    console.log("🎉 CSV import completed");
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

