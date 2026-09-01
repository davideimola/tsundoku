import "server-only";

import { query } from "../db.ts";
import type { ProposedWish } from "../verbs/wish.ts";
import { IN_THE_HOUSE } from "./collection.ts";
import { type FacedWith, THE_COVER_IT_IS_FACED_WITH } from "./cover.ts";
import { nextUnreadOnActivePaths } from "./path.ts";
import { listMissingVolumes, type SeriesLedger } from "./series.ts";
import type { StoryType } from "./story.ts";
import { listOpenWants } from "./want.ts";

// **The Reading list, which is a query and not a table.**
//
// This is the file the whole application is for (#1). The spreadsheet keeps a `Prossimo`
// column per route that the owner recomputes by hand every time they finish something, and
// three of its dashboard tiles read `#ERROR!`; here the list is composed on the way out of
// two derivations that are themselves derivations, and there is nowhere an entry could be
// stored stale. The only thing stored is a **pin**, which is the owner's disagreement with
// the order and cannot invent an entry — see
// `db/migrations/0011_01_a_pin_is_the_only_stored_thing_in_the_reading_list.sql`.
//
// It composes from three sources and nothing else (CONTEXT.md):
//
//   - **every open Want**, which is `listOpenWants` from `queries/want.ts` — the owner
//     saying *I want to read this*, which used to cost a named, ordered route and now costs
//     one row (#35). A Want that has fallen quiet is absent from it, and it fell quiet by
//     comparison rather than by anything being written;
//   - **the next unread Story of every active Path**, which is `nextUnreadOnActivePaths`
//     from `queries/path.ts` — one entry per route, and a route that is exhausted or put
//     aside is simply absent from it rather than present with nothing in it;
//   - **the next missing Volume of every Series being collected**, which is
//     `listMissingVolumes` from `queries/series.ts` — and *being collected* is the owner's
//     deliberate decision, never derived from what is on the shelf.
//
// **One thing this file does not yet do, said out loud rather than left to be noticed.**
// CONTEXT.md has it that one Story is one row however many reasons put it there — wanted and
// on two routes is one entry saying all three. That dedup, and the head/reserve split the
// Reading list is meant to become, belong to the slice that changes what a **pin** names (a
// pin still names a Path or a Series here, which is why a Want entry carries none). Until
// then a Story that is both wanted and next on a route composes twice, once for each reason,
// and both rows are true.
//
// None of the three is re-derived here. This file asks those three questions, asks one more
// about the objects the answers need, and lays them side by side; the judgement in it is what
// an entry *means* — what medium it is intended in, whether the owner can start it tonight,
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
  /**
   * **The three facts the tile beside the entry is drawn from** (#29).
   *
   * The list is read as a shelf now rather than as rows, so an entry carries the same tile
   * the walls are laid out as: the line the object stands in is what tints it, the position
   * is the number at its foot, and the jacket is what covers the drawn one where a lookup
   * found one. All three are the *object's* — a Story has no Series and no ISBN of its own
   * (ADR-0001) — and all three are `null` for an object nobody has placed in a line or
   * looked a cover up for, which is the ordinary answer and not a gap.
   */
  seriesId: string | null;
  seriesNumber: number | null;
  cover: FacedWith | null;
};

// A proposal is a `ProposedWish` from `verbs/wish.ts` and not a shape of this file's,
// because that type **is** the seam: #10 wrote it so that a caller can build the value and
// not call the verb. Buying stays a decision (user story 28), so nothing here writes, and
// what the screen or the assistant does with the value is hand it to `openWish` — or not.

/**
 * One entry of the Reading list: something to read, why it is on the list, and what it
 * would take to start it.
 *
 * Flat rather than a union of three shapes, because both doors read it — a screen lays it
 * out and an assistant reads it over MCP — and one shape with stated null halves is legible
 * to both where a discriminated union would need each of them to branch first. `because` says
 * which half is filled.
 */
