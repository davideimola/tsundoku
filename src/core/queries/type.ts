import "server-only";

import { query } from "../db.ts";

/**
 * A Type: Manga, Comic, Graphic Novel, Novel, Non-fiction.
 *
 * There is no union of string literals here on purpose. Type is a data row, never an
 * enum in code (ADR-0006) — a sixth Type is an insert, and a type that enumerated the
 * five would quietly make it a deployment instead.
 */
export type Type = {
  id: string;
  name: string;
};

/** Every Type, in the order they are offered in. */
export async function listTypes(): Promise<Type[]> {
  return query<Type>("select id, name from type order by display_order");
}
