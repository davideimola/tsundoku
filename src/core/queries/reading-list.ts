import "server-only";

import { query } from "../db.ts";
import type { ProposedWish } from "../verbs/wish.ts";
import { IN_THE_HOUSE } from "./collection.ts";
import { nextUnreadOnActivePaths } from "./path.ts";
import { listMissingVolumes, type SeriesLedger } from "./series.ts";
import type { StoryType } from "./story.ts";

// **The Reading list, which is a query and not a table.**
//
// This is the file the whole application is for (#1). The spreadsheet keeps a `Prossimo`
// column per route that the owner recomputes by hand every time they finish something, and
// three of its dashboard tiles read `#ERROR!`; here the queue is composed on the way out of
// two derivations that are themselves derivations, and there is nowhere an entry could be
// stored stale. The only thing stored is a **pin**, which is the owner's disagreement with
// the order and cannot invent an entry — see
// `db/migrations/0011_01_a_pin_is_the_only_stored_thing_in_the_reading_list.sql`.
//
// It composes from two sources and nothing else (CONTEXT.md, user story 22):
//
//   - **the next unread Story of every active Path**, which is `nextUnreadOnActivePaths`
//     from `queries/path.ts` — one entry per route, and a route that is exhausted or put
//     aside is simply absent from it rather than present with nothing in it;
//   - **the next missing Volume of every Series being collected**, which is
//     `listMissingVolumes` from `queries/series.ts` — and *being collected* is the owner's
//     deliberate decision, never derived from what is on the shelf.
//
// Neither is re-derived here. This file asks those two questions, asks one more about the
// objects the answers need, and lays the three side by side; the judgement in it is what an
// entry *means* — what medium it is intended in, whether the owner can start it tonight,
// and what it would take to buy.

/**
 * Paper or digital, and here it is **derived rather than recorded**.
 *
 * The same two values a Reading carries (`verbs/reading.ts`), reused deliberately: a
 * medium is a check constraint and not a vocabulary that grows (#3), so a third value
 * would be a change to the derivation below rather than an insert. Nothing writes this
 * one — a Reading's medium is a fact about an act that happened, and this is an intention
 * about one that has not.
 */
export type ReadingListMedium = "paper" | "digital";

/** The object an entry goes through, where the library knows of one. */
export type ReadingListObject = {
  id: string;
  title: string;
  publisher: string;
  editionLine: string | null;
  binding: { id: string; name: string };
  /** Whether the Collection claims it right now (ADR-0007). */
  inTheHouse: boolean;
};

// A proposal is a `ProposedWish` from `verbs/wish.ts` and not a shape of this file's,
// because that type **is** the seam: #10 wrote it so that a caller can build the value and
// not call the verb. Buying stays a decision (user story 28), so nothing here writes, and
// what the screen or the assistant does with the value is hand it to `openWish` — or not.

/**
 * One entry of the Reading list: something to read, why it is in the queue, and what it
 * would take to start it.
 *
 * Flat rather than a union of two shapes, because both doors read it — a screen lays it out
 * and an assistant reads it over MCP — and one shape with a stated null half is legible to
 * both where a discriminated union would need each of them to branch first. `because` says
 * which half is filled.
 */
export type ReadingListEntry = {
  /** Which of the two sources put it here. */
  because: "path" | "series";
  /**
   * The route this stop is on, with the owner's own words about it. Null on a Series
   * entry.
   */
  path: { id: string; name: string; intent: string | null } | null;
  /**
   * The Series this object would complete, and which position of it is next. Null on a
   * Path entry.
   */
  series: {
    id: string;
    name: string;
    publisher: string;
    editionLine: string | null;
    /** The first position of the Series the house has none of. */
    position: number;
    /** How many are out, as the owner last recorded it. */
    publishedCount: number;
  } | null;
  /**
   * The Story to read. Null on a Series entry, which names an **object** and not a
   * narrative: what story a Volume carries is a separate fact (ADR-0001), and the ledger
   * does not claim to know it.
   */
  story: { id: string; title: string; type: StoryType } | null;
  /**
   * **The intended medium, and it follows the object.** `paper` where an object carries
   * this entry, `digital` where none does — because digital ownership is deliberately not
   * modelled (CONTEXT.md), so a Story no Volume carries is one the owner needs no object
   * for and can read tonight, and a Series is a line of objects and therefore always
   * paper.
   */
  medium: ReadingListMedium;
  /**
   * Whether the owner can start it tonight: digital, or paper with the object already on
   * the shelf. False is the entry that has to be bought first.
   */
  atHand: boolean;
  /**
   * The object this entry goes through, where the library knows one — on the shelf or not.
   *
   * Null means two different things, and `medium` tells them apart. On a `digital` entry
   * there is no object to know. On a `paper` one the library does **not know** the object
   * yet, which is a Series position nobody has catalogued: there is nothing to wish for,
   * and recording the object is the owner's act or an Inbox proposal (ADR-0005), never
   * this list's.
   */
  object: ReadingListObject | null;
  /**
   * **A Wish this entry proposes, and has not opened.** Present exactly where the entry
   * needs an object the owner does not have, the library knows that object, and no Wish on
   * it is open already. Reading the whole list writes nothing (user story 28).
   */
  proposedWish: ProposedWish | null;
  /** Whether the owner already means to buy the object. Nothing to propose, and no problem. */
  wishAlreadyOpen: boolean;
  /** Whether the owner pinned this entry's source. Pinned entries lead the queue. */
  pinned: boolean;
};

