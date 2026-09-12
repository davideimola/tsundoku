import "server-only";

import { tint } from "@/lib/tint";

import { query } from "../db.ts";
import { IN_THE_HOUSE, listCollectionWall, type WallVolume } from "./collection.ts";
import type { FacedWith } from "./cover.ts";
import { listMedia } from "./medium.ts";
import { listSeries } from "./series.ts";
import {
  listStoryWall,
  THE_COVER_IT_IS_FACED_OUT_WITH,
  THE_LINE_IT_STANDS_IN,
  type WallStory,
} from "./story.ts";
import {
  type CarriedStory,
  type CoveredInstalments,
  listStoriesInVolumes,
  WHAT_IT_COVERS,
} from "./story-to-volume.ts";
import { listTypes, type Type } from "./type.ts";
import { listOpenWishes } from "./wish.ts";

// **THE SHOWCASE**, which is the one thing the third door answers (ADR-0025).
//
// It is a cross-entity question and it is named after the question rather than after an
// area, for `queries/finder.ts`'s reason: put in `story.ts` it would be a Story query
// reading the shelf, the Types and the Wishes. What it is *not* is a second model. Every
// fact in here is already an answer some screen reads, and this file's whole job is to say
// which of those answers may be seen by somebody who is not the owner, and in what words.
//
// ## What is in it is a Rendering, and what is left out is the decision
//
// There is no per-row `public` flag anywhere in this library and there must not be one: a
// flag is a thing to forget to set, and forgetting it publishes a price. **What is not
// composed here does not exist to the outside.** So prices, acquisitions and the days they
// happened on, the Inbox and its proposals, Paths, Provenance, **the prose of a Rating** and
// the grain it was given in, ISBNs and the owner's own address are absent by construction
// rather than by filtering, and the door's test asserts their absence by name. The prose is
// the sharpest of them: a Rating's words are the owner writing to themselves about a book,
// and a score is the only part of that judgement anybody else was ever meant to read.
//
// ## The vocabulary travels with every row
//
// A Type is data and never an enum (ADR-0006), and the verb is the Type's own (ADR-0021):
// six of the seven are *read* and the one that is not is *played*. Every row that names a
// Type carries the whole Type, so the consumer says *Reading* and *Playing* without
// inferring either from a slug it would have to keep a table of.
//
// ## Composition, and the three statements that are this file's own
//
// Everything here is composed out of queries that already exist. Three things are not,
// because no query answers them, and each is written down rather than bolted onto a
// screen's query:
//
//   1. **the passes the showcase shows.** A screen reads the passes of *one* Story
//      (`findStory`); nothing reads the passes of the library, which is exactly what *what
//      is being read right now* and *what was judged last* are. It spends `story.ts`'s
//      own exported fragments for the line and the jacket, so a tile out here cannot come
//      to wear a different picture from the same tile on the owner's wall. What counts as a
//      judgement is `A_VERDICT_WAS_PASSED`, and it is this file's own sentence too: a score,
//      or having given up.
//   2. **the order the library came in.** The Pile's spines are answered by title, because
//      that is the order the owner reads a wall in; *recently added* is the order a page
//      that changes between visits needs, and it is one column nothing else asks for.
//   3. **where the objects behind a Pile tile stand in their line.** *Which one of the run is
//      this* is a question no wall asks, because the owner reads a tile standing in front of
//      their own shelf; a page somebody else reads has ten tiles carrying one title and
//      nothing else to tell them apart.

/** A Type, as a row of the document wears it: the slug, the word, and the verb. */
export type ShowcaseType = {
  /** The Type's id, which is a slug by constraint: `manga`, `videogame`. */
  slug: string;
  /** What the owner reads on screen: `Manga`, `Videogame`. */
  label: string;
  /**
   * **What going through one of these is called**, in the past: `read`, `played`.
   *
   * The word alone and never the sentence around it, exactly as the Type carries it.
   */
  verb: string;
  /**
   * The same verb in its base form: `read`, `play`.
   *
   * It is here beside `verb` rather than derived from it because it cannot be derived:
   * *read* is its own past and *play* is not, which is why the Type carries two words in
   * the first place (ADR-0021). A consumer heading one block *Reading* and the next one
   * *Playing* builds both off this one, and a consumer naming what happened builds it off
   * the one above.
   */
  verbBase: string;
};

/**
 * The image a tile is faced with, or `null` for the tile the consumer draws itself.
 *
 * **Whose bytes these are is the whole of what `source` says**, and it is the one thing a
 * consumer may not get wrong: a looked-up cover is somebody else's and hotlinked under
 * their terms (ADR-0013), where the owner's own photograph is the owner's. The source's own
 * page for the book travels with a looked-up one, because Google Books asks for a prominent
 * link back to it and a consumer cannot invent that address.
 */
export type ShowcaseCover = {
  url: string;
  source: "looked-up" | "owner";
  /** The source's own page for the book, where it publishes one. `null` for the owner's. */
  at: string | null;
} | null;

/**
 * The line a row stands in, and the colour it wears, or `null` where it stands in none.
 *
 * `null` is the ordinary answer rather than a gap (ADR-0001): a Story read digitally or
 * borrowed is carried by no object, so there is no publisher's line to take a colour from.
 *
 * **The tint is derived and never stored** (`src/lib/tint.ts`), so it is the same colour the
 * owner's own shelf wears and it is the same on every deploy. One of the two grounds travels
 * and it is the dark one, because the page this feeds is dark. A consumer that printed a
 * shelf on paper would want the other, and that is a second field rather than a second door.
 */
