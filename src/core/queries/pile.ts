import "server-only";

import { query } from "../db.ts";
import type { PinnedSubject } from "../verbs/pile.ts";
import type { ProposedWish } from "../verbs/wish.ts";
import { IN_THE_HOUSE } from "./collection.ts";
import { type FacedWith, THE_COVER_IT_IS_FACED_WITH } from "./cover.ts";
import { listMedia } from "./medium.ts";
import { type PathStop, stillAheadOnActivePaths } from "./path.ts";
import { listMissingVolumes, type SeriesLedger } from "./series.ts";
import { type HowFarItGot, listRunsInProgress, type StoryType } from "./story.ts";
import { listTypes } from "./type.ts";
import { listOpenWants } from "./want.ts";

// **The Pile, which is a query and not a table.**
//
// This is the file the whole application is for (#1). The spreadsheet keeps a `Prossimo`
// column per route that the owner recomputes by hand every time they finish something, and
// three of its dashboard tiles read `#ERROR!`; here the list is composed on the way out of
// derivations that are themselves derivations, and there is nowhere an entry could be
// stored stale. The only thing stored is a **pin**, which is the owner's own order and
// cannot invent an entry — see
// `db/migrations/0010_a_pin_names_the_thing_to_read.sql`.
//
// **It is two halves rather than one list** (#40, CONTEXT.md). The **head** is what the
// owner pinned, in the order they pinned it: it is short because every row in it is a
// decision, and it is the only place an order means anything. The **reserve** is everything
// else, and it is deliberately unordered — sorted by a rule nobody maintains, the newest
// Want first, then the routes, then the runs in progress, then the ledger — because a long
// list somebody has to keep in order is a list that goes stale. The moment an order starts to matter is the moment the
// owner is already deciding, and that is the pin.
//
// It composes from four sources and nothing else (CONTEXT.md):
//
//   - **every open Want**, which is `listOpenWants` from `queries/want.ts` — the owner
//     saying *I want to read this*, which used to cost a named, ordered route and now costs
//     one row (#35). A Want that has fallen quiet is absent from it, and it fell quiet by
//     comparison rather than by anything being written;
//   - **everything still ahead on every active Path**, which is `stillAheadOnActivePaths` from
//     `queries/path.ts` — every stop still to read, in the owner's order, and not merely the
//     next one. That is what makes *three Marvel stories and then a DC one* expressible at
//     all: what stands behind the next stop has to be visible before it can be pinned (#40).
//     A route that is exhausted or put aside is simply absent;
//   - **every run with somewhere left to go**, which is `listRunsInProgress` from
//     `queries/story.ts` — a Story that declares Instalments and is neither read nor
//     abandoned, naming the Instalment that comes next (#43). It is the case this whole
//     tracker started from: *Slam Dunk* collected, twenty published and twenty on the shelf,
//     so the ledger below has nothing to say about it — it names what is **missing** — and
//     without a hand-made Path the run stood nowhere at all. **The run is the whole signal**:
//     no route minted for something that was never a route, no flag on the Series, and no
//     Want required, so a work owned whole and never opened stands here at nought of twenty;
//   - **the next missing Volume of every Series being collected**, which is
//     `listMissingVolumes` from `queries/series.ts` — and *being collected* is the owner's
//     deliberate decision, never derived from what is on the shelf.
//
// **One Story is one row, however many reasons put it there.** Wanted, and on two routes, is
// one entry naming all three — because the same answer written three times is not three
// answers. The row is keyed by the thing to read, which is also what a pin names, so an entry
// and the owner's order over it agree about what they are talking about.
//
// None of the three sources is re-derived here. This file asks those three questions, asks
// one more about the objects the answers need, and lays them side by side; the judgement in
// it is what an entry *means* — what medium it is intended in, whether the owner can start it
// tonight, and what it would take to buy.

/**
 * The medium an entry is intended in, as a slug of the vocabulary, and here it is **derived
 * rather than recorded**.
 *
 * The same slugs a Pass carries (`verbs/pass.ts`), and **no union of string literals**, for
 * the reason `Type` and `Binding` have none (ADR-0006, ADR-0022): a medium is a data row, so
 * a console is an insert and a type naming today's two would make it a release. Nothing
 * writes this one — a Pass's medium is a fact about an act that happened, and this is an
 * intention about one that has not.
 */
