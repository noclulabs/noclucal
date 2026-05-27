// Provisions the noclucal_test database. Idempotent.
// Called once in CI before `pnpm test` runs.

import { execSync } from "node:child_process";

function main() {
  console.log("Provisioning noclucal_test (applying migrations)...");
  try {
    execSync("pnpm db:migrate:deploy", {
      stdio: "inherit",
      env: { ...process.env },
    });
    console.log("noclucal_test provisioned.");
  } catch (err) {
    console.error("Failed to provision test database:", err);
    process.exit(1);
  }
}

main();
