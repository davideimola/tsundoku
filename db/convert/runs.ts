// The five runs, converted (#44).
//
// Fifty-one of this library's eighty-three Stories are numbers of a run, across five lines:
// One-Punch Man, Slam Dunk, La via del grembiule, Fullmetal Alchemist and Death Note. They are
// the shape *"a Story is what you would give a score to"* replaces — there is nowhere to say
// *Slam Dunk is a 9*, and the hand-kept rows have already drifted, twenty-two Volumes against
// twenty-one Stories. This turns them into five works and strikes the Path the owner minted as
// a workaround for a Want they had no other way to say.
//
// ## Why this is a script and not a migration
//
// **Because the gesture already exists, and it is TypeScript.** `mergeSeriesIntoOneStory`
// (#41) is seven refusals, a Rating carried, the Readings and the Credits moved, the Path stops
// and the Wants and the pins repointed, and the arrow set — and a migration is SQL. Writing it
// again in a `0014_` file would be a second copy of the most careful verb in this repository,
// diverging from the first the day either is touched. So this presses the verb, five times,
// and holds nothing of its own but the guard and the five names.
//
// Three more things follow from that, and each of them would be wrong the other way round:
//
//   * **A migration runs itself.** `pnpm db:migrate` is the deployment's init container
//     (README), so a conversion shipped as one would run on a deploy nobody was watching, and
//     its refusal would be a container that will not start. This is an act the owner takes,
//     reads the report of, and can rehearse first — the same posture `db/import/` takes, for
//     the same reason: an import that happened as a side effect of something else would be an
//     import nobody decided to run.
//   * **It would run everywhere.** Every fresh clone and every test database would apply it,
//     and find no line called *Slam Dunk* to convert. A one-off that is a no-op on ninety-nine
//     databases out of a hundred is not a description of the schema, which is what a migration
//     file is.
//   * **It is not schema at all.** Nothing here adds a column or a constraint: the shape it
//     moves the library onto was built by #35 to #41, and this is the owner's own rows being
//     moved between shapes that both already exist.
//
// The owner reserved the number `0014_` for this in case it shipped as a migration. It does
// not, so that number goes unused and the journal still ends at 10.
//
// ## The guard
//
// It refuses the whole conversion while **any** narrative it would collapse carries a Reading
// or a Rating — and it reads all five lines before touching the first. On the live library
// today that count is zero, which is what makes the conversion lossless; the guard is here so
// it stays true whenever the command is actually taken, which may be a year from now with
// fifteen more Readings in the library.
//
// The merge itself carries a Reading and a Rating across quite deliberately, and is right to:
// a pass through volume seven was a pass through the work. What is different here is that
// nobody is watching. Fifty-one collapses in one press, each moving a fact about what the
// owner read onto a narrative that did not exist a second earlier, is exactly the operation
// that should stop and name what it found rather than report a number afterwards.

import { listPaths } from "../../src/core/queries/path.ts";
import type { NarrativeAMergeWouldCarry } from "../../src/core/queries/series.ts";
import {
  listSeries,
  whatAMergeWouldCarry,
  whatAMergeWouldCollapse,
} from "../../src/core/queries/series.ts";
import { strikePath } from "../../src/core/verbs/path.ts";
import { mergeSeriesIntoOneStory } from "../../src/core/verbs/series.ts";

/**
 * The five lines, by the name the ledger holds.
 *
 * **By name and not by edition line**, because a name is what the owner reads and an edition
 * line is not stable across the two spreadsheets this library was imported from: *Fullmetal
 * Alchemist* is the Ultimate Deluxe Edition in one and nothing at all in the other. A name
 * that matches two ledgers is refused below and names both, which is the honest failure — the
 * owner then says which, and a guess would have converted the wrong one silently.
 */
export const THE_FIVE_RUNS = [
  "One-Punch Man",
  "Slam Dunk",
  "La via del grembiule",
  "Fullmetal Alchemist",
  "Death Note",
] as const;

/**
 * The Path that was never a route: four of Slam Dunk's twenty volumes, copied in one at a
 * time because *I want to read this* had no other door before a Want was a fact (#36, #39).
 *
 * The Marvel and DC Paths are real routes and nothing here reaches them.
 */
export const THE_HAND_MADE_PATH = "Slam Dunk";

/** One of the five lines, as the plan found it. */
export type LineToConvert = {
  id: string;
  name: string;
  editionLine: string | null;
  /** How many objects stand in the line, in the house or not. */
  objects: number;
  /** How many narratives those objects stand for today, and therefore how many become one. */
  narratives: number;
  /** What the merge would carry across, and what the guard refuses over. Empty is the good case. */
  carrying: NarrativeAMergeWouldCarry[];
  /** The work this line already publishes, where the command has been taken before. */
  already: { id: string; title: string } | null;
};

/** What the conversion would do, read before anything is written. */
export type Plan = {
  lines: LineToConvert[];
  /** The hand-made Path, where it is still there. */
  path: { id: string; name: string; stops: number } | null;
  /** Why the conversion will not happen. Empty means it will. */
  refusals: string[];
};

/** One line converted: the work it became. */
export type Work = { line: string; storyId: string };

/** What the conversion did. */
export type Converted = {
  plan: Plan;
  works: Work[];
  /** The lines an earlier press had already converted, left alone. */
  alreadyConverted: string[];
  /** The name of the Path struck, or `null` where there was none left to strike. */
  pathStruck: string | null;
};

/** The conversion refused, with every reason it found rather than the first. */
export class Refused extends Error {
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[]) {
    super(`the conversion refused:\n  ${reasons.join("\n  ")}`);
    this.name = "Refused";
    this.reasons = reasons;
  }
}