export type PileMedium = string;

/**
 * **How the Pile is narrowed**, and there is one axis: the Type.
 *
 * The filter is an argument here rather than a `filter` on the screen, the way every wall's
 * is (AGENTS.md), and there is deliberately no second axis: *what is startable tonight* is
 * already on every row, and a list that could be narrowed to it would be a fifth way of
 * saying what the row says.
 *
 * **One pile, filtered — never two lists.** The Type is a decision the owner has often
 * already taken by the time they open the screen (*tonight I play*), and the list is
 * unordered for exactly that reason; but the whole reason an external reader can weigh three
 * unread manga against twelve unplayed games is that it is looking at one arrears, so the
 * narrowing is the owner's and the door hands over everything (ADR-0021).
 */
export type PileFilter = {
  /**
   * The Type of the Story to keep, or nothing at all for the whole Pile.
   *
   * A Type the library does not have narrows to nothing rather than being refused, which is
   * every wall's rule: a hand-typed `?type=banana` is an honest empty answer, and what the
   * *controls* offer is only ever a Type standing on the list (`types` below).
   */
  typeId?: string;
};

/** The object an entry goes through, where the library knows of one. */
export type PileObject = {
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

/** The route an entry stands on, and where on it this stop is. */
export type PileRoute = {
  id: string;
  name: string;
  intent: string | null;
  /**
   * Where this stop stands among the route's **unread** stops, counted from one. `1` is what
   * comes next on it; anything higher stands behind that, and is there to be pinned.
   */
  place: number;
};

/**
 * The run an entry is the next part of: how much of it has been read, and what to read next.
 *
 * The fraction is the Story's own `HowFarItGot` and not a shape of this file's, so the row and
 * the Story's own page say *7 of 20* in the same words — `howFarItGot` in
 * `app/(owner)/stories/passes.ts` is the wording, and there is one of it. A run nobody has
 * opened says *0 of 20* here where the Story's page says nothing at all, and that is the one
 * place the two part: the page answers *where am I in this pass*, and there is no pass, where
 * this answers *what do I read next*, which nought of twenty answers perfectly well.
 */
export type PileRun = {
  /** *Seven of twenty*: how much of the work has been read, in the work's own units. */
  howFarItGot: HowFarItGot;
  /** The Instalment that comes next — one past what has been read, so an unopened run is at 1. */
  nextInstalment: number;
};

/** The line an entry would be bought from, and which position of it. */
export type PileLine = {
  id: string;
  name: string;
  publisher: string;
  editionLine: string | null;
  /** The first position of the Series the house has none of. */
  position: number;
  /** How many are out, as the owner last recorded it. */
  publishedCount: number;
};

/**
 * **One reason an entry is on the list**, and a row carries every reason it has.
 *
 * Flat rather than a union of three shapes, because both doors read it — a screen lays it
 * out and an assistant reads it over MCP — and one shape with stated null halves is legible
 * to both where a discriminated union would need each of them to branch first. `because`
 * says which half is filled.
 */
export type PileReason = {
  /** Which of the four sources this reason is. */
  because: "want" | "path" | "run" | "series";
  /**
   * The Want, and when the owner said it. Null on a route's or a line's reason.
   *
   * It carries no priority, no order and no name, because a Want has none: the whole of it is
   * *I want to read this Story*, and where it sits on the list is the list's business.
   */
  want: { id: string; openedAt: string } | null;
  /** The route this stop is on, with the owner's own words about it. Null otherwise. */
  path: PileRoute | null;
  /**
   * The run this is the next part of, and how much of it has been read. Null on every other
   * reason.
   *
   * It is the only reason that names something **inside** the Story rather than a record
   * beside it, because a run is not a thing the owner keeps anywhere: it is the work counted
   * against what has been read of it (#43).
   */
  run: PileRun | null;
  /** The Series this object would complete, and which position of it is next. Null otherwise. */
  series: PileLine | null;
};

/**
 * One entry of the Pile: something to read, every reason it is there, and what it
 * would take to start it.
 *
 * **One row per thing to read**, which is what `subject` names — a Story, or a position of a
 * Series. A Story wanted and standing on two routes is one entry with three `reasons`, and
 * never three entries saying the same thing differently.
 */
export type PileEntry = {
  /**
   * The thing to read, in the pin's own vocabulary: what a pin on this entry would name.
   *
   * It is the entry's identity as well as the pin's subject, and deliberately one value
   * rather than two: a screen keying its rows one way while the verb it posts to names them
   * another is how a press comes to pin the row above.
   */
  subject: PinnedSubject;
  /** Every reason this entry is here, in the order they were composed. Never empty. */
  reasons: PileReason[];
  /**
   * The Story to read. Filled in wherever a Want or a route put the entry here, and null on
   * a Series entry, which names an **object** and not a narrative: what story a Volume
   * carries is a separate fact (ADR-0001), and the ledger does not claim to know it.
   */
  story: { id: string; title: string; type: StoryType } | null;
  /**
   * **The intended medium, and it follows the object — or it is `null`, which is an answer.**
   *
   * An object carrying this entry means the medium is the one that **goes through an
   * object**, which the vocabulary says is paper and says alone (ADR-0022); a Series entry is
   * that medium whatever the library has catalogued, because a Series is a publisher's line
   * of *objects* and its next position is a thing to buy. No value is named here: the flag on
   * the vocabulary row is read, so the answer survives the day a second medium goes through
   * one.
   *
   * **`null` is where no object carries it, and it means the library has nothing to go on.**
   * A medium is a fact about a **Pass** and never about the Story (ADR-0022), an entry is an
   * intention nobody has passed through yet, and the entry has no row to record one on — so
   * where there is no object to infer from, this names no medium rather than guessing at one.
   * It read `digital` until a videogame could stand here (#64), and *Hades · digital* was a
   * claim about a file nobody has: nothing is played on paper and nothing is played on
   * `digital` either. Cataloguing an object is what fills it in.
   *
   * Null costs the answer nothing that mattered, because the question the medium exists for
   * is `atHand` below and it is answered identically: an entry that goes through no object
   * needs nothing bought.
   */
  medium: PileMedium | null;
  /**
   * Whether the owner can start it tonight: **this medium needs no object, or the object is
   * in the house**. False is the entry that has to be bought first.
   *
   * The medium's own `goesThroughAnObject` is what answers the first half (ADR-0022), so the
   * sentence holds for a console the same way it holds for a file: paper needs the object,
   * and nothing else does. An entry naming **no** medium is an entry no object carries, which
   * is the same answer arrived at without the claim.
   */
  atHand: boolean;
  /**
   * The object this entry goes through, where the library knows one — on the shelf or not.
   *
   * Null means two different things, and `medium` tells them apart. On an entry naming no
   * medium there is no object to know. On one that names a medium the library does **not
   * know** the object yet, which is a Series position nobody has catalogued: there is nothing to wish for,
   * and recording the object is the owner's act or an Inbox proposal (ADR-0005), never
   * this list's.
   */
  object: PileObject | null;
  /**
   * **The image the tile beside this row is faced with**, resolved — or `null`, which is the
   * drawn tile and the ordinary case here.
   *
   * The order is the core's and never the screen's, and it is the same one the walls read
   * (`THE_COVER_IT_IS_FACED_OUT_WITH` in `queries/story.ts`): **the image nearest the record**
   * — the Story's own image, then whatever the object carrying it is faced with, then nothing
   * (#65, ADR-0013). A list showing volume one's jacket over an image the owner gave the work
   * would be the Pile disagreeing with `/stories` about the same Story.
   *
   * It is beside `object.cover` rather than replacing it because the two are different facts:
   * that one is what the **object** wears, which an entry proposing a Wish is entitled to
   * name, and this is what the **row** wears. A Series entry names no narrative, so the two
   * are the same answer there.
   */
  cover: FacedWith | null;
  /**
   * **A Wish this entry proposes, and has not opened.** Present exactly where the entry
   * needs an object the owner does not have, the library knows that object, and no Wish on
   * it is open already. Reading the whole list writes nothing (user story 28).
   */
  proposedWish: ProposedWish | null;
  /** Whether the owner already means to buy the object. Nothing to propose, and no problem. */
  wishAlreadyOpen: boolean;
};

/**
 * **The Pile**: a head the owner decided, and a reserve that decided itself.
 *
 * Two lists rather than one flagged list, because they are answers to two different
 * questions and an assistant reading them has to be able to tell them apart: the head is
 * *what the owner said to read next*, and the reserve is *what merely composed*.
 */
export type Pile = {
  /**
   * What the owner pinned, in pin order, newest pin leading — a pin is the act of saying
   * *this next*, so the most recent decision is the one they see first.
   *
   * **There is no cap on it.** A head of twenty is the owner having pinned twenty things: it
   * looks wrong on the screen, and pruning it is theirs to do rather than the library's to
   * refuse.
   */
  head: PileEntry[];
  /**
   * Everything else, in an order nobody maintains: the newest Want first, then the routes in
   * the owner's order of routes and each route's stops in its own order, then the runs with
   * somewhere left to go, then the Series by name.
   *
   * **Do not read a place in it as a ranking.** It is deliberately unordered, and the moment
   * an order matters the owner pins the row, which moves it to the head.
   */
  reserve: PileEntry[];
  /**
   * **Every Type standing on the Pile, in the Types' own stated order — and it ignores the
   * narrowing.**
   *
   * It is here because a control may offer only what the list can be narrowed to (AGENTS.md):
   * a picker naming a Type nothing is composed under is a control whose every use empties the
   * screen. Read off the whole Pile rather than off the narrowed one, or choosing *Videogame*
   * would take every other Type off the picker on the way in and leave no way back.
   *
   * A Series position contributes none, because it names an object and not a narrative
   * (ADR-0001) and a Type is a fact about a Story.
   */
  types: StoryType[];
};

/**
 * **The Pile.** What to read next: the head the owner pinned, and the reserve that
 * composed itself from what they want to read, the routes they are walking and the Series
 * they are collecting.
 *
 * **It writes nothing.** An entry that needs an object the owner does not own carries a
 * `proposedWish` built out of what it would say, and `openWish` is not called: the owner
 * (or an assistant, on their word) opens it. Walking the whole list leaves the `wish` table
 * exactly as it was.
 *
 * **Narrowed by Type where the owner asks and whole where they do not** (#64). The filter
 * decides *what is shown* and never the order: the reserve composes in the order it always
 * composes in and the head stays in pin order, and narrowing takes rows out of both without
 * moving any. `types` says what the list could be narrowed to, whatever it was narrowed by.
 */
export async function composePile(narrowing: PileFilter = {}): Promise<Pile> {
  // The four sources and the pins, read together. Five statements rather than one: the four
  // derivations already exist, tested, in `queries/want.ts`, `queries/path.ts`,
  // `queries/story.ts` and `queries/series.ts` (#35, #9, #43, #7), and re-deriving any of them
  // here to save a round trip would be keeping a second answer to a question that has one.
  const [wanted, routes, runs, incomplete, pins, media, vocabulary] = await Promise.all([
    listOpenWants(),
    stillAheadOnActivePaths(),
    listRunsInProgress(),
    listMissingVolumes(),
    pinnedSubjects(),
    listMedia(),
    listTypes(),
  ]);

  // **One row per thing to read, and the order they arrive in is the reserve's order.** A
  // Map keeps insertion order, so the rule nobody maintains — newest Want, then the routes,
  // then the runs, then the ledger — is the order the four loops below run in and is written
  // nowhere else.
  const rows = new Map<string, Row>();

  // **The Wants lead**, newest first, because a Want is the last thing the owner said and
  // has not acted on. Nothing else about one is an order: it has no priority and no place.
  for (const want of wanted) {
    row(rows, { kind: "story", id: want.story.id }, want.story).reasons.push(
      reason({ because: "want", want: { id: want.id, openedAt: want.openedAt } })
    );
  }

  // Then the routes, in the owner's order of routes, and each route's stops in its own
  // order — **all of them and not only the next**, so what stands behind the next stop is
  // there to be pinned.
  for (const route of routes) {
    route.ahead.forEach((stop: PathStop, ahead: number) => {
      row(
        rows,
        { kind: "story", id: stop.storyId },
        {
          id: stop.storyId,
          title: stop.title,
          type: stop.type,
        }
      ).reasons.push(reason({ because: "path", path: { ...route.path, place: ahead + 1 } }));
    });
  }

  // Then the runs with somewhere left to go, which are the works the owner has not finished.
  // After the routes because a route is an order they decided and a run is only a work
  // standing unfinished, and before the ledger because both of those are things to *read*
  // where the ledger is a thing to buy. A run that is **wanted**, or that stands on a route,
  // merges into that row rather than opening a second: one Story is one row, however many
  // reasons put it there.
  for (const run of runs) {
    row(rows, { kind: "story", id: run.story.id }, run.story).reasons.push(
      reason({
        because: "run",
        run: { howFarItGot: run.howFarItGot, nextInstalment: run.nextInstalment },
      })
    );
  }

  // Then the ledger, which is the shopping half: a position of a line rather than a
  // narrative, so it merges with nothing and stands on its own.
  for (const ledger of incomplete) {
    // `listMissingVolumes` answers only with Series that have a gap, so there is a position
    // here and the fallback is unreachable rather than a default.
    const position = ledger.nextMissing ?? 0;
    row(rows, { kind: "series", id: ledger.id, position }, null).reasons.push(
      reason({
        because: "series",
        series: {
          id: ledger.id,
          name: ledger.name,
          publisher: ledger.publisher,
          editionLine: ledger.editionLine,
          position,
          publishedCount: ledger.publishedCount,
        },
      })
    );
  }

  const composed = [...rows.values()];

  // **What the list could be narrowed to, read off the whole of it** — and read here, before
  // the narrowing below, so that choosing a Type does not take the others off the picker.
  const types = vocabulary.filter((type) =>
    composed.some((draft) => draft.story?.type.id === type.id)
  );

  // **The narrowing, and it takes rows out rather than moving any.** The Map's insertion
  // order is the reserve's order and a filter keeps it, so *what is shown* changes and the
  // order never does. A Series position drops out of any narrowing at all: it names an object
  // and no Story (ADR-0001), so it has no Type to be one — and a list narrowed to *Manga*
  // that still offered a volume nobody has said carries a manga would be the ledger talking
  // over the filter.
  const drafts =
    narrowing.typeId === undefined
      ? composed
      : composed.filter((draft) => draft.story?.type.id === narrowing.typeId);

  // The objects the rows need, asked for in one statement each rather than per entry. Every
  // narrative row reaches the same question whatever put it there, so they ask it together.
  // Asked for the rows that survived the narrowing, because a wall must not read what it does
  // not show.
  const narrativeRows = drafts.flatMap((draft) => (draft.story ? [draft.story.id] : []));
  const [carriers, positions, ownImages] = await Promise.all([
    objectsCarrying(narrativeRows),
    objectsAtPositions(narrowing.typeId === undefined ? incomplete : []),
    // The one thing a Story carries about its own face (#65). Asked here rather than added to
    // the four sources' own answers, because it is a fact about the *tile* and not about the
    // Want, the route or the run that put the row here — and asking it once for the rows that
    // survived the narrowing is what the two questions above already do.
    imagesOnStories(narrativeRows),
  ]);

  // **Whether a medium goes through an object is the vocabulary's answer**, not this file's
  // (ADR-0022). It is what *can I start this tonight* is composed from below, and the one
  // rule it states — paper needs the object, digital and every console need nothing — is a
  // column rather than a value named here. A slug the vocabulary does not have is read as
  // needing an object, which is the conservative direction: an entry the library cannot
  // account for is not claimed to be startable tonight.
  const throughAnObject = new Map(media.map((known) => [known.id, known.goesThroughAnObject]));
  const goesThroughAnObject = (id: PileMedium | null): boolean =>
    id === null ? false : (throughAnObject.get(id) ?? true);

  // **The medium an object means, asked of the vocabulary and never named here** — the one
  // that goes through an object, which is paper and is paper alone (ADR-0022). The first in
  // the vocabulary's own order, so a second such medium would be a row rather than an edit to
  // this file; nothing at all where the vocabulary has none, which is the same absence a
  // narrative row with no object carries.
  const theMediumAnObjectMeans = media.find((known) => known.goesThroughAnObject)?.id ?? null;

  const entries = new Map<string, PileEntry>();
  for (const draft of drafts) {
    // **The medium follows the object** on a narrative row: the medium that goes through an
    // object where one carries the Story, and **none at all** where none does — because a
    // medium is a fact about a Pass and there is no Pass, so a row nothing carries has
    // nothing to go on and says so. A Series row names that medium **regardless**, and it is
    // the one place the medium does not follow the object: a Series is a publisher's line of
    // *objects*, so its next position is a thing to buy even where the library has catalogued
    // nothing and there is nothing to propose.
    const carrier =
      draft.subject.kind === "story"
        ? carriers.get(draft.subject.id)
        : positions.get(at(draft.subject.id, draft.subject.position));

    // **A row an object carries is intended in the medium an object means, and one nothing
    // carries names none.** Both halves are written here rather than behind a helper, because
    // the difference between them is the whole judgement: a Series row names that medium
    // *regardless* of whether anything is catalogued, since a Series is a publisher's line of
    // objects and its next position is a thing to buy.
    const medium = draft.subject.kind === "story" && !carrier ? null : theMediumAnObjectMeans;

    // **A Series entry needs an object whatever the vocabulary says**, and it is the one row
    // that does not read the flag: it *is* the next position of a publisher's line, so there
    // is an object to get and the only question is whether the house has it. Reading the flag
    // here would make a library whose vocabulary held no object medium at all answer that
    // every uncatalogued volume can be started tonight, which is the opposite of the
    // conservative direction the unknown-slug case takes below.
    const needsAnObject = draft.subject.kind === "series" ? true : goesThroughAnObject(medium);

    entries.set(theKeyOf(draft.subject), {
      subject: draft.subject,
      reasons: draft.reasons,
      story: draft.story,
      cover: facedWith(draft.story && ownImages.get(draft.story.id), carrier),
      ...through(carrier, medium, needsAnObject),
    });
  }

  const pinned = new Set(pins.map(theKeyOf));

  return {
    // **The head is the pins, in pin order.** A pin cannot introduce an entry, so a pin on
    // something no source names any more — a Story since read, a line the owner stopped
    // collecting — contributes nothing and simply waits.
    head: pins.flatMap((subject) => {
      const entry = entries.get(theKeyOf(subject));
      return entry ? [entry] : [];
    }),
    // **The reserve is everything else**, in the order it composed, and nothing sorts it
    // further.
    reserve: [...entries].flatMap(([id, entry]) => (pinned.has(id) ? [] : [entry])),
    types,
  };
}

/**
 * One reason, with the two halves it does not fill said out loud.
 *
 * The nulls are stated rather than left off because the shape is what both doors read: an
 * assistant asking `reason.series` of a Want gets `null` and not `undefined`, which is the
 * difference between *there is none* and *this answer has been trimmed*.
 */
function reason(said: Partial<PileReason> & Pick<PileReason, "because">): PileReason {
  return { want: null, path: null, run: null, series: null, ...said };
}

/** A row being built: what it is about, and the reasons gathered for it so far. */
type Row = {
  subject: PinnedSubject;
  story: { id: string; title: string; type: StoryType } | null;
  reasons: PileReason[];
};

/** The row for this thing to read, made on first mention and found on every one after. */
function row(
  rows: Map<string, Row>,
  subject: PinnedSubject,
  story: { id: string; title: string; type: StoryType } | null
): Row {
  const found = rows.get(theKeyOf(subject));
  if (found) return found;

  const made: Row = { subject, story, reasons: [] };
  rows.set(theKeyOf(subject), made);
  return made;
}

/**
 * **One entry's identity, which is its subject written down** — and the core's rather than a
 * screen's, because both doors key rows by it and the verb they post to names the same thing.
 *
 * A screen keying its rows one way while the pin it posts names them another is how a press
 * comes to pin the row above, so there is one encoding and it is here.
 */
export function theKeyOf(subject: PinnedSubject): string {
  return subject.kind === "story"
    ? `story:${subject.id}`
    : `series:${subject.id}#${subject.position}`;
}

/** An object the library knows about, and whether the owner already means to buy it. */
type Carrier = { object: PileObject; wishAlreadyOpen: boolean };

// **This file names no medium at all now**, which is the end of the road ADR-0022 started
// down. It named two by hand — `paper` for a row an object carries and `digital` for one
// nothing does — and the second was the lie: an entry is an intention nobody has passed
// through, and *Hades · digital* was a claim about a file, said next to a game nobody plays on
// one. The first was not a lie but was still a value written here, where the vocabulary
// already carries the fact underneath it: only paper goes through an object. So both are read
// off the rows now, and the fourth console changes neither.

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
 * halves reach it by different routes and must not answer it differently: a Story with no
 * object and a Series position with no object are not the same event, but an object on the
 * shelf means the same thing whichever put it there.
 */
function through(
  carrier: Carrier | undefined,
  medium: PileMedium | null,
  goesThroughAnObject: boolean
): Pick<PileEntry, "medium" | "atHand" | "object" | "proposedWish" | "wishAlreadyOpen"> {
  const inTheHouse = carrier?.object.inTheHouse ?? false;
  const wishAlreadyOpen = carrier?.wishAlreadyOpen ?? false;

  return {
    medium,
    // **A medium that needs no object needs nothing, and one that does needs the object on
    // the shelf.** It named `digital` by hand until the list of media grew (ADR-0022); the
    // flag says the same thing about digital and about every console at once, and an entry
    // naming no medium at all is one no object carries, which needs nothing either.
    atHand: !goesThroughAnObject || inTheHouse,
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
// talking over the Pile. After that the Binding's own order, which is the order the
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
  // One Story can be asked about twice — wanted *and* standing on a route — and the answer
  // is the same object either way, so the question is asked once.
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

/**
 * **What the tile beside a row is faced with**, in the order the core resolves it.
 *
 * The Story's own image first, then whatever the object carrying the row is faced with, then
 * nothing — the drawn tile, which is the ordinary answer here and not a gap. It is the same
 * order `THE_COVER_IT_IS_FACED_OUT_WITH` writes as SQL for the walls, said in TypeScript
 * because this list is composed rather than selected; two places, one rule, and this comment
 * is the rope between them.
 *
 * A Series entry has no Story, so it reaches the second rung directly: it names an object and
 * not a narrative, and there is nothing to take an image off.
 */
function facedWith(ownImage: string | null | undefined, carrier: Carrier | undefined) {
  if (ownImage) return { url: ownImage, from: "own" } as const;
  return carrier?.object.cover ?? null;
}

/** The owner's own image on each of the Stories asked about, where they set one. */
async function imagesOnStories(storyIds: string[]): Promise<Map<string, string>> {
  const asked = [...new Set(storyIds)];
  if (asked.length === 0) return new Map();

  const rows = await query<{ storyId: string; ownImage: string }>(
    `select s.id::text as "storyId", s.own_image_url as "ownImage"
       from story s
      where s.id = any($1::uuid[]) and s.own_image_url is not null`,
    [asked]
  );

  return new Map(rows.map((row) => [row.storyId, row.ownImage]));
}

/**
 * What the owner pinned, most recently pinned first, in the pin's own vocabulary.
 *
 * The head is exactly this, in exactly this order — a pin is the act of saying *this next*,
 * so the newest one leads.
 */
async function pinnedSubjects(): Promise<PinnedSubject[]> {
  const rows = await query<{
    storyId: string | null;
    seriesId: string | null;
    position: number | null;
  }>(
    `select story_id::text as "storyId", series_id::text as "seriesId", series_position as position
       from pile_pin
      order by pinned_at desc, coalesce(story_id, series_id), series_position`
  );

  // Every row is one subject or the other and the schema is what says so, which is why
  // neither branch invents a value for the half it did not get: a row that were somehow
  // neither is not a pin on anything, and it contributes no entry rather than a pin on the
  // empty string.
  return rows.flatMap<PinnedSubject>((row) => {
    if (row.storyId) return [{ kind: "story", id: row.storyId }];
    if (row.seriesId && row.position !== null) {
      return [{ kind: "series", id: row.seriesId, position: row.position }];
    }
    return [];
  });
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