export type ReadingListEntry = {
  /** Which of the three sources put it here. */
  because: "want" | "path" | "series";
  /**
   * The Want that put it here, and when the owner said it. Null on a Path or Series entry.
   *
   * It carries no priority, no order and no name, because a Want has none: the whole of it is
   * *I want to read this Story*, and where it sits on the list is the list's business.
   */
  want: { id: string; openedAt: string } | null;
  /**
   * The route this stop is on, with the owner's own words about it. Null on a Want or a
   * Series entry.
   */
  path: { id: string; name: string; intent: string | null } | null;
  /**
   * The Series this object would complete, and which position of it is next. Null on a Want
   * or a Path entry.
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
   * The Story to read. Filled in on a Want and on a Path entry, and null on a Series entry,
   * which names an **object** and not a narrative: what story a Volume carries is a separate
   * fact (ADR-0001), and the ledger does not claim to know it.
   */
  story: { id: string; title: string; type: StoryType } | null;
  /**
   * **The intended medium, and it follows the object.** `paper` where an object carries
   * this entry, `digital` where none does — because digital ownership is deliberately not
   * modelled (CONTEXT.md), so a Story with no Volume is the ordinary shape of a Story read
   * digitally, borrowed, or known only from Goodreads. A Series is a publisher's line of
   * objects and is therefore `paper` whatever the library has catalogued.
   *
   * It is **derived and not declared**, and it is the one judgement in this file the owner
   * could reasonably overturn: a Story on a route that they mean to read on paper and have
   * not catalogued an object for reads `digital` here, because nothing in the library says
   * otherwise and an entry has no row to record an intention on. Cataloguing the object is
   * what changes the answer.
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
  /** Whether the owner pinned this entry's source. Pinned entries lead the list. */
  pinned: boolean;
};

/**
 * **The Reading list.** What to read next, composed from what the owner wants to read, the
 * routes they are walking and the Series they are collecting, in the order they should read
 * it in.
 *
 * The order is: **pinned first, most recently pinned leading** — pinning is the act of
 * saying *this next*, so the newest one is the newest decision — and then the Wants newest
 * first, then the Path entries in the owner's order of routes, and then the Series entries by
 * name. That sequence is a rule nobody maintains rather than a ranking (CONTEXT.md): a Want
 * is the owner's most recent unacted word, a route is a judgement they made about what to
 * read, and a Series is a ledger of what a publisher has printed.
 *
 * **It writes nothing.** An entry that needs an object the owner does not own carries a
 * `proposedWish` built out of what it would say, and `openWish` is not called: the owner
 * (or an assistant, on their word) opens it. Walking the whole list leaves the `wish` table
 * exactly as it was.
 */
