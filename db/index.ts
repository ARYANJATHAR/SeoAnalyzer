import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

function connect() {
  // SQLite is runtime-owned data, not an asset to include in a server bundle.
  const path = resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH || "./data/answerlens.db");
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("busy_timeout = 10000");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec("CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const directory = resolve("db/migrations");
  sqlite.transaction(() => {
    for (const name of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
      if (sqlite.prepare("SELECT 1 FROM migrations WHERE name=?").get(name)) continue;
      sqlite.exec(readFileSync(resolve(directory, name), "utf8"));
      sqlite.prepare("INSERT INTO migrations VALUES (?,?)").run(name, new Date().toISOString());
    }
  }).immediate();
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

const globalDb = globalThis as typeof globalThis & { answerlensDb?: ReturnType<typeof connect> };
export function database() {
  return (globalDb.answerlensDb ??= connect());
}
