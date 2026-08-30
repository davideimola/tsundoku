import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { connection, withDatabase } from "./env.ts";

// The schema, applied.
//
// Migrations are ordered, forward-only SQL files in `db/migrations`, and **Drizzle owns
// the ledger** (ADR-0009). It records each file by a hash of its contents in its own
// `drizzle.__drizzle_migrations` table and refuses one that has changed since, which is
// the same protection the hand-written runner gave and the reason that runner existed.
//
// What Drizzle also gives, and is why it is here: `drizzle-kit generate` writes the next
// file by diffing `db/schema.ts` against the last snapshot, and numbers it sequentially.
// The old convention numbered files by GitHub issue, which made a file from a
// lower-numbered ticket arrive "from behind" and be refused — a real block, hit twice.
//
// **What Drizzle does not express, and this repository uses.** Generated migrations carry
// no `comment on` and no PL/pgSQL, so three things are hand-written SQL for ever:
//
//   - the trigger function `volume_holds_one_position()` and its two triggers;
//   - every `comment on`, which is where this schema documents itself — 56 of them;
//   - anything Postgres has and the DSL does not.
//
// A migration that touches those is written by hand into the generated file, after
// `drizzle-kit generate` has produced the rest. ADR-0009 says why that trade was taken.
//
// One rule survives unchanged: a file already applied is never edited. Drizzle's hash
// refuses it, and `pnpm db:reset` is the answer while a change is still yours alone.

const MIGRATIONS = fileURLToPath(new URL("./migrations/", import.meta.url));

async function connect(url: string): Promise<Client> {
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

/** Create the database named in the URL if the server does not have it yet. */
export async function ensureDatabase(url: string): Promise<void> {
  const { database } = connection(url);
  const admin = await connect(withDatabase(url, "postgres"));
  try {
    const { rowCount } = await admin.query("select 1 from pg_database where datname = $1", [
      database,
    ]);
    if (rowCount === 0) {
      // `create database` takes no parameters, and the name comes from a URL the
      // developer wrote, so it is quoted as an identifier rather than interpolated.
      await admin.query(`create database ${quoteIdentifier(database)}`);
      process.stdout.write(`created database ${database}\n`);
    }
  } finally {
    await admin.end();
  }
}

/** Delete the database named in the URL, so the next apply starts from nothing. */
export async function dropDatabase(url: string): Promise<void> {
  const { database } = connection(url);
  const admin = await connect(withDatabase(url, "postgres"));
  try {
    await admin.query(`drop database if exists ${quoteIdentifier(database)} with (force)`);
    process.stdout.write(`dropped database ${database}\n`);
  } finally {
    await admin.end();
  }
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Apply every migration the database has not seen. Safe to run on a database that is
 * already current, which is what the deployment's init container relies on: it runs this
 * before the app is allowed to serve, on every rollout.
 */
export async function applyMigrations(url: string): Promise<void> {
  const client = await connect(url);
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
  } finally {
    await client.end();
  }
}
