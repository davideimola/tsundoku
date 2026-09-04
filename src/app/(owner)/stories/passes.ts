import type { HowFarItGot, StoryPass, WhoseCountItIs } from "@/core/queries/story";
import type { CarriedStory, CoveredInstalments } from "@/core/queries/story-to-volume";

// HOW A PASS IS SAID, and the one predicate the acts on a Story's page hang off.
//
// The sibling of `./story-state.tsx`, one level down: that file says how a *Story* is said,
// this one says how one **pass through** it is. It is a file of its own for the reason that
// one is — the Story's page prints a stack of these and the words have to be one vocabulary —
// and it is a `.ts` rather than a `.tsx` because everything in it is data in, data out, which
// is what lets it be tested beside itself (`vitest.config.ts`).
//
// **The word is `Pass` and not `Reading`** (#58, ADR-0021): a pass is one pass through a
// Story, by whatever medium, and a videogame is a Story by the test that decides what one is.
// So nothing here says *reading* about the record, and the sentences it hands the screen say
// *under way* where they used to say *reading now*.
//
// **The predicate is the reason it exists.** A Pass that has started and not ended is what
// still under way means, it is what the dashboard's top band is, and — since #29 — it is what
// decides whether the Story's hero offers *start a Pass* or *close the one that is open*.
// Reading `outcome === null` in three places would be three chances to disagree about the one
// state this application is named around.

/** Whether this Pass has started and not ended, which is what leaves the Story open. */
export function stillOpen(pass: StoryPass): boolean {
  return pass.outcome === null;
}

/**
 * The Pass the owner is in the middle of, out of the whole stack, or nothing.
 *
 * Searched rather than taken off the top: the stack is newest first, but a second pass opened
 * today sits above one finished in 2021 only because of *when it started*, and a Pass with no
 * start date at all sorts last. What makes one open is its outcome.
 *
 * The Story's state agrees with whichever this finds: `STORY_STATE` reads the Story as open
 * when **any** Pass is unconcluded. Two open at once is possible in the model and vanishingly
 * odd in practice — the owner is not going through the same Story twice at the same time — so
 * the hero offers the first, and closing it offers the next. Neither is unreachable.
 */
export function theOpenPass(passes: readonly StoryPass[]): StoryPass | undefined {
  return passes.find(stillOpen);
}

/**
 * The medium and the outcome, in the words the owner uses.
 *
 * *Still under way* rather than *still reading* for the unconcluded one, because a pass
 * through a game is not read — and because *under way* is the phrase `CONTEXT.md` already
 * uses for a pass that has not ended.
 */
export function howItWent(pass: StoryPass): string {
  return `${pass.medium}, ${pass.outcome ?? "still under way"}`;
}

/**
 * When it happened, with whichever half of it is known.
 *
 * Both halves are routinely absent and neither is invented to complete a sentence: Goodreads
 * history often carries one date, and a Pass in progress has no end yet by definition.
 *
 * **The tense is the derivation.** An open Pass's start is *since*, because it is still
 * true; a settled one's is *from*, because it is over. Saying *from 2026-08-01* about a book
 * in the owner's hands would be the screen closing a Pass nobody closed.
 */
export function whenItHappened(pass: StoryPass): string {
  const open = stillOpen(pass);

  if (pass.startedOn && pass.endedOn) return `${pass.startedOn} → ${pass.endedOn}`;
  if (pass.startedOn) return `${open ? "since" : "from"} ${pass.startedOn}`;
  if (pass.endedOn) return `until ${pass.endedOn}`;
  return open ? "open, no date recorded" : "no date recorded";
}

/**
 * What the hero says about the Pass in the owner's hands.
 *
 * Its own sentence rather than `whenItHappened` in a paragraph, because the two are said in
 * different tenses about the same fact: the stack is a record of acts and prints a span, and
 * the hero is about *now*. A Pass opened with no day recorded is still open — the day was
 * never the fact — so it says so rather than printing an absence into the middle of a
 * sentence.
 *
 * *Under way* rather than *reading it*, and it is the same word `howItWent` settles on: the
 * hero stands over a game as often as over a manga now, and one of the two would have been
 * told it was being read.
 */
export function passNow(pass: StoryPass): string {
  return pass.startedOn ? `Under way since ${pass.startedOn}.` : "Under way now.";
}

/**
 * *Seven of twenty*, in the fewest words that are still a fraction.
 *
 * The screen's own wording rather than the core's, for the reason everything else in this
 * file is: the count and the pass are two facts the query hands over, and how they are said
 * to the owner is the page's. It is a fraction rather than a percentage because the units are
 * the work's own — *seven of twenty* is a place in a book, and *35%* is a progress bar.
 */