export type ShowcaseSeries = { name: string; tint: string } | null;

/**
 * The medium a pass went through, as a pair.
 *
 * A pair for the reason a Type is one: the consumer must never title-case a slug and guess
 * where the capitals fall. `playstation-5` is *PlayStation 5* and no rule over the slug
 * produces that. The label is the Medium vocabulary's own word (ADR-0022), read from the row
 * rather than derived, so a fourth console is an insert here as it is everywhere else.
 */
export type ShowcaseMedium = { slug: string; label: string };

/**
 * How far a pass has got, or `null`.
 *
 * **The unit is the model's own word and is not guessed at.** What a work declares a count
 * of is Instalments (`CONTEXT.md`, ADR-0017), so that is the noun that travels: a run of
 * twenty tankobon is twenty Instalments, and an omnibus holding three of them is one object
 * carrying three, which is exactly why *volumes* would be the wrong word here. A work that
 * declares no count has no honest fraction and answers `null` rather than a ratio with no
 * noun under it.
 */
export type ShowcaseProgress = { reached: number; total: number; unit: string } | null;

/** The one unit this library counts the parts of a work in. It is the model's word. */
export const THE_UNIT_A_WORK_IS_COUNTED_IN = "instalments";

/** The unit a printing is counted in, which is the number standing at the foot of a spine. */
export const THE_UNIT_A_LINE_IS_COUNTED_IN = "volumes";

/**
 * **Which one of a run a row is**, or `null` for something that stands in no run at all.
 *
 * Every row of this document that names a title has this, and it is the one field that makes
 * ten tiles reading *Slam Dunk* into ten different books. The consumer prints the title and
 * this beside it (*Slam Dunk 7*, *Slam Dunk 1-3*), and it must never take a number out of a
 * title string: what is in a title is whatever the owner typed when they catalogued the
 * object, and half the library does not carry one at all.
 *
 * **It is a range because one object can be several parts of a work.** An omnibus holding
 * instalments one to three is a case the model knows about and writes down
 * (`recordVolumeCoversInstalments`), so flattening it to a single number would be the
 * document lying about what is inside a book. A single part is `from` and `to` at the same
 * number, which is one shape for the consumer rather than two.
 *
 * **`unit` says which of two facts the numbers are**, and they are genuinely two:
 *
 *   - `instalments` is the **narrative's** own parts (`CONTEXT.md`, ADR-0017). *Seven of
 *     twenty* stays true however the owner read it, and it is what `progress` counts, so a
 *     page can put the two in one sentence;
 *   - `volumes` is the **printing's**: where the object stands in its line, the number at the
 *     foot of the spine. It is what travels where the work declares no parts: a line whose
 *     published count nobody filled in is silence rather than nought (ADR-0017), and the
 *     nineteenth and twentieth objects of it are still two different books.
 *
 * The unit travels rather than being assumed for `ShowcaseProgress`'s reason: a consumer
 * printing *vol. 7* over a number that counts instalments would be inventing a fact about a
 * printing out of a fact about a work.
 *
 * `null` is the ordinary answer and not a gap: a novel, an omnibus standing in no line, a pass
 * made through no object at all. **A standalone must never grow a decorative 1.**
 */
export type ShowcaseStanding = {
  from: number;
  to: number;
  unit: typeof THE_UNIT_A_WORK_IS_COUNTED_IN | typeof THE_UNIT_A_LINE_IS_COUNTED_IN;
} | null;

/** One act of going through a work, as the showcase shows it. */
export type ShowcasePass = {
  /** The Pass's id, so a consumer can key a list without inventing one. */
  id: string;
  title: string;
  type: ShowcaseType;
  medium: ShowcaseMedium;
  /**
   * The day it began, `YYYY-MM-DD`, or `null`.
   *
   * `null` is ordinary and not a gap: the owner opens a pass from their own screen and
   * leaves the date empty, because *that it is open* is the fact being recorded.
   */
  startedAt: string | null;
  progress: ShowcaseProgress;
  /**
   * **Which one of the run this pass went through**, which `progress` does not say.
   *
   * The two answer different questions and a page wants both: *seven of twenty* is how far the
   * owner got, and this is the object they got there through. A verdict on the eleventh
   * tankobon of a line and a verdict on the twelfth are the same title and the same fraction,
   * and this is the only thing that tells them apart.
   *
   * It is read off the Volume the pass names, so it is `null` wherever there was no object,
   * read digitally, borrowed or played, which is ordinary rather than a gap (`CONTEXT.md`,
   * Pass).
   */
  standsAt: ShowcaseStanding;
  cover: ShowcaseCover;
  series: ShowcaseSeries;
};

/**
 * What the owner thought of it, and **the number alone**.
 *
 * 1 to 10, in half points. Neither the grain the score was given in (ADR-0008) nor the
 * Provenance behind it travels: both are axes about how far the owner's own record can be
 * trusted, which is a question the owner asks of their library and not one a reader of a
 * shelf page is answering. A page that received *coarse* could only either ignore it or
 * print a caveat nobody asked for.
 */
export type ShowcaseRating = { score: number } | null;

