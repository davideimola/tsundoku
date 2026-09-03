import type { StoryOnOffer } from "@/core/queries/story-to-volume";

// **WHAT THE ONE FIELD ANSWERS WITH**, which is this component's own derivation — beside it
// rather than inside it, so that it can be tested beside itself under the licence
// `vitest.config.ts` states: data in, data out, a function this application would still have
// if React were replaced (#47, ADR-0019).
//
// It exists because of the twenty, exactly as the route picker's own banding does
// (`app/(owner)/paths/[id]/candidates.ts`). A field that answered with a flat list of
// seventy-seven titles would be the native `<select>` it replaces with a search box in front
// of it: twenty taps to say an object carries a run, and twenty acts of looking to find them.
// Banded, the twenty are one block with one press over it and the owner reads *Slam Dunk,
// twenty of them* rather than twenty titles.
//
// **The band is the line and not the Type**, and that is the same judgement the route made:
// Type is what a wall filters by and *Comic, 61 of them* is not a group anybody adds to an
// object. The line is — it is the run the objects stand in on a shelf, and it is already the
// colour the walls taught (`@/lib/tint`).
//
// **It is a second banding and not a shared one**, which is deliberate. Banding is the
// screen's (`AGENTS.md`), the two screens band two different questions — what could go on a
// route, and what could be inside an object — and each names its bands in its own words. What
// they must not disagree about is the *order*, and they do not: both keep the order the core
// answered in, and the core answers both in the order objects stand on a shelf.

/** One band of the answer: the line these Stories stand in, and the Stories of it on offer. */
export type Band = {
  /** The line as the owner would name it — *Slam Dunk*, *Death Note Black Edition*. */
  name: string;
  /**
   * The Series' id, which is the only thing a colour is ever derived from (`@/lib/tint`), and
   * `null` for the band that is not a line.
   */
  seriesId: string | null;
  /** In the order they will be added in, which is the order the core answered with. */
  stories: StoryOnOffer[];
};

/**
 * What a Story stands in when it stands in nothing.
 *
 * Said as a sentence about the Story rather than as *Other* or *No series*: a novel and an
 * omnibus stand in no line and are not leftovers, and inside an object this band is the
 * ordinary case rather than the exception.
 */
export const STANDS_IN_NO_LINE = "Stands in no line";

/**
 * Band what the field found by the line each Story stands in, keeping the core's order in and
 * between the bands.
 *
 * Keyed by the Series' **id** and never by its name: *Fullmetal Alchemist* runs in the
 * standard printing and in the Ultimate Deluxe Edition, and one band of thirty-four would be
 * the screen telling the owner the library holds something it does not.
 */
export function theStoriesOnOffer(found: readonly StoryOnOffer[]): Band[] {
  const bands = new Map<string, Band>();

  for (const story of found) {
    // A Map keyed on the id, so insertion order is first-appearance order, which is the order
    // the core answered in. Nothing here sorts.
    const key = story.series?.id ?? STANDS_IN_NO_LINE;
    const band = bands.get(key);

    if (band) {
      band.stories.push(story);
      continue;
    }

    bands.set(key, {
      name: story.series
        ? [story.series.name, story.series.editionLine].filter(Boolean).join(" ")
        : STANDS_IN_NO_LINE,
      seriesId: story.series?.id ?? null,
      stories: [story],
    });
  }

  return [...bands.values()];
}

/**
 * The press over a whole band: **the one that makes twenty rows one gesture**.
 *
 * It carries the number because that is the whole of what it promises — *Add all 20* is a
 * press the owner can weigh before making it, where *Add them all* is one they have to count
 * first. Two says *both*, which is what a person says about two things; one says *Add it*,
 * because *Add all 1* is a sentence no screen should print.
 */
export function theWholeBandPress(band: Band): string {
  if (band.stories.length === 1) return "Add it";
  if (band.stories.length === 2) return "Add both";
  return `Add all ${band.stories.length}`;
}

/**
 * What enter on the field does: add the Story the library already holds under exactly that
 * title, or mint the one it does not. Nothing at all on an empty field.
 *
 * **Minting is the point of the key** (ADR-0019) — a narrative the library has never heard of
 * used to be a trip to another screen and back — and the one case it would be wrong is the
 * one where the owner has typed the whole of a title standing in the answer underneath. A
 * second *Gotham Noir* is exactly the duplicate this slice exists to stop being made, so the
 * exact match wins the key and every other title is added by its own press.
 *
 * Matched on the title with its surrounding space taken off and its case folded, which is how
 * a person reads two titles as the same one. Nothing more clever than that: a title that
 * merely *begins* one already there is a different title, and *Gotham* is not *Gotham Noir*.
 */
export function whatEnterDoes(
  typed: string,
  bands: readonly Band[]
): { add: string } | { mint: string } | null {
  const term = typed.trim();
  if (term === "") return null;

  const same = (title: string) => title.trim().toLowerCase() === term.toLowerCase();
  for (const band of bands) {
    const already = band.stories.find((story) => same(story.title));
    if (already) return { add: already.id };
  }

  return { mint: term };
}
