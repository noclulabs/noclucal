import { defineConfig } from "vitest/config";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Load .env.local for local `pnpm test` runs so DB-touching tests pick up
// DATABASE_URL without the developer having to export it. In CI, the
// workflow sets DATABASE_URL at the job level and .env.local does not
// exist, so this loader is a no-op there. Mirrors the loader noclulabs
// uses in its vitest.config.ts.
const env = loadDotenv(".env.local");

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    env,
    // DB-touching tests share a single database. Serial file execution
    // prevents writes in one file from racing the beforeEach in another.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

function loadDotenv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
