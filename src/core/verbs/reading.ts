import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";

// Writing a Reading: one act of reading a Story — when, by what medium, how it ended and
// how it is known.
//
// Three things this file deliberately does not do:
//
//   - **It never overwrites.** Rereading is a real intention the owner already records,
//     so a second Reading of the same Story is an insert like the first, and the Rating
//     the first carried survives beside the second (CONTEXT.md).
//   - **It presumes no Volume.** A Reading with no Volume at all is the ordinary case here
//     rather than a degenerate one — read digitally, borrowed, or known only from Goodreads
//     history — and the object is optional precisely because being read and being owned are
//     unrelated facts (ADR-0001).
//   - **It writes no state onto the Story.** To read / reading / read / abandoned is
//     derived from these rows by `queries/story.ts` and stored nowhere.

/** Paper or digital. Not a vocabulary that grows — see the migration for why. */
export type Medium = "paper" | "digital";

/** How a Reading ended. `null` while it is still being read. */
export type Outcome = "finished" | "abandoned";

/** What recording a Reading needs. Everything optional is genuinely often absent. */
export type NewReading = {
  storyId: string;
  medium: Medium;
  /** A Provenance's slug — how far this Reading can be trusted. */
  provenanceId: string;
  /** `YYYY-MM-DD`. Absent where the owner only knows that it happened. */
  startedOn?: string | null;
  /** `YYYY-MM-DD`. Only meaningful once the Reading has concluded. */
  endedOn?: string | null;
  /** Absent for a Reading in progress, which is what makes the Story `reading`. */
  outcome?: Outcome | null;
  /**
   * The Volume this reading went through, where there was one. Absent is the ordinary
   * case, and it is the only possibility on digital: an owned ebook is not a thing this
   * model has, so a digital Reading went through no object (`CONTEXT.md`).
   */
  volumeId?: string | null;
};

function readingProse(constraint: string | undefined): string {
  if (constraint === "reading_medium_is_paper_or_digital")
    return "A Reading is on paper or digital, and nothing else.";
  if (constraint === "reading_story_exists") return "That Story is not in the library yet.";
  if (constraint === "reading_provenance_exists")
    return "That is not a Provenance this library knows.";
  if (constraint === "reading_did_not_end_before_it_started")
    return "A Reading cannot end before it started.";
  if (constraint === "reading_unconcluded_has_not_ended")
    return "A Reading that has not ended has no end date.";
  if (constraint === "reading_outcome_is_finished_or_abandoned")
    return "A Reading ends finished or abandoned.";
  if (constraint === "reading_volume_exists") return "That Volume is not in the library.";
  if (constraint === "reading_digital_went_through_no_volume")
    return "A Reading on digital went through no Volume: an owned ebook is not a thing here.";
  return "That Reading could not be recorded.";
}

/**
 * Record that the owner read — or is reading — a Story. Returns the Reading's id.
 *
 * Adds a Reading and changes nothing else. Recording a second one for the same Story
 * leaves the first exactly as it was, ratings included: that is the whole point of a
 * Reading being an event.
 */
export async function recordReading(reading: NewReading): Promise<string> {
  const rows = await refusing(
    () =>
      query<{ id: string }>(
        `insert into reading
           (story_id, medium, outcome, started_on, ended_on, provenance_id, volume_id)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id`,
        [
          reading.storyId,
          reading.medium,
          reading.outcome ?? null,
          reading.startedOn ?? null,
          reading.endedOn ?? null,
          reading.provenanceId,
          reading.volumeId ?? null,
        ]
      ),
    readingProse
  );

  const [recorded] = rows;
  if (!recorded) throw new Error("insert into reading returned no row");
  return recorded.id;
}

/**
 * Close a Reading with an outcome, which is what moves the Story off `reading`.
 *
 * One statement, so one transaction: the count of what was there and the count of what
 * changed come back together, and the two answers cannot be read from different
 * moments.
 */
async function concludeReading(
  readingId: string,
  outcome: Outcome,
  endedOn: string | null
): Promise<void> {
  const rows = await refusing(
    () =>
      query<{ found: string; concluded: string }>(
        `with concluded as (
           update reading
              set outcome = $2, ended_on = coalesce($3::date, ended_on)
            where id = $1 and outcome is null
           returning id
         )
         select (select count(*) from reading where id = $1) as found,
                (select count(*) from concluded)             as concluded`,
        [readingId, outcome, endedOn]
      ),
    readingProse
  );

  const [counts] = rows;
  if (!counts) throw new Error("concluding a reading returned no row");
  if (counts.found === "0") {
    throw new Refusal("not-found", "That Reading is not in the library.");
  }
  if (counts.concluded === "0") {
    // A Reading is never overwritten, so the answer to "it ended differently" is
    // another Reading rather than an edit of this one.
    throw new Refusal(
      "not-allowed",
      "That Reading has already ended. Reading it again is a new Reading."
    );
  }
}

/**
 * The owner finished it. Refused on a Reading that has already ended — that is a new
 * Reading, not a correction of this one.
 */
export async function finishReading(
  readingId: string,
  endedOn: string | null = null
): Promise<void> {
  await concludeReading(readingId, "finished", endedOn);
}

/**
 * The owner gave up on it. Abandoning is as much a fact as finishing, and the Story
 * reads `abandoned` unless something else was finished.
 */
export async function abandonReading(
  readingId: string,
  endedOn: string | null = null
): Promise<void> {
  await concludeReading(readingId, "abandoned", endedOn);
}