/**
 * A pass that concluded **and said something about what it went through**: a verdict.
 *
 * A verdict is a pass carrying a Rating, **or** one that was given up on. The second half is
 * the half that has to be written down: giving up is a judgement and it is the sharpest one
 * this library records, so an abandonment travels for want of a score rather than being
 * dropped for it. A pass that merely stopped, scored by nobody and abandoned by nobody, said
 * nothing and is not here. That is the whole of the rule, and it is applied in the statement
 * below rather than by whoever is rendering: *every concluded pass* is sixty-three rows on the
 * owner's own library and a number that only ever grows, and a page handed all of them would
 * be a log rather than a shelf.
 *
 * **An abandoned one is shown rather than filtered**, which is the other side of the same
 * decision: a library that published only its finishes would be a shelf of somebody else's
 * taste. What was given up on, and at which part, is the most honest row on the page, so
 * `outcome` is carried out loud. The prose of a Rating is deliberately not here: a score is a
 * judgement about a work and the prose is the owner writing to themselves.
 */
export type ShowcaseFinishedPass = ShowcasePass & {
  endedAt: string | null;
  outcome: "finished" | "given-up";
  rating: ShowcaseRating;
};

/** How many of something one Type accounts for. */
export type ShowcaseTypeCount = { type: ShowcaseType; count: number };

/** A work nobody has opened yet, which is the thing this application is named after. */
export type ShowcasePileEntry = {
  id: string;
  title: string;
  type: ShowcaseType;
  /**
   * **Which one of the run is unopened**, read across the objects that carry the narrative.
   *
   * A Pile entry is a Story and a Story has no position of its own, so the answer comes from
   * what carries it: one tankobon standing at seven is *7*, and a work carried by the whole
   * line is the whole span of it. A narrative nobody owns an object of stands nowhere and is
   * `null`, which is the digital half of this library and not a gap (ADR-0001).
   */
  standsAt: ShowcaseStanding;
  cover: ShowcaseCover;
  series: ShowcaseSeries;
};

/**
 * An object on the shelf: the thing itself, and nothing about what it cost or when it came.
 *
 * **The Type is the narrative's and the object is not one**, so it is borrowed across the
 * many-to-many and it is `null` for an object the library holds and no narrative has been
 * named inside yet. That is a gap the library shows rather than a state it refuses, exactly
 * as it is on the owner's own side.
 */
export type ShowcaseShelfVolume = {
  id: string;
  title: string;
  type: ShowcaseType | null;
  /**
   * **Which one of the run this object is**, which is what a wall of a numbered line needs
   * and what a title alone does not say: ten tankobon of one work are ten rows carrying the
   * same words.
   *
   * The parts of the work inside it where the work declares any, and where it declares none
   * the number the object stands at in its line. `null` for a standalone, which is most of a
   * shelf of novels.
   */
  standsAt: ShowcaseStanding;
  cover: ShowcaseCover;
  series: ShowcaseSeries;
};

/** An object the owner means to buy, as a public wishlist shows it: the title, and no more. */
export type ShowcaseWishEntry = {
  id: string;
  title: string;
  type: ShowcaseType | null;
  /** Which one of the run is missing, on the shelf volume's own terms. */
  standsAt: ShowcaseStanding;
  cover: ShowcaseCover;
  series: ShowcaseSeries;
};

/** The whole document, which is one round trip because the consumer is one page. */
export type Showcase = {
  /** When it was composed, ISO 8601 in UTC. What a consumer prints as *as of*. */
  generatedAt: string;
  /** Open passes: started, never concluded. What is in the owner's hands right now. */
  now: ShowcasePass[];
  finished: {
    /**
     * **The real number of verdicts**, over the Types asked for, and not the length of
     * `recent`. The figure beside the sample for the reason `pile.count` is beside its own: a
     * page reading the sample's length would print *12 verdicts* about a reader who has passed
     * forty.
     */
    count: number;
    /**
     * **A sample and not every verdict**: the most recently concluded of them, newest first,
     * capped at `THE_VERDICTS_SHOWN`. Finished and given up, together.
     */
    recent: ShowcaseFinishedPass[];
  };
  pile: {
    /** **The real count**, over the Types asked for, and not the length of `recent`. */
    count: number;
    /** By count, largest first. The consumer renders the order it is given. */
    byType: ShowcaseTypeCount[];
    /**
     * **A sample and not the whole pile**: the most recently catalogued of them, newest
     * first, capped at `THE_PILE_SHOWN`. `count` beside it is the real figure, so the page
     * can say *showing 12 of 31* rather than assuming it holds everything.
     */
    recent: ShowcasePileEntry[];
  };
  shelf: {
    /** **The real count** of objects in the house, over the Types asked for. */
    total: number;
    /** By count, largest first. The consumer renders the order it is given. */
    byType: ShowcaseTypeCount[];
    /**
     * **A sample and not the whole shelf**: the most recently acquired objects first, capped
     * at `THE_SHELF_SHOWN`. `total` beside it is the real figure, so the page can say
     * *showing 60 of 412*.
     *
     * Most recently acquired rather than in the order the shelf stands in, because a wall
     * truncated at sixty in shelf order would be the letter A for ever. Only the **order** is
     * read off the acquisitions; the day itself never leaves the door.
     */
    volumes: ShowcaseShelfVolume[];
  };
  /** Present only where the door was configured to publish a wishlist. Off by default. */
  wish?: ShowcaseWishEntry[];
};