/**
 * **The Reading list.** What to read next, composed from the owner's active Paths and the
 * Series they are collecting, in the order they should read it in.
 *
 * The order is: **pinned first, most recently pinned leading** — pinning is the act of
 * saying *this next*, so the newest one is the newest decision — and then the Path entries
 * in the owner's order of routes, and then the Series entries by name. Paths lead the
 * unpinned part because a route is a judgement the owner made about what to read, and a
 * Series is a ledger of what a publisher has printed.
 *
 * **It writes nothing.** An entry that needs an object the owner does not own carries a
 * `proposedWish` built out of what it would say, and `openWish` is not called: the owner
 * (or an assistant, on their word) opens it. Walking the whole list leaves the `wish` table
 * exactly as it was.
 */
export async function composeReadingList(): Promise<ReadingListEntry[]> {
  // The two sources and the pins, read together. Three statements rather than one: the
  // two derivations already exist, tested, in `queries/path.ts` and `queries/series.ts`
  // (#9, #7), and re-deriving either of them here to save a round trip would be keeping a
  // second answer to a question that has one.
  const [ahead, incomplete, pins] = await Promise.all([
    nextUnreadOnActivePaths(),
    listMissingVolumes(),
    pinnedSources(),
  ]);

  // The objects both halves need, asked for in one statement each rather than per entry.
  const [carriers, positions] = await Promise.all([
    objectsCarrying(ahead.map((stop) => stop.next.storyId)),
    objectsAtPositions(incomplete),
  ]);

  const entries: ReadingListEntry[] = [
    ...ahead.map((stop) => ({
      because: "path" as const,
      path: stop.path,
      series: null,
      story: { id: stop.next.storyId, title: stop.next.title, type: stop.next.type },
      ...through(carriers.get(stop.next.storyId)),
      pinned: pins.has(stop.path.id),
    })),
    ...incomplete.map((ledger) => ({
      because: "series" as const,
      path: null,
      series: {
        id: ledger.id,
        name: ledger.name,
        publisher: ledger.publisher,
        editionLine: ledger.editionLine,
        // `listMissingVolumes` answers only with Series that have a gap, so there is a
        // position here and the fallback is unreachable rather than a default.
        position: ledger.nextMissing ?? 0,
        publishedCount: ledger.publishedCount,
      },
      story: null,
      // **Paper regardless**, and it is the one place the medium does not follow the
      // object: a Series is a publisher's line of *objects*, so its next stop is a thing
      // to buy even when the library has not catalogued it and there is nothing to
      // propose. Digital would be a claim about a file this model does not hold.
      ...through(positions.get(at(ledger.id, ledger.nextMissing ?? 0)), "paper"),
      pinned: pins.has(ledger.id),
    })),
  ];

  // Pinned first and the newest pin leading; everything else keeps the order it arrived
  // in, which is the owner's order of routes and then the Series by name. A stable sort,
  // so the unpinned part is untouched rather than re-decided here.
  return entries.sort((one, other) => place(one, pins) - place(other, pins));
}

/** Where an entry sits in the pinned part of the queue, or after all of it. */
function place(entry: ReadingListEntry, pins: Map<string, number>): number {
  const subject = entry.path?.id ?? entry.series?.id ?? "";
  return pins.get(subject) ?? pins.size;
}

/** An object the library knows about, and whether the owner already means to buy it. */
type Carrier = { object: ReadingListObject; wishAlreadyOpen: boolean };

/**
 * What an entry going through this object — or through none — means: the medium it is
 * intended in, whether it can be started tonight, and the Wish it proposes.
 *
 * **The whole judgement of this file is these six lines.** Written once because the two
 * sources reach it by different routes and must not answer it differently: a Story with no
 * object and a Series position with no object are not the same event, but an object on the
 * shelf means the same thing whichever put it there.
 */
