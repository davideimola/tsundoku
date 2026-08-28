import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";

// Writing an Edition note: what the owner thinks of a **Volume as an object** — print
// quality, translation, value for money, whether the Must Have was the right way to try the
// saga before committing to the omnibus.
//
// **It is not a Rating**, and this file could not make it one if it tried: `edition_note`
// has no column a score could go into, exactly as `rating` has no column a Volume could go
// into (ADR-0001). The two verbs are separate because the two judgements are separate — one
// decides what to buy, the other feeds recommendation, and neither is allowed to stand in
// for the other.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_VOLUME = "That Volume is not in the library.";

/**
 * Record what the owner thinks of the object, replacing what they thought before.
 *
 * **Replacing, unlike a Rating.** A second thought about a Story is a second Reading and
 * both judgements survive, because rereading is a second act; a second thought about an
 * object is simply the verdict now, because print quality does not happen twice.
 *
 * Changes nothing about any Story the Volume carries: this opinion never reaches
 * recommendation, and no query an assistant reads can see it.
 */
export async function writeEditionNote(volumeId: string, note: string): Promise<void> {
  if (!UUID.test(volumeId)) throw new Refusal("not-found", NO_VOLUME);

  await refusing(
    () =>
      query(
        `insert into edition_note (volume_id, note)
         values ($1, btrim($2))
         on conflict (volume_id) do update
            set note = excluded.note, written_at = now()`,
        [volumeId, note]
      ),
    (constraint) => {
      if (constraint === "edition_note_is_not_blank")
        return "An Edition note is written or absent, never blank.";
      if (constraint === "edition_note_volume_exists") return NO_VOLUME;
      return "That Edition note could not be written.";
    }
  );
}

/**
 * Take the note back: the owner no longer means it, or never meant to write it.
 *
 * Not refused where there is no note, because the state the caller asked for is the state
 * that follows — unlike releasing a Volume, where a second release would be a claim about
 * an object the owner has not had for years.
 */
export async function eraseEditionNote(volumeId: string): Promise<void> {
  if (!UUID.test(volumeId)) throw new Refusal("not-found", NO_VOLUME);

  await query("delete from edition_note where volume_id = $1", [volumeId]);
}
