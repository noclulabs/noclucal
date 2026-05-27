import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _pool: Pool | undefined;
let _db: Db | undefined;

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL environment variable is not set. " +
        "Copy .env.example to .env.local and ensure docker-compose.dev.yml is running.",
    );
  }
  return url;
}

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: requireDatabaseUrl(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return _pool;
}

function getDb(): Db {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

const lazy = <T extends object>(resolve: () => T): T =>
  new Proxy({} as T, {
    get(_target, prop) {
      const real = resolve();
      const value = Reflect.get(real, prop, real);
      return typeof value === "function" ? value.bind(real) : value;
    },
    has(_target, prop) {
      return Reflect.has(resolve(), prop);
    },
  });

export const pool: Pool = lazy(getPool);
export const db: Db = lazy(getDb);

export async function closeDb(): Promise<void> {
  if (_pool) {
    const p = _pool;
    _pool = undefined;
    _db = undefined;
    await p.end();
  }
}

export { schema };
