import { pool } from "./client";
import fs from "fs";
import path from "path";

export async function initDatabase() {
  const schema = fs.readFileSync(
    path.join(__dirname, "schema.sql"),
    "utf8"
  );
  await pool.query(schema);
  const seedPath = path.join(__dirname, "seed_linked_data.sql");
  if (fs.existsSync(seedPath)) {
    const seed = fs.readFileSync(seedPath, "utf8");
    await pool.query(seed);
    console.log("✅ Events/projects seed applied");
  }
  console.log("✅ Database initialized");
}

if (require.main === module) {
  initDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}


