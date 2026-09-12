import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import type { Executor } from "../transaction.ts";

// Writing a Pass: one act of going through a Story — when, by what medium, how it ended and
// how it is known.
//
// Three things this file deliberately does not do:
//
//   - **It never overwrites.** Rereading is a real intention the owner already records,
//     so a second Pass through the same Story is an insert like the first, and the Rating
//     the first carried survives beside the second (CONTEXT.md).
//   - **It presumes no Volume.** A Pass with no Volume at all is the ordinary case here
//     rather than a degenerate one — read digitally, borrowed, or known only from Goodreads
//     history — and the object is optional precisely because being read and being owned are
//     unrelated facts (ADR-0001).
//   - **It writes no state onto the Story.** To read / reading / read / abandoned is
//     derived from these rows by `queries/story.ts` and stored nowhere.

/**
 * A medium's slug: what a pass went through the Story by — `paper`, `digital`, or the console
 * it was played on.
 *
 * **No union of string literals**, for the reason `Type` and `Binding` have none (ADR-0006,
 * ADR-0022): a medium is a data row, so a console released next year is an insert and a type
 * that enumerated today's two would quietly make it a release. What the library knows is
 * `listMedia` in `../queries/medium.ts`, and what refuses one it does not is Postgres.
 */
export type Medium = string;

/** How a Pass ended. `null` while it is still under way. */
export type Outcome = "finished" | "abandoned";

