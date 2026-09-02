import type {
  ReadingListEntry,
  ReadingListLine,
  ReadingListReason,
  ReadingListRoute,
} from "@/core/queries/reading-list";
import { howFarItGot } from "../stories/readings";

// How an entry of the Reading list is **said**, in one place, because two screens say it
// now: the list itself, and the dashboard's *what to read next* (#24).
//
// It is a module of its own for the reason `../stories/story-state.tsx` is one. An entry has
// no title of its own — it is composed, so what to call it is a judgement over what put it
// there — and it has one line that decides whether it is actionable tonight. A second copy
// of either would be a second answer: the dashboard saying *buy it first* where the list
// says *already on the shopping list* is the spreadsheet's failure mode, arrived at by a
// different route.
//
// **A row carries several reasons now** (#40): one Story is one row however many reasons put
// it there, so the four questions below read across `reasons` rather than off a single
// filled half. **The readers at the top stay three, and the fourth source is why that is not
// an omission**: a run in progress names no record beside the Story (#43) — it is the open
// pass read as a fraction — so what it says is *7 of 20 read*, and there is nothing for a
// reader to fetch and nothing for the sentence to link to. The three readers at the top are what keep every one of them, and both
// screens, asking the same way.

/** The Want that put this entry here, where one did. */
export function theWantOn(entry: ReadingListEntry): { id: string; openedAt: string } | null {
  return entry.reasons.find((reason) => reason.want)?.want ?? null;
}

/** Every route this entry stands on, in the order the list composed them. */
export function theRoutesOf(entry: ReadingListEntry): ReadingListRoute[] {
  return entry.reasons.flatMap((reason) => (reason.path ? [reason.path] : []));
}

/**
 * The Series this entry is a position of — the shopping half — or nothing.
 *
 * A row is one or the other and never both: a Series names an object and a Want or a route
 * names a narrative (ADR-0001), so the two never merge into one entry.
 */
export function theSeriesOf(entry: ReadingListEntry): ReadingListLine | null {
  return entry.reasons.find((reason) => reason.series)?.series ?? null;
}

/**
 * What to call the thing to read.
 *
 * A Want and a route's stop both name a Story. A Series entry names an **object**, because a
 * Series is a publisher's line of objects and what story a Volume carries is a separate fact
 * (ADR-0001) — so where the library has not catalogued that object, the honest name for it
 * is the Series and the number, which is also exactly what the owner would look for in a
 * shop.
 */
export function entryTitle(entry: ReadingListEntry): string {
  if (entry.story) return entry.story.title;
  if (entry.object) return entry.object.title;

  const series = theSeriesOf(entry);
  if (!series) return "Something to read";

  return [series.name, series.editionLine, series.position].filter(Boolean).join(" ");
}

/** The one line that decides whether the entry is actionable tonight. */
export function entryStanding(entry: ReadingListEntry): string {
  if (entry.medium === "digital") return "digital · tonight";
  if (entry.atHand) return "paper · on the shelf";
  return entry.wishAlreadyOpen ? "paper · already on the shopping list" : "paper · buy it first";
}

/**
 * **Why this row is here, said once per reason** — and a row says all of them, because it is
 * one row for all of them.
 *
 * A route's stop is worded by where it stands among what is still to read on that route:
 * *next* is the one the route is offering, and anything further back is what stands behind it,
 * which the owner can pin out of order — the whole of *three Marvel stories and then a DC one*.
 */
