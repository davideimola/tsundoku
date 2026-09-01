import type { PathCandidate } from "@/core/queries/path";

// **THE RUNS ON OFFER**: the Stories that could go on this route, banded by the line they
// stand in — the route screen's own derivation, beside the page because it is the page's
// (`AGENTS.md`), and tested beside itself under the licence `vitest.config.ts` states: data
// in, data out, a function this application would still have if React were replaced.
//
// It exists because of the twenty. A route through *Slam Dunk* is twenty stops, and the reason
// nobody built one is that the picker was one native `<select>` of every Story in the library:
// find the title, submit, wait for the route, do it nineteen more times. Multi-select answers
// half of that — twenty ticks instead of twenty round trips — and **the band answers the other
// half**, which is that twenty ticks in a list of seventy-seven is still twenty acts of
// looking. Banded, the twenty are one block with one press over it, and the owner reads *Slam
// Dunk, twenty of them* rather than twenty titles.
//
// **The band is the line and not the Type**, and that is the judgement in the file. Type is
// what the wall filters by, so it is the obvious axis and it is the wrong one here: a route
// crosses Types freely (`core/verbs/path.ts`), and *Manga, 61 of them* is not a group anybody
// pours onto a route. The line is: it is the run the objects stand in on a shelf, it is the
// thing the owner is working through, and it is already the colour the wall taught them
// (`@/lib/tint`).
//
// **Banding is the screen's and the order is the core's.** `listStoriesNotOnPath` stands the
// candidates in the order their objects stand on the shelf — 1, 2, 10, and the unlined last —
// and this file preserves it rather than re-deciding it: the bands come out in the order their
// first Story arrived in, and each band holds its Stories in the order they arrived. That
// matters more here than on any other screen, because this order is not a way of *reading* the
// answer — it is the order the stops are placed in when the selection is submitted, so a band
// that re-sorted its rows would silently write a route the owner did not read.

/** One run of candidates: the line they stand in, and the Stories of it still off the route. */
export type Run = {
  /**
   * The line, as the owner would name it — *Slam Dunk*, *Death Note Black Edition* — or the
   * words for standing in none.
   */
  name: string;
  /**
   * The Series' id, which is the only thing a colour is ever derived from (`@/lib/tint`), and
   * `null` for the run that is not a run: what stands in no line wears the page's own ground.
   */
  seriesId: string | null;
  /** In the order they will be placed in, which is the order the core answered with. */
  stories: PathCandidate[];
};

/**
 * What a Story stands in when it stands in nothing.
 *
 * Said as a sentence about the Story rather than as *Other* or *No series*: a novel and an
 * omnibus stand in no line and are not leftovers, and this band is routinely the biggest one.
 */
export const STANDS_IN_NO_LINE = "Stands in no line";

/**
 * Band the candidates by the line they stand in, keeping the core's order in and between the
 * bands.
 *
 * Keyed by the Series' **id** and never by its name: *Fullmetal Alchemist* runs in the standard
 * printing and in the Ultimate Deluxe Edition, and those are two runs the owner would put on
 * two routes — one band of thirty-four would be the screen telling them the shelf holds
 * something it does not.
 */
export function theRunsOnOffer(candidates: readonly PathCandidate[]): Run[] {
  const runs = new Map<string, Run>();

  for (const story of candidates) {
    // A Map keyed on the id, so insertion order is first-appearance order, which is the order
    // the core answered in. Nothing here sorts.
    const key = story.series?.id ?? STANDS_IN_NO_LINE;
    const run = runs.get(key);

    if (run) {
      run.stories.push(story);
      continue;
    }

    runs.set(key, {
      name: story.series
        ? [story.series.name, story.series.editionLine].filter(Boolean).join(" ")
        : STANDS_IN_NO_LINE,
      seriesId: story.series?.id ?? null,
      stories: [story],
    });
  }

  return [...runs.values()];
}

/**
 * The press over a whole band: **the one that makes twenty stops one gesture**.
 *
 * It carries the number because that is the whole of what it promises — *Put all 20 on* is a
 * press the owner can weigh before making it, where *Put them all on* is one they have to
 * count first. A band of one says *Put it on*, because *Put all 1 on* is a sentence no screen
 * should print.
 */
export function theWholeRunPress(run: Run): string {
  return run.stories.length === 1 ? "Put it on" : `Put all ${run.stories.length} on`;
}