export async function composeReadingList(): Promise<ReadingListEntry[]> {
  // The three sources and the pins, read together. Four statements rather than one: the
  // three derivations already exist, tested, in `queries/want.ts`, `queries/path.ts` and
  // `queries/series.ts` (#35, #9, #7), and re-deriving any of them here to save a round trip
  // would be keeping a second answer to a question that has one.
  const [wanted, ahead, incomplete, pins] = await Promise.all([
    listOpenWants(),
    nextUnreadOnActivePaths(),
    listMissingVolumes(),
    pinnedSources(),
  ]);

  // The objects the three halves need, asked for in one statement each rather than per entry.
  // Both narrative sources reach the same question, so they ask it together.
  const [carriers, positions] = await Promise.all([
    objectsCarrying([
      ...wanted.map((want) => want.story.id),
      ...ahead.map((stop) => stop.next.storyId),
    ]),
    objectsAtPositions(incomplete),
  ]);

  const entries: ReadingListEntry[] = [
    // **The Wants lead**, newest first, because a Want is the last thing the owner said and
    // has not acted on. Nothing else about one is an order: it has no priority and no place,
    // and the moment its place starts to matter the owner is already deciding — which is the
    // pin.
    ...wanted.map((want) => ({
      because: "want" as const,
      want: { id: want.id, openedAt: want.openedAt },
      path: null,
      series: null,
      story: want.story,
      // The same judgement a Path entry makes, and deliberately the same call: a Story with
      // no object is one the owner reads without one, whichever source named it.
      ...through(carriers.get(want.story.id), mediumOf(carriers.get(want.story.id))),
      // A pin names a Path or a Series today, and a Want is neither. Nothing to look up.
      pinned: false,
    })),
    ...ahead.map((stop) => ({
      because: "path" as const,
      want: null,
      path: stop.path,
      series: null,
      story: { id: stop.next.storyId, title: stop.next.title, type: stop.next.type },
      // **The medium follows the object**: paper where one carries the Story, digital
      // where none does. A Story with no Volume is one the owner reads without an object,
      // which is the ordinary digital case in this model (CONTEXT.md).
      ...through(carriers.get(stop.next.storyId), mediumOf(carriers.get(stop.next.storyId))),
      pinned: pins.has(stop.path.id),
    })),
    ...incomplete.map((ledger) => ({
      because: "series" as const,
      want: null,
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

/** Where an entry sits in the pinned part of the list, or after all of it. */
function place(entry: ReadingListEntry, pins: Map<string, number>): number {
  const subject = entry.path?.id ?? entry.series?.id ?? "";
  return pins.get(subject) ?? pins.size;
}

/** An object the library knows about, and whether the owner already means to buy it. */
type Carrier = { object: ReadingListObject; wishAlreadyOpen: boolean };

/**
 * The medium an entry going through this object — or through none — is intended in.
 *
 * **Both call sites say the medium out loud** rather than letting this be a default, because
 * the two sources answer it differently on purpose and a default would hide the one that
 * overrides: a Series entry is `paper` even where nothing is catalogued, since a Series is a
 * publisher's line of objects.
 */
function mediumOf(carrier: Carrier | undefined): ReadingListMedium {
  return carrier ? "paper" : "digital";
}

/**
 * What a proposal suggests for *how soon*: **2, which is "soon"**.
 *
 * A suggestion rather than a judgement, and the least presumptuous of the three: the list
 * knows the owner needs this object to carry on, which is more than *someday* and less than
 * *this is what I am buying next* — and priority is what the owner is likeliest to disagree
 * with, so the picker on the screen defaults to this and does not obey it. Nothing derives
 * it from the entry's place on the list: a pin is an order to read in, not a budget.
 */
const PROPOSED_PRIORITY = 2;

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
  medium: ReadingListMedium
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
        ? { volumeId: carrier.object.id, priority: PROPOSED_PRIORITY }
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
    'inTheHouse', ${IN_THE_HOUSE},
    'seriesId', v.series_id,
    'seriesNumber', v.series_number,
    -- The jacket, by the fallback chain the core resolves once in queries/cover.ts: the
    -- owner's own photograph over the looked-up cover, so the three walls and this list
    -- cannot each decide it differently.
    'cover', ${THE_COVER_IT_IS_FACED_WITH}
  ) as object,
  exists (select 1 from wish w where w.volume_id = v.id and w.closed_on is null)
    as "wishAlreadyOpen"`;

// **What the house holds first.** A Story carried by an object on the shelf is a Story the
// owner can start tonight, whatever else the library knows that carries it — an entry that
// offered to buy the deluxe while the tankōbon sat on the shelf would be the shopping list
// talking over the Reading list. After that the Binding's own order, which is the order the
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
  // One Story can be asked about twice — wanted *and* next on a route — and the answer is
  // the same object either way, so the question is asked once.
  const asked = [...new Set(storyIds)];
  if (asked.length === 0) return new Map();

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
    [asked]
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
 * rather than a gap in the data: `placeVolumeInSeries` refuses an object the house does not
 * hold, which ADR-0007 left standing deliberately ("Placing a Volume in a Series still asks
 * that the house hold it"), so the only object that can sit at a *missing* position is one
 * the owner had and let go. That is exactly the case worth proposing a Wish for — buy back the volume
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