/**
 * How the document is narrowed, which is the one question it takes.
 *
 * `types` is a list of Type slugs and `null` is every Type, which is not the same as an
 * empty list: asking for nothing gets nothing, and that is the honest answer to a consumer
 * that built the parameter wrongly.
 */
export type ShowcaseNarrowing = {
  types?: readonly string[] | null;
  /** Whether to publish the wishlist at all. Off unless the door says otherwise. */
  wishlist?: boolean;
};

/**
 * The answer, or the slugs that are not Types.
 *
 * **An unknown slug refuses rather than narrowing to nothing**, which is the one place this
 * file parts from every wall on the owner's side. A hand-typed `?type=banana` on a screen
 * narrows to an empty wall, because the owner can see the wall is empty and try again; a
 * consumer fetching JSON on a schedule would publish an empty shelf for a week and never
 * learn that a Type had been renamed.
 */
export type ShowcaseAnswer =
  | { ok: true; showcase: Showcase }
  | { ok: false; unknown: readonly string[] };

/**
 * How many verdicts the document carries. `finished.count` beside them is the figure.
 *
 * Twelve rather than everything, because *what was concluded* is the one block with no ceiling
 * in it: the shelf and the pile are as large as a house allows, and a reading history only
 * ever grows. A dozen is what a page shows as *lately*, and anything older than that is a log
 * the owner keeps for themselves.
 */
export const THE_VERDICTS_SHOWN = 12;

/** How many of the Pile's spines the document carries. `pile.count` beside them is the figure. */
export const THE_PILE_SHOWN = 12;

/** How many of the shelf's objects the document carries. `shelf.total` beside them is the figure. */
export const THE_SHELF_SHOWN = 60;

/**
 * The counts by Type, **largest first**, with the vocabulary's own order as the tie-break.
 *
 * An order rather than whatever came back, because the consumer renders what it receives:
 * leaving it to the database would make the page's own reading order an accident of a
 * display column nobody thought about when they inserted a seventh Type.
 */
function byHowMany(counted: ShowcaseTypeCount[]): ShowcaseTypeCount[] {
  return counted.slice().sort((one, other) => other.count - one.count);
}

/**
 * **The showcase**: what is being gone through, what was concluded, what is unopened, and
 * what is on the shelf.
 *
 * One document rather than five resources, because the consumer is one page rebuilt on a
 * schedule and five round trips to a home cluster are five chances to be half down. It is
 * composed rather than queried: see the note at the head of this file for the two statements
 * that are this file's own and why they had to be.
 */
export async function theShowcase(narrowing: ShowcaseNarrowing = {}): Promise<ShowcaseAnswer> {
  const vocabulary = await listTypes();
  const asked = narrowing.types ?? null;

  if (asked) {
    const known = new Set(vocabulary.map((kind) => kind.id));
    const unknown = asked.filter((slug) => !known.has(slug));
    if (unknown.length > 0) return { ok: false, unknown };
  }

  const types = asked ? vocabulary.filter((kind) => asked.includes(kind.id)) : vocabulary;
  // `null` is every Type and an **empty array is none**, which is why the two are not the
  // same argument: a consumer that built `?types=` out of an empty list asked for nothing,
  // and answering with the whole library would be the door publishing more than was asked.
  const narrowedTo = asked === null ? null : types.map((kind) => kind.id);
  const named = new Map(types.map((kind) => [kind.id, asShowcaseType(kind)]));

  const [media, open, verdicts, howManyVerdicts, spines, cameIn, shelf, wish] = await Promise.all([
    listMedia(),
    passesOpen(narrowedTo),
    theVerdicts(narrowedTo),
    howManyVerdictsThereAre(narrowedTo),
    Promise.all(types.map((kind) => theUnopened(kind.id))),
    theOrderTheLibraryCameIn(),
    theShelf(named, asked !== null),
    narrowing.wishlist ? theWishlist(named, asked !== null) : Promise.resolve(undefined),
  ]);

  // The Medium vocabulary, so a pass carries *PlayStation 5* rather than a slug the consumer
  // would have to title-case. Read once for the whole document rather than joined onto every
  // pass: it is five rows and it is the same five for all of them.
  const spoken = new Map(media.map((carrier) => [carrier.id, carrier.name]));

  const pile = spines.flat();
  const byWhenItCameIn = new Map(cameIn.map((id, at) => [id, at]));

  // The dozen spines the document carries, chosen before their standing is asked for: it is a
  // question about the sample rather than about the Pile, and asking it of four hundred works
  // to publish twelve would be the cap paid for and thrown away.
  const spinesShown = pile
    .slice()
    .sort(
      (one, other) =>
        (byWhenItCameIn.get(one.id) ?? Number.MAX_SAFE_INTEGER) -
        (byWhenItCameIn.get(other.id) ?? Number.MAX_SAFE_INTEGER)
    )
    .slice(0, THE_PILE_SHOWN);
  const standing = await whereTheirObjectsStand(spinesShown.map((spine) => spine.id));

  return {
    ok: true,
    showcase: {
      generatedAt: new Date().toISOString(),
      now: open.map((row) => asPass(row, named, spoken)),
      finished: {
        count: howManyVerdicts,
        recent: verdicts.map((row) => asFinishedPass(row, named, spoken)),
      },
      pile: {
        count: pile.length,
        byType: byHowMany(
          types.map((kind, at) => ({ type: asShowcaseType(kind), count: spines[at].length }))
        ),
        recent: spinesShown.map((spine) => asPileEntry(spine, named, standing)),
      },
      shelf,
      ...(wish ? { wish } : {}),
    },
  };
}

