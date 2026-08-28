import "server-only";

import { query } from "../db.ts";
import { refusing } from "../refusal.ts";
import type { Executor } from "../transaction.ts";

// Writing a Story. **No Volume is involved**, here or anywhere in this file: being read
// and being owned are two unrelated facts, and a Story read digitally, borrowed or known
// only from Goodreads history is a first-class one (ADR-0001). Which Volumes carry a
// Story is a different fact, written elsewhere.

/** What creating a Story needs, and the whole of it. */
export type NewStory = {
  title: string;
  /** A Type's slug — `manga`, `novel`. A data row, never an enum in code (ADR-0006). */
  typeId: string;
};

/**
 * Add a Story to the library, at whatever granularity the owner chose for this one:
 * *Gotham Noir* is a story inside one volume, *Slam Dunk* is a story across twenty, and
 * nothing here records which. Returns its id.
 *
 * The owner's verb, not MCP's: an external assistant may only *propose* a Story, as an
 * Inbox entry the owner approves (ADR-0005). `run` is how the Inbox's approval calls it
 * inside its own transaction: approving is one act, so the Story and the entry that became
 * it land together or not at all (see `../transaction.ts`).
 */
export async function createStory(story: NewStory, run: Executor = query): Promise<string> {
  const rows = await refusing(
    () =>
      run<{ id: string }>(
        "insert into story (title, type_id) values (btrim($1), $2) returning id",
        [story.title, story.typeId]
      ),
    (constraint) => {
      if (constraint === "story_title_is_not_blank") return "A Story needs a title.";
      if (constraint === "story_type_exists") return "That is not a Type this library knows.";
      return "That Story could not be added.";
    }
  );

  // The insert returns a row or it throws. Reading it out of the array rather than
  // asserting on it keeps the non-null assertion out of the file.
  const [created] = rows;
  if (!created) throw new Error("insert into story returned no row");
  return created.id;
}
