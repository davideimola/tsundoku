import type { LastEnding } from "@/core/queries/story";

// THE STORY WALL AS A READING DIARY: what is said under a tile about **the owner** rather than
// about the object — when they last went through it, and how the settled bands are laid out.
//
// The Collection is the shelf at home and says only what an object is (its number, its
// Binding); this wall is the experience, so under a finished tile is the bookmark and the
// year, and under one under way is how far it has got. Which words those are, and in which
// order a settled band is read, is decided here and tested beside itself, under the licence
// `vitest.config.ts` states: data in, data out.

/**
 * How a settled band is laid out: as rows of a diary, or as covers. **In the URL** (`?view=`),
 * like every other choice on the wall, so it survives a refresh and needs no script
 * (ADR-0010). The rows are the default and are not written into the address: what is over is
 * read as a diary — the name, the bookmark and the month — and what is open stands as covers.
 */
export const VIEWS = ["list", "covers"] as const;
export type View = (typeof VIEWS)[number];

/** The view the address asks for, read against the list rather than trusted. */
export function viewAsked(said: string | undefined): View {
  return VIEWS.find((one) => one === said) ?? "list";
}

/** One sentence-initial word: *Read*, *Played*. */
function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The verb an ending is said in: the Type's own past where it was finished — *read*, *played*
 * — and *abandoned*, `CONTEXT.md`'s word, where it was given up on.
 */
function endedAs(ending: Pick<LastEnding, "outcome">, verbPast: string): string {
  return ending.outcome === "abandoned" ? "abandoned" : verbPast;
}

/** Under a tile, where there is room for a year: *Read in 2023*, *Played in 2024*. */
export function lastThroughInAYear(
  ending: Pick<LastEnding, "outcome" | "endedOn">,
  verbPast: string
): string {
  return `${capitalised(endedAs(ending, verbPast))} in ${ending.endedOn.slice(0, 4)}`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** On a diary's row, where there is room for the month: *August 2023*. */
export function lastThroughInAMonth(ending: Pick<LastEnding, "endedOn">): string {
  const [year, month] = ending.endedOn.split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

/**
 * A settled band in the order a diary is read in: **the most recent first**, and the Stories
 * nobody wrote a day down for after every dated one, in the order they came (by title).
 */
export function latestFirst<Story extends { id: string }>(
  stories: readonly Story[],
  endings: ReadonlyMap<string, Pick<LastEnding, "endedOn">>
): Story[] {
  const dated = stories.filter((story) => endings.has(story.id));
  const undated = stories.filter((story) => !endings.has(story.id));

  // `toSorted` is stable, so two Stories ended on one day keep the wall's own order.
  const byDay = dated.toSorted((one, other) => {
    const a = endings.get(one.id)?.endedOn ?? "";
    const b = endings.get(other.id)?.endedOn ?? "";
    return a < b ? 1 : a > b ? -1 : 0;
  });

  return [...byDay, ...undated];
}
