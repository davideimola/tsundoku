import "server-only";

import type { PoolClient, QueryResultRow } from "pg";

import { pool, type query } from "./db.ts";

// How a verb that is genuinely two writes stays one write.
//
// The rule is `verbs/README.md`'s: **one verb is one transaction**, and composing two
// verbs in a caller invents a transaction that does not exist. Approving an Inbox entry is
// the first verb in this repo that has to obey that rule across two statements it does not
// own — it creates a Story, a Volume or a Series *and* records that the entry became that
// row — and the two must land together or not at all, because either half alone is a lie:
// an entry marked approved that created nothing, or an entity nothing in the Inbox
// accounts for.
//
// So the creating verbs take **where to run** as their last argument, defaulting to the
// pool. That is the smallest thing that works and the only one that keeps the SQL and the
// refusal prose in one place: an approval that wrote its own inserts would be a second
// copy of `insert into story`, with a second set of constraint names to keep true.
//
// This is not a general-purpose unit of work and should not become one. Nothing above
// `src/core` may call it — a door that opened a transaction would be holding domain logic
// (ADR-0002) — and a verb that is one statement has no business here.

/**
 * Where a statement runs: the pool, or one client inside a transaction.
 *
 * Exactly `query`'s shape, so a verb's body does not change and the default costs the
 * caller nothing.
 */
export type Executor = typeof query;

/**
 * Run `work` inside one transaction, on one client, and commit it if it returns.
 *
 * Anything thrown rolls the whole thing back and travels on untouched — a `Refusal` from a
 * verb included, which is the point: the verb wrote the prose, and the transaction has no
 * opinion to add to it.
 */
export async function transaction<T>(work: (run: Executor) => Promise<T>): Promise<T> {
  const client = await pool().connect();

  try {
    await client.query("begin");
    const answer = await work(runningOn(client));
    await client.query("commit");
    return answer;
  } catch (error) {
    // Best effort: a connection that died mid-transaction cannot be rolled back, and the
    // error worth reporting is the first one rather than the failure to tidy up.
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function runningOn(client: PoolClient): Executor {
  return async <Row extends QueryResultRow>(text: string, values: readonly unknown[] = []) => {
    const result = await client.query<Row>(text, values as unknown[]);
    return result.rows;
  };
}