// ── The two statements this file owns ─────────────────────────────────────────

// **The passes the showcase shows**, and the only SQL here that is not somebody else's.
//
// It reads the pass table across the whole library, which nothing else does: a screen asks
// for the passes of the Story in front of it (`findStory`), and the Pile asks where a run
// stands without ever naming the act. *What is being read right now* is the question with no
// screen behind it, because on the owner's side it is answered by looking at the sofa.
//
// The line and the jacket are `story.ts`'s own exported fragments rather than a second copy,
// under the rule that file exports them by: a tile that wore one picture on the owner's wall
// and another out here would be the library disagreeing with itself in public. Both name the
// Story `s`, so this statement joins `story s`.
//
// The Rating is the pass's own and carries **one field out of five**: the score. The prose,
// the Provenance and the grain it was given in never leave this door, and the prose is the
// one that would be a breach rather than a leak: it is the owner writing to themselves.
// **The object a pass went through**, as the two numbers a standing is made of.
//
// A Pass names the Volume it was made through where there was one (`CONTEXT.md`, Pass), and
// that object is the whole of what tells a verdict on volume eleven from a verdict on volume
// twelve: the title is the same on both and so is the fraction. It answers `null` for a pass
// through no object, which is the digital and the borrowed half of this library.
//
// The link to the Story is joined **left**, because an object can be named by a pass and carry
// nothing in the catalogue yet, which is a gap the library shows rather than a state it
// refuses (`CONTEXT.md`, Volume). The range then falls to the position the object stands at, which is
// exactly what `WHAT_IT_COVERS` does with an unwritten one.
const THROUGH_WHICH_OBJECT = `(
    select jsonb_build_object('covers', ${WHAT_IT_COVERS}, 'standsAt', v.series_number)
      from volume v
      left join volume_story vs on vs.volume_id = v.id and vs.story_id = s.id
     where v.id = r.volume_id
  )`;

const THE_PASS_AS_THE_SHOWCASE_SHOWS_IT = `
    r.id,
    s.title,
    s.type_id                         as "typeSlug",
    r.medium,
    r.started_on::text                as "startedAt",
    r.ended_on::text                  as "endedAt",
    r.outcome,
    r.at_instalment                   as reached,
    s.instalments                     as total,
    ${THROUGH_WHICH_OBJECT}           as through,
    ${THE_LINE_IT_STANDS_IN}          as series,
    ${THE_COVER_IT_IS_FACED_OUT_WITH} as cover,
    (select jsonb_build_object('score', g.score::float8)
       from rating g
      where g.pass_id = r.id)         as rating
  from pass r
  join story s on s.id = r.story_id`;

// The Types asked for, as one parameter. `null` is every Type rather than none, which is
// what lets the whole document be narrowed by one argument instead of by a branch per block.
const OF_THE_TYPES_ASKED = `($1::text[] is null or s.type_id = any ($1))`;

type PassRow = {
  id: string;
  title: string;
  typeSlug: string;
  medium: string;
  startedAt: string | null;
  endedAt: string | null;
  outcome: "finished" | "abandoned" | null;
  reached: number | null;
  total: number | null;
  through: StandingObject | null;
  series: { id: string; name: string } | null;
  cover: FacedWith | null;
  rating: { score: number } | null;
};

/**
 * The open passes: started, never concluded.
 *
 * Newest first by the day it began, and a pass nobody wrote a day for after the ones with
 * one. That is the order a Story's own page reads its passes in, and for the same reason:
 * leaving the date empty is ordinary, and ordering by the day alone would drop the book in
 * the owner's hands under one opened in 2019.
 */
async function passesOpen(types: readonly string[] | null): Promise<PassRow[]> {
  return query<PassRow>(
    `select ${THE_PASS_AS_THE_SHOWCASE_SHOWS_IT}
      where r.outcome is null
        and ${OF_THE_TYPES_ASKED}
      order by r.started_on desc nulls last, r.created_at desc`,
    [types]
  );
}

// **What makes a concluded pass a verdict**, written once and spent by both statements below,
// so the sample and the figure beside it can never come to mean two different things.
//
// A score, or having given up. The second half is not a concession to rows with missing data:
// an abandonment *is* the judgement, and the page this feeds leans on exactly that, so it
// cannot be dropped for want of a number. What falls out is the pass that ended with nothing
// said about it, which is most of a library typed in from a shelf.
const A_VERDICT_WAS_PASSED = `r.outcome is not null
        and (r.outcome = 'abandoned'
             or exists (select 1 from rating g where g.pass_id = r.id))`;

/**
 * The verdicts, most recently concluded first, and **a sample**.
 *
 * Capped here rather than by the consumer, under the rule the rest of `src/core` is written
 * by: the block is the most recent dozen, so the statement asks for a dozen instead of reading
 * a history that only grows and throwing most of it away. `howManyVerdictsThereAre` beside it
 * is what makes the sample honest.
 *
 * One that has no day recorded comes after the ones that do, so an import full of dateless
 * acts cannot crowd out the history that has dates.
 */
async function theVerdicts(types: readonly string[] | null): Promise<PassRow[]> {
  return query<PassRow>(
    `select ${THE_PASS_AS_THE_SHOWCASE_SHOWS_IT}
      where ${A_VERDICT_WAS_PASSED}
        and ${OF_THE_TYPES_ASKED}
      order by r.ended_on desc nulls last, r.created_at desc
      limit ${THE_VERDICTS_SHOWN}`,
    [types]
  );
}

