import type { ReadingListEntry } from "@/core/queries/reading-list";

// How an entry of the Reading list is **said**, in one place, because two screens say it
// now: the list itself, and the dashboard's *what to read next* (#24).
//
// It is a module of its own for the reason `../stories/story-state.tsx` is one. An entry has
// no title of its own — it is composed, so what to call it is a judgement over three
// possibilities — and it has one line that decides whether it is actionable tonight. A
// second copy of either would be a second answer: the dashboard saying *buy it first* where
// the list says *already on the shopping list* is the spreadsheet's failure mode, arrived at
// by a different route.

/**
 * What to call the thing to read.
 *
 * A Path entry names a Story. A Series entry names an **object**, because a Series is a
 * publisher's line of objects and what story a Volume carries is a separate fact
 * (ADR-0001) — so where the library has not catalogued that object, the honest name for it
 * is the Series and the number, which is also exactly what the owner would look for in a
 * shop.
 */
export function entryTitle(entry: ReadingListEntry): string {
  if (entry.story) return entry.story.title;
  if (entry.object) return entry.object.title;

  const series = entry.series;
  if (!series) return "Something to read";

  return [series.name, series.editionLine, series.position].filter(Boolean).join(" ");
}

/** The one line that decides whether the entry is actionable tonight. */
export function entryStanding(entry: ReadingListEntry): string {
  if (entry.medium === "digital") return "digital · tonight";
  if (entry.atHand) return "paper · on the shelf";
  return entry.wishAlreadyOpen ? "paper · already on the shopping list" : "paper · buy it first";
}

/** An entry's source is its identity: one per active Path, one per Series being collected. */
export function entryKey(entry: ReadingListEntry): string {
  return `${entry.because}:${entry.path?.id ?? entry.series?.id}`;
}

/**
 * Where the tile beside an entry leads — **to the thing the entry is about**, which is not
 * the same record for the two sources.
 *
 * A Path entry is about a *narrative* the owner means to read, so it opens the Story. A
 * Series entry is about an *object* they do not have yet (ADR-0001), so it opens the object
 * where the library knows one and the line's own ledger where it does not — which is the
 * screen that says what is missing, and the honest destination for a position nobody has
 * catalogued.
 */
export function entryLeadsTo(entry: ReadingListEntry): string | undefined {
  if (entry.story) return `/stories/${entry.story.id}`;
  if (entry.object) return `/collection/${entry.object.id}`;
  if (entry.series) return `/series/${entry.series.id}`;
  return undefined;
}

/**
 * **The line an entry takes its colour from**, or nothing where it stands in none.
 *
 * The two sources reach it differently and that is the whole reason it is written down: a
 * Series entry *is* about a line and names it directly, and a Path entry is about a narrative
 * that has no line of its own (ADR-0001) — so its colour is borrowed from the object carrying
 * it, exactly as the Story wall borrows one. An entry with neither is drawn on the palette's
 * own paper, which is the ordinary case for something read digitally.
 */
export function entryLine(entry: ReadingListEntry): string | null {
  return entry.series?.id ?? entry.object?.seriesId ?? null;
}

/**
 * Everything the tile cannot fit, in the order the owner would say it: what it is called, and
 * the one line that decides whether it can be started tonight.
 *
 * It is the accessible name and the tooltip of the tile, and it is here for the reason
 * `storyDetail` is beside the Story wall's own words: a tile the pointer describes one way
 * and the row beside it another would be two answers about one entry.
 */
export function entryDetail(entry: ReadingListEntry): string {
  return `${entryTitle(entry)} — ${entryStanding(entry)}`;
}

/**
 * The one thing the tile's foot can fit.
 *
 * **The position in the line, wherever there is one**, because that is the number the owner
 * reads along a shelf and types into a shop's search — the Series entry's own next position,
 * or the position of the object carrying the Story. Where the entry stands in no line there
 * is no number to print and the Type is what is left worth saying, which is the same fallback
 * an object's own page makes.
 */
export function entryFoot(entry: ReadingListEntry): string | number {
  return (
    entry.series?.position ??
    entry.object?.seriesNumber ??
    entry.story?.type.name ??
    // Unreachable — an entry is composed from a Path, which names a Story, or from a Series,
    // which names a position — and answered rather than thrown, because a tile is never the
    // place to raise. The same posture the Story wall takes over an impossible empty band.
    "to read"
  );
}
