import "server-only";

import { Pool, type QueryResultRow } from "pg";

// The one connection to Postgres, and the only file in the repo that knows what a
// pool is.
//
// Everything above this reads and writes through the verbs and queries beside it;
// nothing outside `src/core` imports this module. `server-only` makes an accidental
// client import a build error, so `DATABASE_URL` — credentials and all — can never
// reach a browser bundle.
//
// The database is our own Postgres, reached with plain SQL over `pg` (ADR-0003).
// There is deliberately no ORM and no query builder: the invariants and the
// derivations *are* the SQL, and a layer that paraphrases them would be a second
// place to read the model from.

// `next dev` replaces modules on every edit, which would leave a pool behind each
// time until Postgres refused the next connection. Keyed on the global so a reload
// finds the pool it already opened.
const KEY = Symbol.for("tsundoku.pool");
const globals = globalThis as { [KEY]?: Pool };

/** The pool, opened on first use so that a test can point at another database. */
export function pool(): Pool {
  const open = globals[KEY];
  if (open) return open;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString.trim() === "") {
    throw new Error("DATABASE_URL is not set. `cp .env.example .env.local`, then `pnpm db:up`.");
  }

  const created = new Pool({ connectionString });
  globals[KEY] = created;
  return created;
}

/**
 * Run one statement and return its rows.
 *
 * `values` is the only way to get a value into a statement: every call site passes
 * parameters rather than building a string, which is what makes SQL injection not a
 * thing that can happen here.
 */
export async function query<Row extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = []
): Promise<Row[]> {
  const result = await pool().query<Row>(text, values as unknown[]);
  return result.rows;
}

/**
 * Close the pool. For the test run's teardown, which would otherwise hold the
 * process open; the app never calls it.
 */
export async function closePool(): Promise<void> {
  const open = globals[KEY];
  if (!open) return;
  // Cleared *after* closing, not before: clearing first would let a query arriving in
  // the meantime open a second pool that nothing ever closes, and the process would
  // hang instead of failing.
  await open.end();
  globals[KEY] = undefined;
}
