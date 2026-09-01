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

/** The range of a work one object collects, in the work's own units. */
export type CoveredRange = {
  /** The first Instalment inside this object. */
  from: number;
  /** The last one. Equal to `from` where the object carries a single part. */
  to: number;
};

// SAYING WHICH PART OF THE WORK IS IN THIS OBJECT (#37).
//
// **It is written by hand only where one object collects many** — the omnibus, and very
// nearly nothing else. Where a line prints one part per Volume, which is every manga on
// these shelves, the range **follows the Volume's position in its Series**: volume 7 is
// instalment 7 and nobody types anything, so this verb is never reached at all.
//
// The range is the *narrative's* units and never the printing's, which is the whole point of
// an Instalment: *one of three omnibus* is a fact about a shelf, and *one to thirty-five* is
// a fact about the work that stays true when the owner buys the deluxe line instead.

/**
 * Say which Instalments of the Story this Volume covers, or hand the answer back to the line
 * with `null` — an omnibus covers one to thirty-five, and a tankōbon covers its own position.
 *
 * It changes nothing else: what an object holds is not what the owner has read of it, and the
 * Volume keeps its place in its Series either way.
 *
 * Refused where this Volume does not carry that Story — there is no fact to qualify — and, by
 * Postgres rather than by an `if`, on a range that inverts, that starts before the work does
 * or that reaches past the end of it.
 */
export async function recordVolumeCoversInstalments(
  volumeId: string,
  storyId: string,
  covers: CoveredRange | null
): Promise<void> {
  bothAreIds(volumeId, storyId);
  // Two guards, and both are here for the reason the id's is: neither value can reach Postgres
  // as anything but a *syntax* error on an integer column, so the constraint that would say so
  // — `volume_story_covers_a_whole_range` — cannot be reached from this door. It stays in the
  // schema as the guarantee against any other writer, and these two are the sentences the
  // owner reads.
  if (covers && [covers.from, covers.to].filter(Number.isNaN).length === 1) {
    throw new Refusal(
      "invalid",
      "A range is both ends or neither. Say where it starts and where it ends, or leave both empty to follow the line."
    );
  }
  if (covers && (!Number.isInteger(covers.from) || !Number.isInteger(covers.to))) {
    throw new Refusal("invalid", "An Instalment is a whole part of the work, counted from one.");
  }

  const written = await refusing(
    () =>
      query<{ volume_id: string }>(
        `update volume_story
            set covers_from = $3, covers_to = $4
          where volume_id = $1 and story_id = $2
          returning volume_id`,
        [volumeId, storyId, covers?.from ?? null, covers?.to ?? null]
      ),
    (constraint) => {
      if (constraint === "volume_story_cover_does_not_invert")
        return "A range ends where it started or later: one to thirty-five, never thirty-five to one.";
      if (constraint === "volume_story_cover_starts_at_one")
        return "The Instalments of a work are counted from one.";
      // The two the migration's trigger raises: a check constraint cannot read the Story, and
      // whether instalment thirty-five exists is a fact about the *work*.
      if (constraint === "volume_story_cover_needs_a_serialized_story")
        return "That Story has no Instalments. Say how many it has before saying which of them this object holds.";
      if (constraint === "volume_story_cover_lies_inside_the_work")
        return "That reaches past the end of the Story. An object cannot cover more of a work than there is.";
      return "What this Volume covers could not be recorded.";
    }
  );

  if (written.length === 0) {
    throw new Refusal("not-found", "That Volume does not carry that Story.");
  }
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
