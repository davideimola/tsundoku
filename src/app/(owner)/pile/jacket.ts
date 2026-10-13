import type { FacedWith } from "@/core/queries/cover";
import type { PileEntry } from "@/core/queries/pile";

// WHICH JACKET A ROW OF THE PILE WEARS, and when it wears none.
//
// A row is faced with `entry.cover` — the Story's own image, or whatever the object carrying
// it lends (`composePile`). An omnibus lends one picture to every tale inside it, and four
// rows faced with the same jacket would each claim *this is that book* about a different
// tale. So where a borrowed jacket is shared, the row is drawn as the Story's own cloth with
// its title, and says under its name which Volume it is bound in.
//
// **The Pile does not say how many narratives wear an entry's jacket** (the Story wall's
// `wornBy` has no twin on `PileEntry`), so the sharing is read off the list itself: a borrowed
// jacket worn by two or more different Stories among these rows is shared. A tale whose
// omnibus-mates are not on the Pile keeps the jacket — the approximation errs towards the
// picture, never towards a wrong claim between two rows on one screen.

/** The jackets two or more different Stories in this list borrow. */
export function sharedJackets(entries: PileEntry[]): Set<string> {
  const wearers = new Map<string, Set<string>>();

  for (const entry of entries) {
    if (!entry.cover || entry.cover.from === "own" || !entry.story) continue;
    const who = wearers.get(entry.cover.url) ?? new Set<string>();
    who.add(entry.story.id);
    wearers.set(entry.cover.url, who);
  }

  return new Set([...wearers].filter(([, who]) => who.size > 1).map(([url]) => url));
}

/** What a row is faced with, and the Volume it is bound in where the jacket is shared. */
export function entryWears(
  entry: PileEntry,
  shared: Set<string>
): { image: FacedWith | null; boundIn: string | null } {
  if (!entry.cover || entry.cover.from === "own" || !shared.has(entry.cover.url)) {
    return { image: entry.cover, boundIn: null };
  }

  return { image: null, boundIn: entry.object?.title ?? null };
}
