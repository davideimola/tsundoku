import type { StoryNothingHasHappenedTo } from "@/core/queries/story";

// **What a strike takes with it, in words** — the Story wall's own derivation for its second
// drawer, beside the page because it is the page's (`AGENTS.md`), and tested beside itself
// under the licence `vitest.config.ts` states: data in, data out, a function this application
// would still have if React were replaced.
//
// It is a file rather than three lines inside `page.tsx` because of what it is for. A bulk
// destructive control has to say what it is about to destroy **while the owner is still
// ticking** — that is ADR-0014's rule about the count, one row down — and *what else goes* is
// the half a count cannot say. Two records follow a struck Story out: the Credits on it, and
// the note that some catalogued object carried it. Neither is the owner's own life, which is
// why striking is allowed at all; both are rows that disappear, which is why they are named
// before the press rather than missed a week later.
//
// **The sentence about the Credits is the one worth the test.** A Credit mints its Person and
// does not own them (ADR-0012): striking the duplicate *Slam Dunk 5* takes its attribution of
// Takehiko Inoue and leaves Takehiko Inoue exactly where he is, credited on everything else.
// An owner who read *2 Credits go with it* and understood *two people are deleted* would untick
// the row and keep the wall wrong, so the clause saying the people stay is part of the fact
// rather than reassurance added to it.

/**
 * What follows one of these out of the library, said in the row it is about.
 *
 * A Story in this list has nothing of the owner's on it by construction — no Pass, no
 * score, no Path, nothing in the house carrying it (`listStoriesNothingHasHappenedTo`) — so
 * this never has to say *and your Passes*: that Story is not here to be ticked.
 *
 * **Nothing at all is an answer and gets a sentence**, rather than an empty line where the
 * other rows have prose: a blank there reads as a row that failed to load its own detail, and
 * a bare record with nothing hanging off it is exactly the shape a hallucinated proposal
 * arrives in.
 */
export function whatGoesWithIt(story: StoryNothingHasHappenedTo): string {
  const said = [theCredits(story.credits), theCarriers(story.carriedBy)].filter(Boolean);

  return said.length === 0 ? "Nothing else points at it." : said.join(" ");
}

/**
 * The Credits, and the half of the sentence that says the people are not in it.
 *
 * *Goes* and *go* rather than a count with a plural bolted on: the row is read at a glance and
 * a sentence that says *1 Credits* is a screen nobody proofread.
 */
function theCredits(credits: number): string {
  if (credits === 0) return "";
  if (credits === 1) return "1 Credit goes with it, and the person stays.";

  return `${credits} Credits go with it, and the people stay.`;
}

/**
 * The objects that carried it, and **why they are named as objects the house does not hold**.
 *
 * Every carrier of a Story in this list is one the Collection does not claim — an object in
 * the house would have refused the strike outright — so the clause is not a caveat, it is the
 * reason the row is strikeable at all. Saying *carried by 1 object* and stopping would leave
 * the owner wondering whether something on their shelf is about to lose a narrative.
 */
function theCarriers(carriedBy: number): string {
  if (carriedBy === 0) return "";
  if (carriedBy === 1) return "1 object the house does not hold carries it.";

  return `${carriedBy} objects the house does not hold carry it.`;
}