/**
 * How many verdicts there are, which the sample cannot say once it is capped.
 *
 * A statement of its own rather than a window function over the one above, for what it costs
 * to read: a count over the pass table is cheap where a second copy of the composed row is
 * not, and the two travel in the same `Promise.all` so it is not a second round trip in wall
 * time either.
 */
async function howManyVerdictsThereAre(types: readonly string[] | null): Promise<number> {
  const [counted] = await query<{ verdicts: number }>(
    `select count(*)::int as verdicts
       from pass r
       join story s on s.id = r.story_id
      where ${A_VERDICT_WAS_PASSED}
        and ${OF_THE_TYPES_ASKED}`,
    [types]
  );
  return counted?.verdicts ?? 0;
}

/**
 * **The order the library came in**: every Story's id, most recently catalogued first.
 *
 * The Pile's spines come back by title, which is the order a wall is read in and the order
 * `listStoryWall` is right to answer in. A page somebody visits twice wants the other one,
 * and *recently added* is one column nothing else in this repository asks for, so it is a
 * list of ids rather than a second wall: the tiles are the wall's, and this only says where
 * each of them stands in time.
 */
/**
 * **The order the shelf came home in**: every object in the house, most recently acquired
 * first.
 *
 * The Collection wall stands in the order a shelf stands in, which is the right answer for
 * somebody looking at a shelf and the wrong one for a sample: truncated at sixty it would be
 * the letter A for ever. So the sample is ordered by the acquisition that is still open, and
 * **only the order leaves**: the day itself is one of the facts this door exists to keep in.
 *
 * An object whose acquisition carries no day comes last, not first. A Volume owned since
 * before any of this was written down has no receipt, and being undated is not being new.
 */
async function theOrderTheShelfCameHomeIn(): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `select v.id
       from volume v
      where ${IN_THE_HOUSE}
      order by (select max(a.acquired_on)
                  from acquisition a
                 where a.volume_id = v.id and a.released_on is null) desc nulls last,
               v.id`
  );
  return rows.map((row) => row.id);
}

async function theOrderTheLibraryCameIn(): Promise<string[]> {
  const rows = await query<{ id: string }>(
    "select s.id from story s order by s.created_at desc, s.id"
  );
  return rows.map((row) => row.id);
}

// ── Which one of a run a row is ───────────────────────────────────────────────

// **One rule, in one place, spent by all four blocks** (ADR-0025). A standing is worked
// out from an *object*, because there is nowhere else in this model to get one: a narrative
// has no position, and a printing's numbering belongs to the Volume.
//
// The two numbers it is made of are the two facts, in the order they are true:
//
//   1. **what the object covers of the work**, which is `WHAT_IT_COVERS` and is therefore the
//      same answer the owner's own screens give: the written range of an omnibus first, and
//      failing that the position followed from the line, which is how a tankobon covers its
//      own instalment without anybody typing anything (#37);
//   2. **where the object stands in its line**, which is all there is where the work declares
//      no parts. A line whose published count nobody filled in says nothing about the
//      narrative (ADR-0017), and the nineteenth and twentieth objects of it are still two
//      different books.
//
// Nothing is derived from a title here and nothing ever may be: what is in a title is whatever
// the owner typed, and reading a number out of it would publish a guess as a fact.

/** The two numbers a standing is read from, as one object carries them. */
type StandingObject = { covers: CoveredInstalments | null; standsAt: number | null };

/**
 * The standing of one row, over the objects behind it.
 *
 * Several objects because a narrative can be carried by a whole line: the span of what they
 * cover is the honest answer for a work whose twenty tankobon are all on the shelf, and the
 * single part is that span with one object in it. Objects that say nothing are ignored rather
 * than collapsing the answer, so a run with one unplaced volume in it still says where the
 * rest of it stands.
 */
function theStanding(objects: readonly StandingObject[]): ShowcaseStanding {
  const covered = objects.map((held) => held.covers).filter((range) => range !== null);
  if (covered.length > 0) {
    return {
      from: Math.min(...covered.map((range) => range.from)),
      to: Math.max(...covered.map((range) => range.to)),
      unit: THE_UNIT_A_WORK_IS_COUNTED_IN,
    };
  }

  const placed = objects.map((held) => held.standsAt).filter((at) => at !== null);
  if (placed.length === 0) return null;

  return {
    from: Math.min(...placed),
    to: Math.max(...placed),
    unit: THE_UNIT_A_LINE_IS_COUNTED_IN,
  };
}

/**
 * **Where the objects carrying each of these Stories stand**, keyed by Story id.
 *
 * The third statement this file owns, and it is here for the second one's reason: the walls
 * answer with tiles, and *which one of the run is this* is a question no wall asks, because
 * the owner is looking at their own shelf while they read one. `WHAT_IT_COVERS` is spent
 * rather than copied, so a Pile tile out here and the Story's own page cannot come to disagree
 * about what an object holds.
 *
 * Asked of the dozen spines the document actually carries rather than of the whole Pile: it is
 * the sample that is published, and the count beside it is a count.
 */