/** What recording a Pass needs. Everything optional is genuinely often absent. */
export type NewPass = {
  storyId: string;
  medium: Medium;
  /** A Provenance's slug — how far this Pass can be trusted. */
  provenanceId: string;
  /** `YYYY-MM-DD`. Absent where the owner only knows that it happened. */
  startedOn?: string | null;
  /** `YYYY-MM-DD`. Only meaningful once the Pass has concluded. */
  endedOn?: string | null;
  /** Absent for a Pass in progress, which is what makes the Story `reading`. */
  outcome?: Outcome | null;
  /**
   * The Volume this pass went through, where there was one. Absent is the ordinary
   * case, and it is refused outright by every medium that does not go through an object:
   * an owned ebook is not a thing this model has, and a console is not an object the library
   * catalogues either, so only a medium carrying `goesThroughAnObject` may name a Volume
   * (`CONTEXT.md`, ADR-0022).
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

function passProse(constraint: string | undefined): string {
  if (constraint === "pass_medium_exists") return "That is not a medium this library knows.";
  if (constraint === "pass_story_exists") return "That Story is not in the library yet.";
  if (constraint === "pass_provenance_exists")
    return "That is not a Provenance this library knows.";
  if (constraint === "pass_did_not_end_before_it_started")
    return "A Pass cannot end before it started.";
  if (constraint === "pass_unconcluded_has_not_ended")
    return "A Pass that has not ended has no end date.";
  if (constraint === "pass_outcome_is_finished_or_abandoned")
    return "A Pass ends finished or abandoned.";
  if (constraint === "pass_volume_exists") return "That Volume is not in the library.";
  // **Which fact is in the way**, and it is a fact about the medium rather than about
  // paper: the flag on the vocabulary row is what refused, so that is what the sentence
  // names (ADR-0022). It reads the same for a console as it does for digital.
  if (constraint === "pass_through_an_object_went_by_a_medium_that_can")
    return "That medium does not go through an object, so a Pass by it went through no Volume.";
  if (constraint === "pass_at_instalment_is_positive") return NOT_AN_INSTALMENT;
  // The two the migration's trigger raises. A check constraint cannot read the Story, and
  // whether a pass may stand at instalment seven is a fact about the *work*.
  if (constraint === "pass_at_instalment_needs_a_serialized_story")
    return "That Story has no Instalments. Say how many it has before saying where you are in it.";
  if (constraint === "pass_at_instalment_is_within_the_work")
    return "That is past the end of this Story. A pass cannot get further than the work goes.";
  return "That Pass could not be recorded.";
}

/** The prose for an Instalment that is not one. */
const NOT_AN_INSTALMENT = "An Instalment is a whole part of the work, counted from one.";

// A Pass's id is generated, so nothing types one: a malformed id is the same event as an
// unknown one, and saying so here keeps it from reaching the driver as a syntax error on a
// uuid column.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_SUCH_PASS = "That Pass is not in the library.";

/**
 * **Finishing is reaching the end** (ADR-0024), said in the three places the rule is felt.
 *
 * The prose is here and the *gate* is in each door's own statement, which is the one piece of
 * duplication in this file that earns itself: the doors know the fraction at different moments
 * — `concludePass` reads it off the row it is about to update, `recordPass` is holding values
 * that are not in the database yet — and a shared predicate would have to be given both shapes
 * anyway. What they must never disagree about is the **sentence**, since that is what the owner
 * and an assistant act on, so the sentence has exactly one author.
 */
function shortOfTheEnd(atInstalment: number, instalments: number): Refusal {
  return new Refusal(
    "not-allowed",
    `That pass is at ${atInstalment} of ${instalments}. Finishing is reaching the end, so move it on to ${instalments} — or give it up, which is what stopping short is.`
  );
}

/** The same rule from the other side: a pass that has *already* finished cannot step back. */
function finishedShortOfTheEnd(atInstalment: number, instalments: number): Refusal {
  return new Refusal(
    "not-allowed",
    `That pass is finished, so it cannot be at ${atInstalment} of ${instalments}: finishing is reaching the end. Say it never ended first, or give it up.`
  );
}

/**
 * Record that the owner went through — or is going through — a Story. Returns the Pass's id.
 *
 * Adds a Pass and changes nothing else. Recording a second one for the same Story
 * leaves the first exactly as it was, ratings included: that is the whole point of a
 * Pass being an event.
 *
 * `run` is how the one door runs this inside its own transaction (`what-happened.ts`, and
 * `../transaction.ts` for why a verb takes one at all).
 */
export async function recordPass(pass: NewPass, run: Executor = query): Promise<string> {
  // **Finishing is reaching the end on the way in too** (ADR-0024), or the rule would hold on
  // `finishPass` and not on the one statement that can write an outcome and a fraction
  // together — which is how the row that forced the ADR was written in the first place.
  //
  // Read through `run` rather than `query`, so the door's own transaction is what answers:
  // a Story created and passed through in one breath is not yet visible outside it. A Story
  // that comes back with nothing is left to the insert, whose foreign key says *that Story is
  // not in the library* in prose the owner reads.
  // A malformed Story id skips the read rather than crossing the driver as a syntax error:
  // the insert is what refuses it, as it always was.
  if (pass.outcome === "finished" && pass.atInstalment != null && UUID.test(pass.storyId)) {
    const [serialized] = await run<{ instalments: number | null }>(
      "select instalments from story where id = $1",
      [pass.storyId]
    );

    if (
      serialized?.instalments != null &&
      Number.isInteger(pass.atInstalment) &&
      pass.atInstalment < serialized.instalments
    ) {
      throw shortOfTheEnd(pass.atInstalment, serialized.instalments);
    }
  }

  const rows = await refusing(
    () =>
      run<{ id: string }>(
        `insert into pass
           (story_id, medium, outcome, started_on, ended_on, provenance_id, volume_id,
            at_instalment)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id`,
        [
          pass.storyId,
          pass.medium,
          pass.outcome ?? null,
          pass.startedOn ?? null,
          pass.endedOn ?? null,
          pass.provenanceId,
          pass.volumeId ?? null,
          pass.atInstalment ?? null,
        ]
      ),
    passProse
  );

  const [recorded] = rows;
  if (!recorded) throw new Error("insert into pass returned no row");
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
 * at seven* replaces *I am at six* about the same pass, where going through it again is a
 * second Pass.
 *
 * Refused, by Postgres rather than by an `if`, on a Story that declares no Instalments and
 * on one past the end of the work.
 */
export async function recordInstalmentReached(
  passId: string,
  atInstalment: number | null
): Promise<void> {
  if (!UUID.test(passId)) throw new Refusal("not-found", NO_SUCH_PASS);
  // A whole part or nothing: half of one would reach the driver as a syntax error on an
  // integer column rather than as prose the owner can read.
  if (atInstalment !== null && !Number.isInteger(atInstalment)) {
    throw new Refusal("invalid", NOT_AN_INSTALMENT);
  }

  const rows = await refusing(
    () =>
      query<{ found: string; moved: string; instalments: number | null }>(
        `with standing as (
           select r.outcome, s.instalments
             from pass r
             join story s on s.id = r.story_id
            where r.id = $1
         ),
         moved as (
           update pass
              set at_instalment = $2
            where id = $1
              -- **A finished pass cannot step back short of the end** (ADR-0024), which is
              -- this rule's third door: the two that write an outcome are held to it, and
              -- without this one *finished, not counting* — the shape the one door records —
              -- could be walked to *1 of 12* with one press. Abandoning short is untouched,
              -- because that is what giving up is, and stopping the count altogether stays
              -- open to every pass.
              and (coalesce((select outcome from standing), '') <> 'finished'
                   or $2::integer is null
                   or (select instalments from standing) is null
                   or $2::integer >= (select instalments from standing))
           returning id
         )
         select (select count(*) from pass where id = $1) as found,
                (select count(*) from moved)              as moved,
                (select instalments from standing)        as instalments`,
        [passId, atInstalment]
      ),
    passProse
  );

  const [counts] = rows;
  if (!counts) throw new Error("moving a pass on returned no row");
  if (counts.found === "0") throw new Refusal("not-found", NO_SUCH_PASS);
  if (counts.moved === "0") {
    if (atInstalment === null || counts.instalments === null) {
      throw new Error("a pass was neither moved on nor refused");
    }
    throw finishedShortOfTheEnd(atInstalment, counts.instalments);
  }
}

/**
 * Close a Pass with an outcome, which is what moves the Story off `reading`.
 *
 * One statement, so one transaction: the count of what was there and the count of what
 * changed come back together, and the two answers cannot be read from different
 * moments.
 */
async function concludePass(
  passId: string,
  outcome: Outcome,
  endedOn: string | null
): Promise<void> {
  const rows = await refusing(
    () =>
      query<{
        found: string;
        concluded: string;
        outcome: Outcome | null;
        atInstalment: number | null;
        instalments: number | null;
      }>(
        `with standing as (
           select r.outcome, r.at_instalment, s.instalments
             from pass r
             join story s on s.id = r.story_id
            where r.id = $1
         ),
         concluded as (
           update pass
              set outcome = $2, ended_on = coalesce($3::date, ended_on)
            where id = $1
              and outcome is null
              -- **Finishing is reaching the end** (ADR-0024), and the gate is inside the
              -- statement that concludes rather than in a read before it: a pass moved on
              -- between the two would be finished under a rule that had already answered.
              -- Only a pass that *says* where it got to is held to it, and only finishing —
              -- stopping short is exactly what giving up is.
              and ($2 <> 'finished'
                   or at_instalment is null
                   or (select instalments from standing) is null
                   or at_instalment >= (select instalments from standing))
           returning id
         )
         select (select count(*) from pass where id = $1) as found,
                (select count(*) from concluded)          as concluded,
                (select outcome from standing)            as outcome,
                (select at_instalment from standing)      as "atInstalment",
                (select instalments from standing)        as instalments`,
        [passId, outcome, endedOn]
      ),
    passProse
  );

  const [counts] = rows;
  if (!counts) throw new Error("concluding a pass returned no row");
  if (counts.found === "0") {
    throw new Refusal("not-found", "That Pass is not in the library.");
  }
  if (counts.concluded === "0") {
    // A Pass is never overwritten, so the answer to "it ended differently" is
    // another Pass rather than an edit of this one. It is read first because it is the truer
    // sentence about a pass that has already ended, whichever else was also true of it.
    if (counts.outcome !== null) {
      throw new Refusal(
        "not-allowed",
        "That Pass has already ended. Going through it again is a new Pass."
      );
    }
    // Then the only other gate in the statement, and the numbers come back out of it rather
    // than being read again: the sentence has to name the fraction the statement refused on.
    if (counts.atInstalment !== null && counts.instalments !== null) {
      throw shortOfTheEnd(counts.atInstalment, counts.instalments);
    }
    throw new Error("a pass was neither concluded nor refused");
  }
}

/**
 * The owner finished it. Refused on a Pass that has already ended — that is a new
 * Pass, not a correction of this one.
 *
 * **And refused on a pass that says it is short of the end** (ADR-0024): `read` at *one of
 * twelve* is the state this library spent a release telling an external reader, because the
 * outcome was written without ever looking at the fraction standing beside it. Only a pass
 * that *says* where it got to is held to this — a null is the owner not counting, which is
 * the ordinary pass and the one the one door records — and the two answers are the two acts
 * that were always there: move it on to the last Instalment, or give it up.
 *
 * It is the complement of the rule `recordInstalmentReached` states rather than a new one:
 * reaching the last Instalment does not finish a pass, because finishing is a separate act —
 * and now not reaching it does not finish one either.
 */
export async function finishPass(passId: string, endedOn: string | null = null): Promise<void> {
  await concludePass(passId, "finished", endedOn);
}

/**
 * The owner gave up on it. Abandoning is as much a fact as finishing, and the Story
 * reads `abandoned` unless something else was finished.
 */
export async function abandonPass(passId: string, endedOn: string | null = null): Promise<void> {
  await concludePass(passId, "abandoned", endedOn);
}

// STRIKING A PASS, which is the door ADR-0018 opens and the one this file was missing.
//
// **A pass is an event and an event is never edited** — that rule is the whole shape of this
// module and it does not move. What it never covered is a row that records an event that did
// not happen: the owner presses *Start reading it* on the wrong tile in a shop, and the Story
// reads `reading` for ever. The two exits were *Finished* and *Gave up*, and both are false
// statements about a book nobody opened; striking the Story is refused the moment a Pass
// exists (`WHY_A_STORY_STANDS`), so there was no way back at all.
//
// This is ADR-0014's boundary applied where it had not been: **the question is not "is this a
// delete?" but "did anything happen to this record?"**. A pass with a judgement on it is
// something the owner lived with. A pass with nothing on it asserts an event that never
// occurred, and leaving it is what makes the library wrong.

/**
 * **Why a Pass stands**, in the one branch there is and the prose the owner reads.
 *
 * A Rating is the only record that can point at a pass, and the schema already has an opinion
 * about what a delete would do to it: `rating_belongs_to_the_story_passed_through` is `on delete set
 * null (pass_id)`, so striking a rated pass would leave the judgement standing and quietly
 * turn *what I thought of that pass* into *what I think of the narrative*. That is a
 * different sentence, written by nobody. So it is refused, and the owner unmakes the judgement
 * first — `strikeRating` in `./rating.ts` is the other half of this door, and exists because a
 * refusal with no way to satisfy it is the dead end this whole ADR is about.
 *
 * It names the Pass `r`, so a `case` spending it joins `pass r`.
 */
export const WHY_A_PASS_STANDS = `
  case
    when exists (select 1 from rating g where g.pass_id = r.id)
      then 'you judged that pass. Strike the score first — a judgement of a pass is not a judgement of the narrative, and this is the one act that could quietly make it one.'
  end`;

/**
 * Strike a Pass: the library stops knowing that the owner ever opened the Story.
 *
 * Returns the Story it was a pass through, read off the deleted row rather than carried
 * through the form, for `strikePath`'s reason: the screen that has to say what happened may
 * not be told by the browser what it just did. The state on the way out is derived again from
 * whatever Passes are left, like everywhere else — there is no field to put back.
 *
 * **One at a time, and never in bulk.** The Inbox's back doors are bulk because their mess
 * arrives forty at a time (ADR-0011, ADR-0015); a mis-tap arrives alone, and a ticked list of
 * the owner's own history of passes is a worse thing to have in front of you than a button on
 * the row you are looking at.
 *
 * **The owner's act and never the assistant's**, for the reason every strike is: the party
 * that can record a pass through the MCP door is exactly the party that must not be able to
 * delete one to tidy up after itself (ADR-0005, and ADR-0014 said it first).
 */
export async function strikePass(passId: string): Promise<string> {
  if (!UUID.test(passId)) throw new Refusal("not-found", NO_SUCH_PASS);

  const [standing] = await query<{ because: string | null }>(
    `select ${WHY_A_PASS_STANDS} as because from pass r where r.id = $1`,
    [passId]
  );

  if (!standing) throw new Refusal("not-found", NO_SUCH_PASS);
  if (standing.because !== null) {
    throw new Refusal("not-allowed", `That Pass stays: ${standing.because}`);
  }

  const struck = await query<{ storyId: string }>(
    `delete from pass where id = $1 returning story_id as "storyId"`,
    [passId]
  );

  const [gone] = struck;
  if (!gone) throw new Refusal("not-found", NO_SUCH_PASS);

  return gone.storyId;
}

/**
 * Strike a Pass's **outcome**: the library stops knowing that this pass ever ended.
 *
 * The pass stays, and so does everything hanging off it — its Provenance, the Volume it went
 * through, the Instalment it reached and the judgement the owner wrote. Only *finished* or
 * *abandoned* goes, with the day it ended beside it, because an unconcluded pass that ended on
 * a date is a state `pass_unconcluded_has_not_ended` does not allow.
 *
 * **This is ADR-0018 one field in** (and ADR-0024 states it): a pass that happened is
 * permanent and a pass that never happened is struck, and the same sentence is true of an
 * ending. The import door could only ever say *I read it*, so every run it typed in from the
 * shelf arrived `finished` — and a run stopped at its first Instalment read `read` to every
 * assistant that asked.
 *
 * **Nothing refuses it**, which is `strikeRating`'s answer rather than `strikePass`'s four.
 * The refusal that guards a strike of the whole pass exists because deleting a rated one would
 * leave the judgement pointing at nothing and quietly turn *what I thought of that pass* into
 * *what I think of the narrative*. Here the pass and the judgement both stay exactly where
 * they were and go on meaning what they meant, so there is nothing to clear first — which is
 * the whole reason this door exists rather than *strike it and record it again*.
 *
 * Returns the Story it was a pass through, off the row rather than out of the form, for
 * `strikePass`'s reason: the screen that has to say what happened may not be told by the
 * browser what it just did.
 *
 * **The owner's act and never the assistant's**, like every strike (ADR-0005, ADR-0014): the
 * party that can record a pass through the MCP door is exactly the party that must not be able
 * to unsay how one ended.
 */
export async function strikeOutcome(passId: string): Promise<string> {
  if (!UUID.test(passId)) throw new Refusal("not-found", NO_SUCH_PASS);

  // One statement, so the count of what was there and the count of what changed come back
  // together and cannot be read from different moments — `concludePass`'s own shape, and for
  // its reason: *no such pass* and *it never ended* are two different sentences.
  const rows = await query<{ found: string; struck: string; storyId: string | null }>(
    `with struck as (
       update pass
          set outcome = null, ended_on = null
        where id = $1 and outcome is not null
       returning id, story_id
     )
     select (select count(*) from pass where id = $1) as found,
            (select count(*) from struck)             as struck,
            (select story_id from struck)             as "storyId"`,
    [passId]
  );

  const [counts] = rows;
  if (!counts) throw new Error("striking an outcome returned no row");
  if (counts.found === "0") throw new Refusal("not-found", NO_SUCH_PASS);
  if (counts.struck === "0") {
    throw new Refusal("not-allowed", "That Pass has not ended, so there is no outcome to strike.");
  }
  if (!counts.storyId) throw new Error("striking an outcome returned no Story");

  return counts.storyId;
}
