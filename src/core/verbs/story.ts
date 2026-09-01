import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import { type Executor, transaction } from "../transaction.ts";
import { recordVolumeCarriesStory } from "./story-to-volume.ts";

// Writing a Story. **Creating one needs no Volume**, and that is the rule the file is built
// on: being read and being owned are two unrelated facts, and a Story read digitally,
// borrowed or known only from Goodreads history is a first-class one (ADR-0001). Which
// Volumes carry a Story is a different fact, and it is written in `story-to-volume.ts`.
//
// One verb here names a Volume, and it is the exception that proves the rule rather than a
// crack in it: `createStoryCarriedBy` is *both* facts said in one breath, because the owner
// reading a contents page off the back of an object is stating both at once. It takes the
// Volume as a second argument and writes nothing about it — `NewStory` has no Volume in it,
// and never will.

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
    (constraint) => whyStoryRefused(constraint, "That Story could not be added.")
  );

  // The insert returns a row or it throws. Reading it out of the array rather than
  // asserting on it keeps the non-null assertion out of the file.
  const [created] = rows;
  if (!created) throw new Error("insert into story returned no row");
  return created.id;
}

/**
 * Add a Story **and record that this Volume carries it**, in one act.
 *
 * The owner is holding the object and reading the contents page off the back of it: *Hulk
 * Rosso* holds the six issues of one arc and a back-up story from somewhere else, and neither
 * narrative is in the library yet. Saying so used to be two screens — record the Story on the
 * wall, come back, choose it in the picker — and the trip back is where the second story of a
 * volume stops being recorded at all.
 *
 * **It is one verb because it is one fact with two halves, and half of it is worse than
 * neither** (`../transaction.ts`): a Story nothing carries reads as something read digitally,
 * and an object recorded as carrying nothing reads as an object nobody has opened. So they
 * land together or not at all, and the refusal that rolls it back is the verb's own prose —
 * a Type this library does not know, or a Volume that is not in it.
 *
 * It composes the two verbs rather than writing their SQL again, which is what keeps the
 * constraint names and the prose in one place each.
 *
 * **Not a tool, and it is the plainest case of ADR-0005 in the repository**: it creates a
 * Story, so an assistant may only propose it, and the door for that is the Inbox. The Volume
 * side of it is safe on its own and is `recordVolumeCarriesStory`.
 *
 * Returns the new Story's id.
 */
export async function createStoryCarriedBy(story: NewStory, volumeId: string): Promise<string> {
  return transaction(async (run) => {
    const storyId = await createStory(story, run);
    await recordVolumeCarriesStory(volumeId, storyId, run);
    return storyId;
  });
}

/** The prose for every constraint the `story` table can refuse a write with. */
function whyStoryRefused(constraint: string | undefined, otherwise: string): string {
  if (constraint === "story_title_is_not_blank") return "A Story needs a title.";
  if (constraint === "story_type_exists") return "That is not a Type this library knows.";
  return otherwise;
}

// A Story's id is generated, so nothing types one: a malformed id is the same event as an
// unknown one, and saying so here keeps it from reaching the driver as a syntax error on a
// uuid column.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_SUCH_STORY = "No Story has that id.";

/**
 * What an approved Amendment writes onto a Story: the fields it names, and nothing else.
 *
 * `null` or absent means **leave what stands there today**, so an amendment completes and
 * corrects but never empties — a Story with no title and no Type is not something an
 * assistant may propose its way to.
 */
export type StoryAmendment = {
  title?: string | null;
  /** A Type's slug — `manga`, `novel`. A data row, never an enum in code (ADR-0006). */
  typeId?: string | null;
};

/**
 * Complete or correct a Story the library already holds: a title typed wrong on the way in,
 * a Type nobody chose carefully.
 *
 * **The owner's act, and the Inbox is the door an assistant reaches it through** — a
 * silently changed title is the permanent, unnoticed wrong fact ADR-0011 is about, so it is
 * proposed as an Amendment and waits for a decision. `run` is how that approval calls this
 * inside its own transaction (see `../transaction.ts`).
 *
 * No Reading, no Rating and no Volume follow from it: what a Story is and what was done
 * with it are unrelated facts (ADR-0001).
 */
export async function amendStory(
  storyId: string,
  amendment: StoryAmendment,
  run: Executor = query
): Promise<void> {
  if (!UUID.test(storyId)) throw new Refusal("not-found", NO_SUCH_STORY);
  if (!Object.values(amendment).some((value) => value !== null && value !== undefined)) {
    throw new Refusal("invalid", "An amendment changes at least one field of the Story.");
  }

  // `coalesce` rather than a `set` clause assembled from whichever fields arrived: the
  // fields are a closed list written here, and *leave it standing* is the same sentence in
  // SQL as it is in the type above.
  const changed = await refusing(
    () =>
      run<{ id: string }>(
        `update story
            set title   = coalesce($2, title),
                type_id = coalesce($3, type_id)
          where id = $1
          returning id`,
        [storyId, amendment.title ?? null, amendment.typeId ?? null]
      ),
    (constraint) => whyStoryRefused(constraint, "That Story could not be amended.")
  );

  if (changed.length === 0) throw new Refusal("not-found", NO_SUCH_STORY);
}
