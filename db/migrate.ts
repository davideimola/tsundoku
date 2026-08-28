import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { connection, withDatabase } from "./env.ts";

// The schema, applied.
//
// Migrations are plain, ordered, forward-only SQL files in `db/migrations`. There is
// no down migration and no file is ever edited after it has been applied — the
// checksum below refuses that rather than trusting anyone to remember. Invariants
// live in Postgres, so these files are where most of the model actually is.
//
// The file name is `<issue>_<step>_<slug>.sql`: `<issue>` is the GitHub issue number
// of the ticket that adds the file and `<step>` counts the files within that ticket.
// Both are fixed width, so the lexical order is the numeric one, and no two tickets
// can pick the same number because GitHub already handed them out.

const MIGRATIONS = fileURLToPath(new URL("./migrations/", import.meta.url));

const NAME = /^\d{4}_\d{2}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

export type Migration = { filename: string; sql: string; checksum: string };

/** Read the migrations off disk, in the order they must be applied. */
export async function readMigrations(): Promise<Migration[]> {
  const entries = (await readdir(MIGRATIONS)).filter((name) => name.endsWith(".sql")).sort();

  const wrong = entries.filter((name) => !NAME.test(name));
  if (wrong.length > 0) {
    throw new Error(
      `These migration file names do not follow <issue>_<step>_<slug>.sql: ${wrong.join(", ")}\n` +
        "Four digits for the GitHub issue number, two for the step within it, then a " +
        "lower_snake_case slug — for example 0002_01_type_is_a_data_row.sql."
    );
  }

  return Promise.all(
    entries.map(async (filename) => {
      const sql = await readFile(new URL(filename, `file://${MIGRATIONS}`), "utf8");
      return { filename, sql, checksum: createHash("sha256").update(sql).digest("hex") };
    })
  );
}

/**
 * Which migrations still have to run, given the files on disk and what the ledger
 * says has already been applied — and the two things that mean somebody has broken
 * the forward-only rule.
 *
 * Pure, and separate from applying them, because this is the whole decision: the
 * refusals below are the only thing standing between an edited migration and a
 * schema that differs from everyone else's without anybody being told.
 */
export function pendingMigrations(
  migrations: readonly Migration[],
  applied: ReadonlyMap<string, string>
): Migration[] {
  const known = new Set(migrations.map((migration) => migration.filename));
  const vanished = [...applied.keys()].filter((filename) => !known.has(filename));
  if (vanished.length > 0) {
    throw new Error(
      `This database has migrations that are no longer on disk: ${vanished.join(", ")}.\n` +
        "Migrations are forward-only, so a file is never deleted or renamed once it has " +
        "run. If you are merging branches, `pnpm db:reset` rebuilds from what is here."
    );
  }

  const pending: Migration[] = [];
  for (const migration of migrations) {
    const seen = applied.get(migration.filename);
    if (seen === undefined) {
      pending.push(migration);
      continue;
    }
    if (seen !== migration.checksum) {
      throw new Error(
        `${migration.filename} has changed since it was applied.\n` +
          "Migrations are forward-only: add a new file instead of editing this one. If " +
          "the change is yours and has not been shared, `pnpm db:reset` rebuilds from " +
          "scratch."
      );
    }
  }
  return pending;
}

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
 * Apply every migration the database has not seen, each in its own transaction, and
 * return the ones applied. Safe to run on a database that is already current.
 */
export async function applyMigrations(url: string): Promise<string[]> {
  const migrations = await readMigrations();
  const client = await connect(url);
  try {
    await client.query(`
      create table if not exists schema_migrations (
        filename   text        primary key,
        checksum   text        not null,
        applied_at timestamptz not null default now()
      )
    `);

    const { rows } = await client.query<{ filename: string; checksum: string }>(
      "select filename, checksum from schema_migrations"
    );
    const applied = new Map(rows.map((row) => [row.filename, row.checksum]));

    const done: string[] = [];
    for (const migration of pendingMigrations(migrations, applied)) {
      await client.query("begin");
      try {
        await client.query(migration.sql);
        await client.query("insert into schema_migrations (filename, checksum) values ($1, $2)", [
          migration.filename,
          migration.checksum,
        ]);
        await client.query("commit");
      } catch (cause) {
        await client.query("rollback");
        throw new Error(`${migration.filename} failed and was rolled back.`, { cause });
      }
      process.stdout.write(`applied ${migration.filename}\n`);
      done.push(migration.filename);
    }
    return done;
  } finally {
    await client.end();
  }
}
