import "server-only";

import { asc } from "drizzle-orm";

import { binding } from "../../../db/schema.ts";
import { db } from "../db.ts";

/**
 * A Binding: how a Volume is bound — Tankōbon, Omnibus, Deluxe, Must Have, Hardcover,
 * Paperback.
 *
 * No union of string literals, for the reason `Type` has none (ADR-0006): a Binding is a
 * data row, and the vocabulary is closed-ish rather than closed — a kanzenban is a
 * Binding the owner will meet. A type that enumerated today's six would make a seventh a
 * deployment.
 *
 * The word is Binding. `format` is the one word `CONTEXT.md` refuses, because in the
 * spreadsheets it meant this in one place and a Pass's medium in another.
 */
export type Binding = {
  id: string;
  name: string;
};

/**
 * Every Binding, in the order they are offered in.
 *
 * Written against the schema rather than as SQL because there is nothing here to derive:
 * two columns off one table in a stated order. Where a query *does* derive something — the
 * reading list, the collection — it stays SQL, for the reason `db.ts` gives.
 */
export async function listBindings(): Promise<Binding[]> {
  return db()
    .select({ id: binding.id, name: binding.name })
    .from(binding)
    .orderBy(asc(binding.displayOrder));
}