async function whereTheirObjectsStand(
  storyIds: readonly string[]
): Promise<Map<string, ShowcaseStanding>> {
  if (storyIds.length === 0) return new Map();

  const rows = await query<{ storyId: string; objects: StandingObject[] }>(
    `select vs.story_id as "storyId",
            jsonb_agg(
              jsonb_build_object('covers', ${WHAT_IT_COVERS}, 'standsAt', v.series_number)
            ) as objects
       from volume_story vs
       join volume v on v.id = vs.volume_id
       join story  s on s.id = vs.story_id
      where vs.story_id = any ($1::uuid[])
      group by vs.story_id`,
    [storyIds]
  );

  return new Map(rows.map((row) => [row.storyId, theStanding(row.objects)]));
}

// ── The blocks, each composed out of a query that already exists ──────────────

/**
 * The unopened works of one Type, which is `listStoryWall` narrowed the way every wall is.
 *
 * Asked per Type rather than once and counted afterwards, because the filter is the query's
 * argument here as it is on every screen: the count in `byType` is what came back rather
 * than a pass over an answer, so it cannot drift from the rows beside it.
 */
async function theUnopened(typeId: string): Promise<WallStory[]> {
  return listStoryWall({ state: "to-read", typeId });
}

/**
 * The shelf: the objects in the house, in the order they stand in, each carrying its Type.
 *
 * **Two round trips and one stated exception to the filter rule.** The wall is read whole
 * and narrowed here rather than per Type, and the reason is the shape of this particular
 * answer: an object has no Type of its own (a Type is what a *work* is), so the Types on the
 * shelf are the Types of the narratives inside the objects, which is `listStoriesInVolumes`
 * asked once for the whole wall. Reading the wall once per Type would give a Volume holding
 * three works three tiles, or force a merge of seven ordered lists into one, and neither is
 * a shelf. The rule that filtering belongs in the query exists so a screen showing four rows
 * does not read seventy-seven; here every row is being published, so there is nothing
 * unread.
 */
async function theShelf(
  named: Map<string, ShowcaseType>,
  narrowed: boolean
): Promise<Showcase["shelf"]> {
  const wall = await listCollectionWall();
  const [held, cameHome] = await Promise.all([
    listStoriesInVolumes(wall.map((volume) => volume.id)),
    theOrderTheShelfCameHomeIn(),
  ]);

  /** The Types inside one object, in the vocabulary's own order and each of them once. */
  const typesInside = (volume: WallVolume): ShowcaseType[] => {
    const inside = new Set((held[volume.id] ?? []).map((story) => story.type.id));
    return [...named.values()].filter((type) => inside.has(type.slug));
  };

  // An object holding a work of no asked Type is not on this shelf; one holding nothing at
  // all is on the whole shelf and off every narrowed one, because it answers no question
  // about a Type.
  const standing = wall
    .map((volume) => ({ volume, types: typesInside(volume) }))
    .filter(({ types }) => !narrowed || types.length > 0);

  const byWhenItCameHome = new Map(cameHome.map((id, at) => [id, at]));
  const volumes = standing
    .slice()
    .sort(
      (one, other) =>
        (byWhenItCameHome.get(one.volume.id) ?? Number.MAX_SAFE_INTEGER) -
        (byWhenItCameHome.get(other.volume.id) ?? Number.MAX_SAFE_INTEGER)
    )
    .slice(0, THE_SHELF_SHOWN)
    .map(({ volume, types }) => asShelfVolume(volume, types[0] ?? null, held[volume.id] ?? []));

  const counted = new Map([...named.keys()].map((slug) => [slug, 0]));
  for (const volume of wall) {
    for (const kind of typesInside(volume)) {
      counted.set(kind.slug, (counted.get(kind.slug) ?? 0) + 1);
    }
  }

  return {
    // **The real count, not the length of the sample**, which is the whole reason the two
    // fields are beside each other: a page that read `volumes.length` as the size of the
    // shelf would print *60 books* about a library of four hundred.
    total: standing.length,
    byType: byHowMany(
      [...named.values()].map((type) => ({ type, count: counted.get(type.slug) ?? 0 }))
    ),
    volumes,
  };
}

/**
 * The wishlist, which is off unless the door was configured to publish it.
 *
 * Titles and tiles, and not one of the four numbers the owner's own shopping list is made
 * of: what something should cost, what it costs, where, and when it is meant to be bought
 * are the owner's plans and not the library's contents. It is here at all because a fork may
 * reasonably want a public wishlist, and a block that has to be invented later is a block
 * whose shape nobody agreed on.
 */
async function theWishlist(
  named: Map<string, ShowcaseType>,
  narrowed: boolean
): Promise<ShowcaseWishEntry[]> {
  const wishes = await listOpenWishes();
  const [held, declared] = await Promise.all([
    listStoriesInVolumes(wishes.map((wish) => wish.volume.id)),
    // A Wish carries the line its object stands in as an id rather than as a name, because
    // the list it was written for draws a spine and a spine is a colour and a number. The
    // name is the ledger's, so it is read from the ledger rather than restated here.
    listSeries(),
  ]);
  const lines = new Map(declared.map((ledger) => [ledger.id, ledger.name]));

  return wishes
    .map((wish) => {
      const inside = new Set((held[wish.volume.id] ?? []).map((story) => story.type.id));
      return { wish, type: [...named.values()].find((type) => inside.has(type.slug)) ?? null };
    })
    .filter(({ type }) => !narrowed || type !== null)
    .map(({ wish, type }) => ({
      id: wish.volume.id,
      title: wish.volume.title,
      type,
      standsAt: standingOfAnObject(wish.volume.seriesNumber, held[wish.volume.id] ?? []),
      cover: asCover(wish.volume.cover),
      series: asSeries(
        wish.volume.seriesId
          ? { id: wish.volume.seriesId, name: lines.get(wish.volume.seriesId) ?? "" }
          : null
      ),
    }));
}

