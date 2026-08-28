import "server-only";

import { query } from "../db.ts";

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
 * spreadsheets it meant this in one place and a Reading's medium in another.
 */
export type Binding = {
  id: string;
  name: string;
};

/** Every Binding, in the order they are offered in. */
export async function listBindings(): Promise<Binding[]> {
  return query<Binding>("select id, name from binding order by display_order");
}
