import type { StoryReading } from "@/core/queries/story";

// HOW A READING IS SAID, and the one predicate the acts on a Story's page hang off.
//
// The sibling of `./story-state.tsx`, one level down: that file says how a *Story* is said,
// this one says how an **act of reading** is. It is a file of its own for the reason that one
// is — the Story's page prints a stack of these and the words have to be one vocabulary — and
// it is a `.ts` rather than a `.tsx` because everything in it is data in, data out, which is
// what lets it be tested beside itself (`vitest.config.ts`).
//
// **The predicate is the reason it exists.** A Reading that has started and not ended is what
// `reading` means, it is what the dashboard's top band is, and — since #29 — it is what
// decides whether the Story's hero offers *start a Reading* or *close the one that is open*.
// Reading `outcome === null` in three places would be three chances to disagree about the one
// state this application is named around.

/** Whether this Reading has started and not ended, which is what makes a Story `reading`. */
export function stillOpen(reading: StoryReading): boolean {
  return reading.outcome === null;
}

/**
 * The Reading the owner is in the middle of, out of the whole stack, or nothing.
 *
 * Searched rather than taken off the top: the stack is newest first, but a reread opened
 * today sits above a Reading finished in 2021 only because of *when it started*, and a
 * Reading with no start date at all sorts last. What makes one open is its outcome.
 *
 * The Story's state agrees with whichever this finds: `STORY_STATE` reads `reading` when
 * **any** Reading is unconcluded. Two open at once is possible in the model and vanishingly
 * odd in practice — the owner is not reading the same Story twice at the same time — so the
 * hero offers the first, and closing it offers the next. Neither is unreachable.
 */
export function theOpenReading(readings: readonly StoryReading[]): StoryReading | undefined {
  return readings.find(stillOpen);
}

/** The medium and the outcome, in the words the owner uses. */
export function howItWent(reading: StoryReading): string {
  return `${reading.medium}, ${reading.outcome ?? "still reading"}`;
}

/**
 * When it happened, with whichever half of it is known.
 *
 * Both halves are routinely absent and neither is invented to complete a sentence: Goodreads
 * history often carries one date, and a Reading in progress has no end yet by definition.
 *
 * **The tense is the derivation.** An open Reading's start is *since*, because it is still
 * true; a settled one's is *from*, because it is over. Saying *from 2026-08-01* about a book
 * in the owner's hands would be the screen closing a Reading nobody closed.
 */
export function whenItHappened(reading: StoryReading): string {
  const open = stillOpen(reading);

  if (reading.startedOn && reading.endedOn) return `${reading.startedOn} → ${reading.endedOn}`;
  if (reading.startedOn) return `${open ? "since" : "from"} ${reading.startedOn}`;
  if (reading.endedOn) return `until ${reading.endedOn}`;
  return open ? "open, no date recorded" : "no date recorded";
}

/**
 * What the hero says about the Reading in the owner's hands.
 *
 * Its own sentence rather than `whenItHappened` in a paragraph, because the two are said in
 * different tenses about the same fact: the stack is a record of acts and prints a span, and
 * the hero is about *now*. A Reading opened with no day recorded is still open — the day was
 * never the fact — so it says so rather than printing an absence into the middle of a
 * sentence.
 */
export function readingNow(reading: StoryReading): string {
  return reading.startedOn ? `Reading it since ${reading.startedOn}.` : "Reading it now.";
}

/**
 * The scale a score is given on, as the picker offers it: 1 to 10 in half points.
 *
 * **Offered rather than typed**, and that is a decision about a phone. The owner's keyboard
 * gives a comma where this scale wants a dot — the reason `src/core/money.ts` exists at all —
 * and a score is the one value in this library nobody would want guessed at (`rating_set`
 * says the same thing to an assistant). Nineteen values are a picker; they are not a
 * vocabulary the model holds, so the verb still refuses anything off the scale in its own
 * prose rather than trusting this list.
 */
export const SCORES: readonly number[] = Array.from({ length: 19 }, (_, step) => 1 + step / 2);