export function howFarItGot(far: HowFarItGot): string {
  return `${far.atInstalment} of ${far.instalments}`;
}

/**
 * What one Instalment of a work is called on screen, singular or plural.
 *
 * A count with no noun beside it reads as a volume count on a page full of objects, which is
 * the one thing an Instalment is not: it belongs to the narrative and never to a printing.
 */
export function instalments(howMany: number): string {
  return `${howMany} ${howMany === 1 ? "Instalment" : "Instalments"}`;
}

/**
 * The count and, where it is not the owner's own, whose it is: *20 Instalments · From the
 * line* (#34).
 *
 * Three words rather than a sentence, and they go in the mono eyebrow the page already sets
 * a Type and a state in. The relation between a printing's count and the narrative's is
 * argued in ADR-0017 and does not need arguing again on the card: what the owner wants to
 * know standing here is that this number is not one of theirs to keep, and where it comes
 * from when it moves.
 *
 * There is nothing to say where the count is the owner's word — a number they gave is a
 * number, and *from you* is the case that needs no label.
 */
export function theCountItDeclares(count: number, saidBy: WhoseCountItIs | null): string {
  return saidBy === "line" ? `${instalments(count)} · From the line` : instalments(count);
}

/**
 * What one object holds of a serialized work: *Instalment 7*, or *Instalments 1–35*.
 *
 * One part and a range are the same sentence at two sizes, and saying *Instalments 7–7* about
 * a tankōbon would be the screen reading a range off a single number. An en dash, because it
 * is a span rather than a subtraction.
 *
 * **Two screens spend it** — the spines on a Story's page and the list on a Volume's — which
 * is the same shape `wishes/shopping.ts` is in, and the reason it is one function: the object
 * says the same thing whichever end the owner is standing at.
 */
export function whatItCovers(covers: CoveredInstalments): string {
  return covers.from === covers.to
    ? `${INSTALMENT} ${covers.from}`
    : `${INSTALMENT}s ${covers.from}–${covers.to}`;
}

const INSTALMENT = "Instalment";

/**
 * What this object holds of the work, read back as a fact rather than out of a form: *It
 * holds Instalment 1 of 12*, or *Instalments 1–12 of 12*.
 *
 * **The record is on the page and the boxes are only the act**, which is the clause the
 * Edition note and a Path's intent already say on their own screens (#30, #31). Until this
 * existed the only place the range lived on a Volume's page was two input boxes, so the one
 * thing the section is for — seeing whether this object takes Instalment 1 or takes 1 to 12
 * — was something the owner had to read out of controls offering to change it.
 *
 * The absent case is a sentence too, and deliberately not a blank: an object that says
 * nothing about which parts it holds is a state, not a gap.
 */
export function whatThisObjectHolds(story: CarriedStory): string {
  if (!story.covers) {
    return `It doesn't say which of the ${story.instalments} Instalments it holds.`;
  }
  // One sentence and not two joined by the screen, so the dash and the full stop are decided
  // here with the words rather than by whoever renders them.
  return `It holds ${whatItCovers(story.covers)} of ${story.instalments} — ${whoSaidTheRange(story.covers)}.`;
}

/**
 * Where that answer came from: the owner's own hand, or the object's place in its line.
 *
 * It is a clause of its own because it is a second fact and not a shade of the first. *1 to
 * 12 because I said so* and *1 to 12 because that is where this object stands* are two
 * different things to know about a shelf, and the one the owner is checking when a range
 * looks wrong is this one.
 */
export function whoSaidTheRange(covers: CoveredInstalments): string {
  return covers.written ? "you wrote it" : "from its place in the line";
}

/**
 * The sentence under the boxes on a Volume's page: what emptying them would do.
 *
 * **Four cases, and the fourth is the one this used to get wrong.** It read `covers` and
 * nothing else, so an object with a written range was always told *empty both to follow this
 * object's place in its line again* — including an object that stands in no line, where
 * emptying them leaves it saying nothing at all. Production had exactly that object on it:
 * an All-Star Superman special edition, in no Series, offered a line to fall back to that
 * does not exist.
 *
 * So it takes the one fact it was missing. `inALine` is the Volume's, off `seriesNumber`,
 * because whether there is a line to follow is a fact about the **object** and never about
 * the link — which is why it is an argument here rather than something read off the Story.
 */
export function howTheRangeIsKept(story: CarriedStory, inALine: boolean): string {
  if (story.covers?.written) {
    return inALine
      ? "Empty both to follow this object's place in its line again."
      : "This object stands in no line, so emptying both leaves it saying nothing about which parts it holds.";
  }
  if (story.covers) {
    return "Empty, so it follows this object's place in its line. Type here to say otherwise.";
  }
  return `Of ${story.instalments}. Empty until you say so, and this object stands in no line to follow.`;
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