/**
 * A merge refused for one of its own reasons, after earlier lines had already been converted.
 *
 * The message names what landed, because that is the only thing the owner needs to know to
 * decide what to do next — and what to do next is almost always to fix what the merge named
 * and run the command again, which finishes the rest.
 */
export class StoppedPartway extends Error {
  readonly converted: readonly Work[];

  constructor(line: string, cause: unknown, converted: readonly Work[]) {
    const done =
      converted.length === 0
        ? "Nothing had been converted yet."
        : `Already converted, and left as they are: ${converted.map((one) => one.line).join(", ")}.`;
    super(
      `${line} refused: ${cause instanceof Error ? cause.message : String(cause)}\n  ${done}\n  ` +
        "Put that right and run the conversion again; it takes up where this stopped."
    );
    this.name = "StoppedPartway";
    this.cause = cause;
    this.converted = converted;
  }
}

/** How a line is named in a report: the ledger's name, and its edition where it has one. */
export function nameOf(line: { name: string; editionLine: string | null }): string {
  return line.editionLine ? `${line.name} ${line.editionLine}` : line.name;
}

/**
 * What the conversion would do, and every reason it would not.
 *
 * Read entirely before anything is written, which is the whole of the guard: five lines
 * checked, then five merges, rather than a merge and a check alternating until one of them
 * says no with three lines already converted.
 */
export async function planTheConversion(): Promise<Plan> {
  const ledgers = await listSeries();
  const refusals: string[] = [];
  const lines: LineToConvert[] = [];

  for (const wanted of THE_FIVE_RUNS) {
    const found = ledgers.filter((one) => one.name.toLowerCase() === wanted.toLowerCase());

    if (found.length === 0) {
      refusals.push(`No Series in this library is called ${wanted}.`);
      continue;
    }
    if (found.length > 1) {
      refusals.push(
        `${found.length} Series are called ${wanted} — ${found.map(nameOf).join(", ")} — ` +
          "and this cannot tell which run the owner meant."
      );
      continue;
    }

    const ledger = found[0];
    const collapsing = await whatAMergeWouldCollapse(ledger.id);

    // **A line already converted is read and never guarded.** What it carries by now is the
    // work itself, and the work is exactly what the owner is meant to rate — so guarding it
    // would refuse the whole conversion the moment someone did the thing this was built for.
    // There is nothing left to collapse on it either: `already` is what makes it a no-op.
    const carrying = ledger.publishes ? [] : await whatAMergeWouldCarry(ledger.id);

    lines.push({
      id: ledger.id,
      name: ledger.name,
      editionLine: ledger.editionLine,
      objects: collapsing?.objects ?? 0,
      narratives: collapsing?.narratives ?? 0,
      carrying,
      already: ledger.publishes,
    });

    for (const one of carrying) {
      const what =
        one.passes > 0 && one.judged
          ? "has been read and carries a score"
          : one.judged
            ? "carries a score"
            : one.passes === 1
              ? "has been read once"
              : `has been read ${one.passes} times`;
      refusals.push(
        `${one.title}, on ${nameOf(ledger)}, ${what}, and collapsing it would move that ` +
          "onto a narrative nobody was looking at."
      );
    }
  }

  const paths = await listPaths();
  const route = paths.find((one) => one.name.toLowerCase() === THE_HAND_MADE_PATH.toLowerCase());

  return {
    lines,
    path: route ? { id: route.id, name: route.name, stops: route.stops } : null,
    refusals,
  };
}

/**
 * Convert the five lines and strike the hand-made Path. Returns what it did.
 *
 * Takes the plan the caller has already read, so that **what was printed is what is pressed**:
 * planning again here would open a window in which the library changed between the report and
 * the writes. Given nothing, it plans for itself.
 *
 * **The guard refuses whole rather than in part**: if any narrative it would collapse carries a
 * Reading or a Rating, nothing at all is written and every reason is named — a conversion is a
 * decision about fifty-one rows taken in one press, so the useful failure is the list and not
 * the first line of it.
 *
 * **What it cannot promise is one transaction**, and that is worth saying plainly rather than
 * implying otherwise. One verb is one transaction (`src/core/verbs/README.md`) and this presses
 * six of them, so five lines is five transactions and no `begin` spans them. The alternative
 * was writing the merge again in SQL to get one, which is the copy the whole file argues
 * against. What that costs is bounded by two things: the guard is read entirely before the
 * first write, so the *foreseen* refusal cannot land halfway; and a merge that refuses for one
 * of its own reasons — a narrative an object outside the line also carries, a line whose
 * objects carry nothing — stops the conversion with `StoppedPartway`, which names the lines
 * already converted. Running it again then finishes the rest, because
 * **a line already converted is left alone rather than refused**.
 */
export async function convertTheRuns(read?: Plan): Promise<Converted> {
  const plan = read ?? (await planTheConversion());
  if (plan.refusals.length > 0) throw new Refused(plan.refusals);

  const works: Work[] = [];
  const alreadyConverted: string[] = [];

  for (const line of plan.lines) {
    if (line.already) {
      alreadyConverted.push(nameOf(line));
      continue;
    }
    try {
      // The line's own name, which is what the work is called: *Slam Dunk*, and not *Slam Dunk
      // 1*. The verb takes the Series' name where no title is given, so nothing is passed.
      works.push({ line: nameOf(line), storyId: await mergeSeriesIntoOneStory(line.id) });
    } catch (error) {
      throw new StoppedPartway(nameOf(line), error, works);
    }
  }

  // Last, and after the merges: the route's four stops are one stop on the work by now, so
  // what goes with the Path is a route the owner never walked and nothing else. A Reading, a
  // Rating and a Story do not reference a route at all (ADR-0016).
  const pathStruck = plan.path ? await strikePath(plan.path.id) : null;

  return { plan, works, alreadyConverted, pathStruck };
}