// ── Turning an answer the owner reads into a row the outside reads ────────────

function asShowcaseType(kind: Type): ShowcaseType {
  return { slug: kind.id, label: kind.name, verb: kind.verbPast, verbBase: kind.verbBase };
}

/**
 * The jacket, with whose bytes they are said in one word.
 *
 * `own` on the record becomes `owner` out here and every source name becomes `looked-up`,
 * because the distinction a consumer has to act on is *may I treat this as ours* and not
 * *which of two catalogues answered*. Naming the source would also publish which third party
 * this library asks, which is nobody's business on a shelf page.
 */
function asCover(faced: FacedWith | null | undefined): ShowcaseCover {
  if (!faced) return null;
  const owned = faced.from === "own";
  return {
    url: faced.url,
    source: owned ? "owner" : "looked-up",
    at: owned ? null : (faced.at ?? null),
  };
}

function asSeries(line: { id: string; name: string } | null | undefined): ShowcaseSeries {
  if (!line) return null;
  const colour = tint(line.id);
  return colour ? { name: line.name, tint: colour.dark } : null;
}

/**
 * How far a pass got, or `null`.
 *
 * Both halves have to be there for the fraction to mean anything: a work that declares no
 * parts has no denominator, and a pass that has finished none of them is nought of twenty
 * rather than nothing at all.
 */
function asProgress(reached: number | null, total: number | null): ShowcaseProgress {
  if (total === null) return null;
  return { reached: reached ?? 0, total, unit: THE_UNIT_A_WORK_IS_COUNTED_IN };
}

/**
 * The medium, as a slug and the vocabulary's own word for it.
 *
 * A medium nobody has a row for falls back to its own slug rather than to a blank: it cannot
 * happen (a Pass's medium is a foreign key) and answering with nothing would be the page
 * printing an empty chip if it ever did.
 */
function asMedium(slug: string, spoken: Map<string, string>): ShowcaseMedium {
  return { slug, label: spoken.get(slug) ?? slug };
}

function asPass(
  row: PassRow,
  named: Map<string, ShowcaseType>,
  spoken: Map<string, string>
): ShowcasePass {
  const type = named.get(row.typeSlug);
  if (!type) throw new Error(`the showcase met a Type it did not ask for: ${row.typeSlug}`);

  return {
    id: row.id,
    title: row.title,
    type,
    medium: asMedium(row.medium, spoken),
    startedAt: row.startedAt,
    progress: asProgress(row.reached, row.total),
    standsAt: theStanding(row.through ? [row.through] : []),
    cover: asCover(row.cover),
    series: asSeries(row.series),
  };
}

/**
 * A concluded pass, with `abandoned` said as `given-up`.
 *
 * The record's word is the owner's and the document's word is the reader's. *Abandoned* is
 * what the model calls the act because that is what the owner pressed; on a page somebody
 * else reads, *given up* is the same fact without the verdict.
 */
function asFinishedPass(
  row: PassRow,
  named: Map<string, ShowcaseType>,
  spoken: Map<string, string>
): ShowcaseFinishedPass {
  return {
    ...asPass(row, named, spoken),
    endedAt: row.endedAt,
    outcome: row.outcome === "abandoned" ? "given-up" : "finished",
    rating: row.rating ? { score: row.rating.score } : null,
  };
}

function asPileEntry(
  spine: WallStory,
  named: Map<string, ShowcaseType>,
  standing: Map<string, ShowcaseStanding>
): ShowcasePileEntry {
  const type = named.get(spine.type.id);
  if (!type) throw new Error(`the showcase met a Type it did not ask for: ${spine.type.id}`);

  return {
    id: spine.id,
    title: spine.title,
    type,
    standsAt: standing.get(spine.id) ?? null,
    cover: asCover(spine.cover),
    series: asSeries(spine.series),
  };
}

function asShelfVolume(
  volume: WallVolume,
  type: ShowcaseType | null,
  inside: readonly CarriedStory[]
): ShowcaseShelfVolume {
  return {
    id: volume.id,
    title: volume.title,
    type,
    standsAt: standingOfAnObject(volume.seriesNumber, inside),
    cover: asCover(volume.cover),
    series: asSeries(volume.series),
  };
}

/**
 * The standing of one object, out of what the shelf already read about it.
 *
 * An object holding three narratives has three answers to *what do you cover*, and the span of
 * them is the honest one: *L'uomo che ride* holds three tales and covers all three. Where none
 * of them is numbered, which is most of a shelf, what is left is where the object stands in
 * its line, and where it stands in none there is nothing to say.
 *
 * The position is handed over on its own as well as with each narrative, so an object carrying
 * nothing at all still says where it stands: that gap is one the library shows rather than a
 * state it refuses, and an unnamed twelfth tankobon is still the twelfth.
 */
function standingOfAnObject(
  seriesNumber: number | null,
  inside: readonly CarriedStory[]
): ShowcaseStanding {
  return theStanding([
    { covers: null, standsAt: seriesNumber },
    ...inside.map((story) => ({ covers: story.covers, standsAt: seriesNumber })),
  ]);
}
