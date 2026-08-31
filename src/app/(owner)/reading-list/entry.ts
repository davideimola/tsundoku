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
