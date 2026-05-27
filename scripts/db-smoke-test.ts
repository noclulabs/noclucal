// scripts/db-smoke-test.ts
// Permanent diagnostic tool: confirm the database connection works.
// Runs SELECT version(), SELECT 1, and SELECT NOW() against the configured DATABASE_URL.
// Useful for quickly answering "is the database reachable right now?"
// without needing to know any schema.
//
// Usage: pnpm db:smoke

import { closeDb, pool } from "../src/lib/db";

async function main() {
  console.log("Testing database connection...");

  const versionResult = await pool.query("SELECT version()");
  console.log(`Postgres version: ${versionResult.rows[0].version}`);

  const oneResult = await pool.query("SELECT 1 AS test");
  console.log(`SELECT 1 => ${JSON.stringify(oneResult.rows[0])}`);

  const nowResult = await pool.query("SELECT NOW() AS server_time");
  console.log(`SELECT NOW() => ${nowResult.rows[0].server_time}`);

  console.log("DB smoke test passed.");
}

main()
  .catch((err) => {
    console.error("DB smoke test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
