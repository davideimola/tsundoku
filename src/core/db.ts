import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type QueryResultRow } from "pg";

import * as schema from "../../db/schema.ts";

// The one connection to Postgres, and the only file in the repo that knows what a
// pool is.
//
// Everything above this reads and writes through the verbs and queries beside it;
// nothing outside `src/core` imports this module. `server-only` makes an accidental
// client import a build error, so `DATABASE_URL` — credentials and all — can never
// reach a browser bundle.
//
// The database is our own Postgres (ADR-0003), reached through Drizzle — which owns the
// migrations (ADR-0009) and, from here, the connection.
//
// **The queries are still SQL, and that is the decision and not an omission.** The
// invariants and the derivations *are* the SQL: `join lateral … on true` so that a Story
// nothing carries yields no row, `unnest($1::uuid[])` to ask about many at once,
// `jsonb_build_object` to shape an answer, and fragments like `IN_THE_HOUSE` composed into
// several queries so one rule is written once. A query builder paraphrases the simple half
// of that and cannot say the rest, which would leave the model readable in two places and
// authoritative in neither.
//
// What Drizzle gives here is the connection and the typed schema in `db/schema.ts`, which
// new code can join against. What it does not give is a second dialect for the queries.

// `next dev` replaces modules on every edit, which would leave a pool behind each
// time until Postgres refused the next connection. Keyed on the global so a reload
// finds the pool it already opened.
const KEY = Symbol.for("tsundoku.pool");
const HANDLE = Symbol.for("tsundoku.db");
const globals = globalThis as { [KEY]?: Pool; [HANDLE]?: NodePgDatabase<typeof schema> };

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
 * The Drizzle handle over that pool, with `db/schema.ts` attached.
 *
 * Here so that a query which *is* plain — reading a vocabulary table, inserting one row —
 * can be written against the schema and typed from it. The derivations stay in `query`
 * below; see the note at the top for where the line is.
 */
export function db(): NodePgDatabase<typeof schema> {
  const open = globals[HANDLE];
  if (open) return open;

  const created = drizzle(pool(), { schema, casing: "snake_case" });
  globals[HANDLE] = created;
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
  globals[HANDLE] = undefined;
  const open = globals[KEY];
  if (!open) return;
  // Cleared *after* closing, not before: clearing first would let a query arriving in
  // the meantime open a second pool that nothing ever closes, and the process would
  // hang instead of failing.
  await open.end();
  globals[KEY] = undefined;
}
