import type { CoverStanding } from "@/core/queries/cover";

// WHAT THE LOOKUP FOUND, said in the owner's words — the Collection's own derivation, and
// a file rather than a lump inside `page.tsx` so it can be tested beside itself (#32).
//
// Data in, data out: numbers in, sentences out, and it would still be here if React were
// replaced. It holds **the screen's words and no rule the core owns** — which objects a run
// draws from, how many, and what an absence means are `src/core/verbs/cover.ts`'s, read from
// the report it hands back.
//
// **Why the report needs prose at all.** A cover lookup is the one act in this application
// whose result is genuinely five-way: found, the source has none, the source could not be
// asked, a broken one repaired, and an object no source will ever answer for. A single
// number — *31 covers* — would let the owner press the button for ever wondering why 96
// never becomes 96, when the answer is that 40 of those objects have no ISBN and never will.
// So each number gets a clause, and the clauses that are zero are simply not said.

/**
 * What one run of the lookup did, as the redirect carried it back — every number
 * `CoverLookupReport` answered with, as the strings a URL holds.
 *
 * It restates the verb's type rather than importing it because these arrive as text and are
 * read against a vocabulary; what it may not do is restate *part* of it. Each of these is an
 * object the run touched, and they are disjoint, so a run's clauses add up to the work it did.
 */
export type CoverReport = {
  found: number;
  refreshed: number;
  absent: number;
  unanswered: number;
  checked: number;
  skipped: number;
  stillDue: number;
};

const COUNTS = [
  "found",
  "refreshed",
  "absent",
  "unanswered",
  "checked",
  "skipped",
  "stillDue",
] as const satisfies readonly (keyof CoverReport)[];

/**
 * The report the redirect carried back, or `null` where the page was not arrived at from a
 * run.
 *
 * **All six or none.** A hand-edited `?found=3` is not a report, and half a report would be
 * a sentence with the reassuring clauses in it and the awkward ones missing.
 */
export function readCoverReport(asked: (name: string) => string | undefined): CoverReport | null {
  const read: Partial<CoverReport> = {};

  for (const count of COUNTS) {
    const value = Number(asked(count));
    if (!Number.isInteger(value) || value < 0) return null;
    read[count] = value;
  }

  return read as CoverReport;
}

/**
 * What the run did, as clauses to be read in order. Empty where it did nothing at all —
 * which happens, and is its own sentence on the screen rather than a silence.
 *
 * The order is what the owner cares about first: what arrived, what was repaired, what is
 * genuinely absent, what was confirmed still there, what could not be asked, and what is
 * left. **They are disjoint**, because the verb counts each object it touched exactly once —
 * so the clauses can be read as a sum rather than as five overlapping views of one run.
 */
export function whatTheLookupFound(report: CoverReport): string[] {
  const said: string[] = [];

  if (report.found > 0) said.push(`${report.found} ${covers(report.found)} found`);
  if (report.refreshed > 0) {
    said.push(
      `${report.refreshed} that had gone ${report.refreshed === 1 ? "was" : "were"} replaced`
    );
  }
  if (report.absent > 0) said.push(`${report.absent} that the sources have none for`);
  if (report.checked > 0) said.push(`${report.checked} checked and still there`);
  // Never folded into the absences, and this clause is the whole reason: a rate limit or a
  // timeout is a thing that happened to the request, and nothing was written down about
  // those objects at all.
  if (report.unanswered > 0) {
    said.push(`${report.unanswered} the sources could not answer for, and nothing was recorded`);
  }
  if (report.stillDue > 0) said.push(`${report.stillDue} still to ask about`);

  return said;
}

/**
 * What no lookup will ever reach, said once and only where there is something to say.
 *
 * It is **not** a failure and not work left over, which is why it is a second sentence
 * rather than a sixth clause: nothing keyed by an ISBN can find an object that has none, so
 * the owner reading *43 still to ask about* must not also read the Bonelli monthlies into
 * that number and keep pressing.
 */
export function whatNoLookupReaches(skipped: number): string | null {
  if (skipped === 0) return null;

  return `${skipped} ${skipped === 1 ? "Volume has" : "Volumes have"} no ISBN, so no source can be asked about ${skipped === 1 ? "it" : "them"} — give ${skipped === 1 ? "it" : "them"} an ISBN, or an image of your own.`;
}

/**
 * How far the covers have got, as the sentence under the button that would move it.
 *
 * `null` where there is no catalogue yet, because *0 of 0* is a figure about nothing.
 */
export function howFarTheCoversHaveGot(standing: CoverStanding): string | null {
  if (standing.volumes === 0) return null;

  return `${standing.faced} of ${standing.volumes} ${standing.volumes === 1 ? "Volume is" : "Volumes are"} faced with an image.`;
}

function covers(many: number): string {
  return many === 1 ? "cover" : "covers";
}