export function reasonSaid(reason: ReadingListReason): ReasonSaid {
  if (reason.want) return { said: "I said I want to read it", names: null };

  if (reason.path) {
    return {
      said: reason.path.place === 1 ? "Next on " : `${ordinal(reason.path.place)} in line on `,
      names: { label: reason.path.name, href: `/paths/${reason.path.id}` },
    };
  }

  if (reason.run) {
    // **The fraction is said in the work's own words, and they are the Story page's words**:
    // `howFarItGot` is the one wording of *seven of twenty* in this application (#37), spent
    // here rather than written again, so a row and the page it opens cannot say two numbers.
    //
    // The verb is the judgement. A pass that has finished nothing is *0 of 20* — a
    // measurement, because there is a pass — and what it asks for is **starting**; anything
    // above nought asks for **carrying on**. One word, and it is the difference between the
    // list describing the shelf and the list telling the owner what to do next.
    const { howFarItGot: far, nextInstalment } = reason.run;

    return {
      said: `${howFarItGot(far)} read — ${far.atInstalment === 0 ? "start" : "carry on"} at ${nextInstalment}`,
      // It names no record, because a run is not one: it is the open pass, read as a
      // fraction, and the Story the tile already leads to is where it is kept.
      names: null,
    };
  }

  if (reason.series) {
    const { name, editionLine, position, publishedCount } = reason.series;
    return {
      said: `Volume ${position} of ${publishedCount} of `,
      names: {
        label: [name, editionLine].filter(Boolean).join(" "),
        href: `/series/${reason.series.id}`,
      },
    };
  }

  // Unreachable — a reason is one of the four — and answered rather than thrown, for the
  // reason `entryFoot` answers rather than throwing.
  return { said: "On the list", names: null };
}

/**
 * A reason as a sentence: the words, and the record they name.
 *
 * Split rather than one string because the record is a **link** — a route and a Series are
 * both screens the owner goes to from here — and a page that had to find the name inside the
 * sentence to wrap it would be the wording written twice.
 */
export type ReasonSaid = {
  /** The words before the record's name, ending in a space where one follows. */
  said: string;
  /** The record the sentence names, and the screen it opens. Null where it names none. */
  names: { label: string; href: string } | null;
};

/** *1st*, *2nd*, *3rd*, *4th* — English's own three exceptions and then the rule. */
function ordinal(place: number): string {
  const teen = place % 100;
  if (teen >= 11 && teen <= 13) return `${place}th`;

  switch (place % 10) {
    case 1:
      return `${place}st`;
    case 2:
      return `${place}nd`;
    case 3:
      return `${place}rd`;
    default:
      return `${place}th`;
  }
}

// **What identifies a row is not here, and that is deliberate**: it is `theKeyOf` in
// `@/core/queries/reading-list`, because the same value is what a pin names. A screen keying
// its rows one way while the verb it posts to names them another is how a press comes to pin
// the row above, so the encoding is the core's and both doors spend it.

/**
 * Where the tile beside an entry leads — **to the thing the entry is about**, which is not
 * the same record for the two halves.
 *
 * A Want and a route's stop are about a *narrative* the owner means to read, so they open the
 * Story. A Series entry is about an *object* they do not have yet (ADR-0001), so it opens the
 * object where the library knows one and the line's own ledger where it does not — which is
 * the screen that says what is missing, and the honest destination for a position nobody has
 * catalogued.
 */
export function entryLeadsTo(entry: ReadingListEntry): string | undefined {
  if (entry.story) return `/stories/${entry.story.id}`;
  if (entry.object) return `/collection/${entry.object.id}`;

  const series = theSeriesOf(entry);
  return series ? `/series/${series.id}` : undefined;
}

/**
 * **The line an entry takes its colour from**, or nothing where it stands in none.
 *
 * The two halves reach it differently and that is the whole reason it is written down: a
 * Series entry *is* about a line and names it directly, and a Want or a route's stop is about
 * a narrative that has no line of its own (ADR-0001) — so its colour is borrowed from the
 * object carrying it, exactly as the Story wall borrows one. An entry with neither is drawn
 * on the palette's own paper, which is the ordinary case for something read digitally.
 */
export function entryLine(entry: ReadingListEntry): string | null {
  return theSeriesOf(entry)?.id ?? entry.object?.seriesId ?? null;
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
    theSeriesOf(entry)?.position ??
    entry.object?.seriesNumber ??
    entry.story?.type.name ??
    // Unreachable — an entry is composed from a Want or a route, which name a Story, or from
    // a Series, which names a position — and answered rather than thrown, because a tile is
    // never the place to raise. The same posture the Story wall takes over an impossible
    // empty band.
    "to read"
  );
}
