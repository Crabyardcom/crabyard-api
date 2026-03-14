import postgres from "postgres";
import { readFileSync } from "fs";
import { join } from "path";

const sql = postgres(process.env.DATABASE_URL!);

const migration = readFileSync(
  join(import.meta.dirname, "../migrations/0001_initial.sql"),
  "utf-8"
);

console.log("Running migration...");
await sql.unsafe(migration);
console.log("Migration complete.");
await sql.end();
