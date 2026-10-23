import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not configured");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const directory = join(import.meta.dirname, "../migrations");

try {
  await sql.begin(async (transaction) => {
    await transaction.unsafe("SELECT pg_advisory_xact_lock(hashtext('crabyard-api-migrations'))");
    await transaction.unsafe(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const files = (await readdir(directory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
    for (const name of files) {
      const [applied] = await transaction.unsafe("SELECT name FROM schema_migrations WHERE name = $1", [name]);
      if (applied) continue;
      await transaction.unsafe(await readFile(join(directory, name), "utf8"));
      await transaction.unsafe("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      console.log(`Applied ${name}`);
    }
  });
} finally {
  await sql.end();
}
