import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import type { Executor } from "../transaction.ts";

// Writing which Stories a Volume carries: **one fact, readable from both ends** (ADR-0001).
//
// There are two verbs here and no third one, because there is nothing to update: a link
// either says a true thing or it says a mistake, and the answer to a mistake is to take it
// back. Neither verb touches the Story or the Volume — recording that an object holds a
// narrative changes nothing about either of them, which is the whole reason they are
// separate entities.
//
// Both verbs are deliberately safe for the MCP door to call: they act on entities that
// already exist and refuse anything else, and they create no Story and no Volume (ADR-0005).
// That stays true of this file after `run` arrived on the first of them: **an executor is
// where a statement runs and never what it is allowed to write**, so a verb that takes one is
// no closer to creating anything. What passes one in is `createStoryCarriedBy` in `story.ts` —
// the owner recording a narrative the library has never held, inside the object they are
// holding — and it is one act rather than two because half of it landing is a Story nothing
// carries or an object recorded as carrying nothing (see `../transaction.ts`).

// An id is generated, so the owner never types one: what arrives here came from a screen
// the caller was just looking at, or from an assistant reading over MCP. A malformed one is
// therefore the same event as an unknown one, and this keeps it that way — `where id = $1`
// on a uuid column raises a *syntax* error for `"banana"`, which is not an integrity
// violation and would reach an adapter as a 500.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_VOLUME = "That Volume is not in the library.";
const NO_STORY = "That Story is not in the library yet.";

function bothAreIds(volumeId: string, storyId: string): void {
  if (!UUID.test(volumeId)) throw new Refusal("not-found", NO_VOLUME);
  if (!UUID.test(storyId)) throw new Refusal("not-found", NO_STORY);
}

/**
 * Record that a Volume carries a Story: *L'uomo che ride* holds *Gotham Noir*.
 *
 * The same fact read the other way is that the Story is carried by that Volume, and it is
 * the same row — nothing is written twice and nothing can fall out of step. Saying it again
 * says the same thing and changes nothing, so a caller correcting a list may repeat itself
 * without having to know what it already said.
 *
 * Nothing else follows from it. The Story is not read because an object holding it is
 * owned, and the Volume's Edition note is not a judgement of the Story it carries.
 *
 * `run` is how `createStoryCarriedBy` calls this inside its own transaction, so a Story
 * created to go in an object and the fact that it is in there land together or not at all.
 */
export async function recordVolumeCarriesStory(
  volumeId: string,
  storyId: string,
  run: Executor = query
): Promise<void> {
  bothAreIds(volumeId, storyId);

  await refusing(
    () =>
      run(
        `insert into volume_story (volume_id, story_id)
         values ($1, $2)
         on conflict on constraint volume_story_is_said_once do nothing`,
        [volumeId, storyId]
      ),
    (constraint) => {
      if (constraint === "volume_story_volume_exists") return NO_VOLUME;
      if (constraint === "volume_story_story_exists") return NO_STORY;
      return "That Volume could not be recorded as carrying that Story.";
    }
  );
}

/**
 * Take that fact back: this Volume does not carry this Story after all.
 *
 * It corrects a mistake and does nothing else — the Story stays in the library with its
 * Readings and its Ratings, and the Volume stays in the Collection. A Volume leaving the
 * house is a different verb, and it does not touch this link either, because what an object
 * held is still true of the object.
 *
 * Refused where there was no such fact, rather than passing silently: the caller believed
 * something that is not in the library, and that is worth naming.
 */
export async function recordVolumeNoLongerCarriesStory(
  volumeId: string,
  storyId: string
): Promise<void> {
  bothAreIds(volumeId, storyId);

  const gone = await query<{ volume_id: string }>(
    "delete from volume_story where volume_id = $1 and story_id = $2 returning volume_id",
    [volumeId, storyId]
  );

  if (gone.length === 0) {
    throw new Refusal("not-found", "That Volume does not carry that Story.");
  }
}
