import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import type { Executor } from "../transaction.ts";

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
  /**
   * The last **Instalment** this pass finished, where the Story declares any.
   *
   * Absent is the ordinary case, and it is the only possibility on a Story nobody has
   * numbered: an Instalment belongs to the narrative, so a pass can only stand at one where
   * the work says it has them (`CONTEXT.md`). It is on the pass rather than on the Story
   * because how far you got is a fact about an **event** — which is what makes half a run
   * read in singles and half in a deluxe line one number.
   */
  atInstalment?: number | null;
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
  if (constraint === "reading_at_instalment_is_positive") return NOT_AN_INSTALMENT;
  // The two the migration's trigger raises. A check constraint cannot read the Story, and
  // whether a pass may stand at instalment seven is a fact about the *work*.
  if (constraint === "reading_at_instalment_needs_a_serialized_story")
    return "That Story has no Instalments. Say how many it has before saying where you are in it.";
  if (constraint === "reading_at_instalment_is_within_the_work")
    return "That is past the end of this Story. A pass cannot get further than the work goes.";
  return "That Reading could not be recorded.";
}

/** The prose for an Instalment that is not one. */
const NOT_AN_INSTALMENT = "An Instalment is a whole part of the work, counted from one.";

// A Reading's id is generated, so nothing types one: a malformed id is the same event as an
// unknown one, and saying so here keeps it from reaching the driver as a syntax error on a
// uuid column.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_SUCH_READING = "That Reading is not in the library.";

/**
 * Record that the owner read — or is reading — a Story. Returns the Reading's id.
 *
 * Adds a Reading and changes nothing else. Recording a second one for the same Story
 * leaves the first exactly as it was, ratings included: that is the whole point of a
 * Reading being an event.
 *
 * `run` is how the one door calls this inside its own transaction (`what-happened.ts`): the
 * owner says *I bought it* once, and the object, the acquisition and the narrative land
 * together or not at all (see `../transaction.ts`).
 */
export async function recordReading(reading: NewReading, run: Executor = query): Promise<string> {
  const rows = await refusing(
    () =>
      run<{ id: string }>(
        `insert into reading
           (story_id, medium, outcome, started_on, ended_on, provenance_id, volume_id,
            at_instalment)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id`,
        [
          reading.storyId,
          reading.medium,
          reading.outcome ?? null,
          reading.startedOn ?? null,
          reading.endedOn ?? null,
          reading.provenanceId,
          reading.volumeId ?? null,
          reading.atInstalment ?? null,
        ]
      ),
    readingProse
  );

  const [recorded] = rows;
  if (!recorded) throw new Error("insert into reading returned no row");
  return recorded.id;
}

/**
 * Say where this pass has got to: the last **Instalment** it finished, or `null` where the
 * owner is no longer counting.
 *
 * **This is the whole of *seven of twenty*, and it is deliberately not a field on the
 * Story** (`CONTEXT.md`): how far you are is a fact about a pass, which is an event, so a
 * reread starts again at nothing without the first pass forgetting where it got. Nothing
 * else follows from it — a pass that has reached the last Instalment is still open, because
 * finishing is a separate act the owner performs.
 *
 * It writes over what this pass last said, unlike the outcome, and that is the point: *I am
 * at seven* replaces *I am at six* about the same reading, where reading it again is a
 * second Reading.
 *
 * Refused, by Postgres rather than by an `if`, on a Story that declares no Instalments and
 * on one past the end of the work.
 */
export async function recordInstalmentReached(
  readingId: string,
  atInstalment: number | null
): Promise<void> {
  if (!UUID.test(readingId)) throw new Refusal("not-found", NO_SUCH_READING);
  // A whole part or nothing: half of one would reach the driver as a syntax error on an
  // integer column rather than as prose the owner can read.
  if (atInstalment !== null && !Number.isInteger(atInstalment)) {
    throw new Refusal("invalid", NOT_AN_INSTALMENT);
  }

  const changed = await refusing(
    () =>
      query<{ id: string }>("update reading set at_instalment = $2 where id = $1 returning id", [
        readingId,
        atInstalment,
      ]),
    readingProse
  );

  if (changed.length === 0) throw new Refusal("not-found", NO_SUCH_READING);
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
