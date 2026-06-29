import pg from "pg";
import { config } from "../config";

function getPoolConfig(): pg.PoolConfig {
  const url = config.dbUrl;
  if (!url) {
    throw new Error("ERROR: DATABASE_URL is not set.");
  }
  
  const parsed = new URL(url);
  const password = parsed.password ?? "";
  
  // Only use SSL for remote databases
  const isRemote = !parsed.hostname?.includes("localhost") && !parsed.hostname?.includes("127.0.0.1");
  const ssl = isRemote ? { rejectUnauthorized: false } : undefined;
  
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "5432", 10),
    database: parsed.pathname.slice(1) || "postgres",
    user: parsed.username,
    password: String(password),
    max: 20,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    application_name: "chatbot-app",
    ssl: ssl,
  };
}

export const pool = new pg.Pool(getPoolConfig());

pool.on("error", (err) => {
  console.error("Database pool error:", err);
});

pool.on("connect", () => {
  console.log("✓ Connected to database");
});

pool.on("remove", () => {
  console.log("Client removed from pool");
});