function through(
  carrier: Carrier | undefined,
  medium: ReadingListMedium = carrier ? "paper" : "digital"
): Pick<ReadingListEntry, "medium" | "atHand" | "object" | "proposedWish" | "wishAlreadyOpen"> {
  const inTheHouse = carrier?.object.inTheHouse ?? false;
  const wishAlreadyOpen = carrier?.wishAlreadyOpen ?? false;

  return {
    medium,
    // Digital needs nothing, and paper needs the object to be on the shelf.
    atHand: medium === "digital" || inTheHouse,
    object: carrier?.object ?? null,
    // **Proposed, never opened.** Only where there is an object to name, the house does
    // not hold it, and the owner is not already meaning to buy it — a second open Wish on
    // one Volume is refused by the database anyway, and offering it would be this list
    // proposing a mistake.
    proposedWish:
      carrier && !inTheHouse && !wishAlreadyOpen
        ? { volumeId: carrier.object.id, priority: 2 }
        : null,
    wishAlreadyOpen,
  };
}

// The object an entry goes through, as one row per asked-for thing.
//
// `IN_THE_HOUSE` rather than a rule of its own: what being in the Collection means is
// written down once, in `queries/collection.ts` (ADR-0007).
const CARRIER = `
  jsonb_build_object(
    'id', v.id,
    'title', v.title,
    'publisher', v.publisher,
    'editionLine', v.edition_line,
    'binding', jsonb_build_object('id', b.id, 'name', b.name),
    'inTheHouse', ${IN_THE_HOUSE}
  ) as object,
  exists (select 1 from wish w where w.volume_id = v.id and w.closed_on is null)
    as "wishAlreadyOpen"`;

// **What the house holds first.** A Story carried by an object on the shelf is a Story the
// owner can start tonight, whatever else the library knows that carries it — an entry that
// offered to buy the deluxe while the tankōbon sat on the shelf would be the shopping list
// talking over the queue. After that the Binding's own order, which is the order the
// Collection is read in, so the choice is the same one every screen makes.
const BEST_CARRIER = `order by (${IN_THE_HOUSE}) desc, b.display_order, lower(v.title), v.id`;

/**
 * For each Story asked about, the one object worth naming: what the house holds if it
 * holds any, else the first the library knows.
 *
 * A Story with no object at all is simply absent from the map, which is what makes the
 * entry digital.
 */
async function objectsCarrying(storyIds: string[]): Promise<Map<string, Carrier>> {
  if (storyIds.length === 0) return new Map();

  const rows = await query<Carrier & { storyId: string }>(
    `select asked.story_id::text as "storyId", best.object, best."wishAlreadyOpen"
       from unnest($1::uuid[]) as asked(story_id)
       -- Laterally, so a Story nothing carries produces no row here rather than a row
       -- with an empty object in it: absence is the answer and not a value to check for.
       join lateral (
         select ${CARRIER}
           from volume_story vs
           join volume v on v.id = vs.volume_id
           join binding b on b.id = v.binding_id
          where vs.story_id = asked.story_id
          ${BEST_CARRIER}
          limit 1
       ) best on true`,
    [storyIds]
  );

  return new Map(rows.map((row) => [row.storyId, row]));
}

/** The Paths and Series the owner has pinned, most recently pinned first. */
async function pinnedSources(): Promise<Map<string, number>> {
  const rows = await query<{ subject: string }>(
    `select coalesce(path_id, series_id)::text as subject
       from reading_list_pin
      order by pinned_at desc, subject`
  );

  return new Map(rows.map((row, place) => [row.subject, place]));
}

/** One Series' position, as the key of the map below. */
function at(seriesId: string, position: number): string {
  return `${seriesId}#${position}`;
}

/**
 * For each Series position asked about, the object the library knows at it — which is most
 * often none.
 *
 * **A position that is missing usually has no catalogued object**, and that is structural
 * rather than a gap in the data: placing a Volume in a Series asks that the house hold it
 * (ADR-0007), so the only object that can sit at a missing position is one the owner had
 * and let go. That is exactly the case worth proposing a Wish for — buy back the volume
 * that was sold — and every other missing position is a thing nobody has recorded, where
 * this list has nothing to name and says so by answering with nothing.
 */
async function objectsAtPositions(ledgers: SeriesLedger[]): Promise<Map<string, Carrier>> {
  const asked = ledgers.filter((ledger) => ledger.nextMissing !== null);
  if (asked.length === 0) return new Map();

  const rows = await query<Carrier & { seriesId: string; position: number }>(
    `select asked.series_id::text as "seriesId", asked.position, best.object, best."wishAlreadyOpen"
       from unnest($1::uuid[], $2::int[]) as asked(series_id, position)
       join lateral (
         select ${CARRIER}
           from volume v
           join binding b on b.id = v.binding_id
          where v.series_id = asked.series_id and v.series_number = asked.position
          ${BEST_CARRIER}
          limit 1
       ) best on true`,
    [asked.map((ledger) => ledger.id), asked.map((ledger) => ledger.nextMissing)]
  );

  return new Map(rows.map((row) => [at(row.seriesId, row.position), row]));
}
