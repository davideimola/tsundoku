import "server-only";

import { query } from "../db.ts";
import type { RatingScale } from "../verbs/rating.ts";
import type { Medium, Outcome } from "../verbs/reading.ts";
import { WHY_A_STORY_STANDS } from "../verbs/story.ts";
import { THE_ORDER_A_RUN_OF_OBJECTS_STANDS_IN } from "./collection.ts";
import { type FacedWith, THE_COVER_IT_IS_FACED_WITH } from "./cover.ts";

// What the owner and an external reader ask about a Story.
//
// The interesting thing in this file is that **a Story's state is not in it**. The
// sheets kept a `Stato lettura` column and it was wrong the moment a reread began;
// here the state is an expression over the Readings, computed on the way out, and there
// is nowhere it could be stored inconsistently. That is the shape every derivation in
// this repo takes (README, "The schema").

/**
 * Where the owner is with a Story, derived from its Readings and stored nowhere.
 *
 * A literal union rather than a data row, unlike Type and Provenance: these four are not
 * a vocabulary that could grow by an insert. They are the four cases the expression
 * below can produce, and a fifth would be a change to the derivation.
 */
export type StoryState = "to-read" | "reading" | "read" | "abandoned";

/**
 * The derivation, written once and used by every query that asks where the owner is with
 * a Story — in this file, and in `queries/path.ts`, where "the next **unread** Story of
 * an active Path" is `= 'to-read'` over this expression rather than a column of its own.
 *
 * Exported as SQL because there is only one right place for these four branches, and a
 * second copy of them would be a second answer. The fragment names the Story `s`, so a
 * statement using it joins `story s`.
 *
 * The order of the branches is the judgement in it: **an open Reading wins over a
 * finished one**, so a Story being reread reads `reading` and an assistant does not
 * recommend what is currently in the owner's hands (user story 33). A finished Reading
 * then wins over an abandoned one, because having given up in 2019 and finished it in
 * 2024 means the owner has read it.
 */
export const STORY_STATE = `
  case
    when not exists (select 1 from reading r where r.story_id = s.id)
      then 'to-read'
    when exists (select 1 from reading r where r.story_id = s.id and r.outcome is null)
      then 'reading'
    when exists (select 1 from reading r where r.story_id = s.id and r.outcome = 'finished')
      then 'read'
    else 'abandoned'
  end`;

// How far the pass the owner is on has got, in the work's own units.
//
// **The pass is picked the way the stack is ordered** — an open Reading first, then the
// newest by the day it began — because that is the one the owner is in the middle of, and
// `stories/readings.ts` finds the same one for the same reason. A second order here would be
// the page and the sentence disagreeing about which reading is *now*.
//
// Exported as SQL under the rule `STORY_STATE` is exported under: there is one right place
// for the pick, and the Reading list asking *what comes next in this run* must ask it the
// same way. It names the Story `s`, so a statement spending it joins `story s`.
export const THE_INSTALMENT_THE_CURRENT_PASS_REACHED = `
  (select r.at_instalment
     from reading r
    where r.story_id = s.id
    order by (r.outcome is null) desc, r.started_on desc nulls last, r.created_at desc
    limit 1)`;

// *Seven of twenty*, or nothing at all.
//
// **Two ways to have no fraction, and both are ordinary.** A work that declares no Instalments
// has none to be in, which is most Stories; and a work nobody has opened is not *at nought*,
// because how far it got is a fact about a **pass** and there is no pass — so the count is read
// on its own and no screen has to invent a denominator or a numerator.
//
// What *is* `0 of 20` is the third case: a pass that has been opened and has finished none of
// it. Nothing read is a measurement where *nobody is reading it* is not one, which is the
// distinction `figureOf` already makes between an absence and a zero.
const HOW_FAR_IT_GOT = `
  case
    when s.instalments is null then null
    when not exists (select 1 from reading r where r.story_id = s.id) then null
    else jsonb_build_object(
      'atInstalment', coalesce(${THE_INSTALMENT_THE_CURRENT_PASS_REACHED}, 0),
      'instalments', s.instalments
    )
  end`;

/** A Type, as a Story carries it. */
export type StoryType = { id: string; name: string };

/**
 * A Credit on a Story: a person's contribution in a named role.
 *
 * Part of the Story rather than a query of its own, because *who wrote it and who drew
 * it* is part of the answer to *"what is this?"* — for the owner and for an assistant
 * reading a Story over MCP. The other direction, *everything read by one person*, is a
 * screen of its own in `queries/credit.ts`.
 */
export type StoryCredit = {
  id: string;
  person: { id: string; name: string };
  role: { id: string; name: string };
};

/** A Provenance, as a Reading or a Rating carries it. */
export type StoryProvenance = { id: string; name: string };

/** The owner's judgement of a Story. Never of an object (ADR-0001). */
export type StoryRating = {
  id: string;
  /** 1 to 10, in half points. */
  score: number;
  prose: string | null;
  /**
   * Where this judgement came from, and how far it can be trusted. **Origin only**: how
   * coarse the score is, is the other axis below (ADR-0008).
   */
  provenance: StoryProvenance;
  /**
   * The grain the owner gave it in. `coarse` is a score given out of 5 and doubled onto
   * this scale — the judgement is theirs, the precision is not — and it travels beside the
   * Provenance rather than inside it, so an assistant can read *coarse, and remembered*.
   */
  scale: RatingScale;
};

/** One act of reading, with the judgement it carried. */
export type StoryReading = {
  id: string;
  medium: Medium;
  /**
   * The last **Instalment** this pass finished, or `null` where nobody counted.
   *
   * On the pass and never on the Story, because how far you got is a fact about an event
   * (`CONTEXT.md`). It is what makes reading half a run in singles and half in a deluxe
   * line one number, and what lets a reread start again at nothing without the pass before
   * it forgetting where it reached.
   */
  atInstalment: number | null;
  /** `null` while the Reading is still open, which is what makes the Story `reading`. */
  outcome: Outcome | null;
  /** `YYYY-MM-DD`, or `null` where the owner only knows that it happened. */
  startedOn: string | null;
  endedOn: string | null;
  provenance: StoryProvenance;
  rating: StoryRating | null;
};

/**
 * *Seven of twenty*, as the Story answers it.
 *
 * Derived from the pass the owner is on and the count the work declares, and stored
 * nowhere — the same posture `StoryState` takes, and for the same reason: a stored number
 * is a number that is wrong the moment a reread begins.
 */
export type HowFarItGot = {
  /** The last Instalment the current pass finished. Nought where it has finished none. */
  atInstalment: number;
  /** How many the work has, which is what makes the sentence a fraction. */
  instalments: number;
};

/** One Story, with everything the screen and the MCP tool show about it. */
export type Story = {
  id: string;
  title: string;
  type: StoryType;
  state: StoryState;
  /**
   * How many **Instalments** the work has, or `null` where it was not serialized — which is
   * the ordinary case and asks nothing of anybody.
   */
  instalments: number | null;
  /**
   * *Seven of twenty*, or `null` where the work declares no Instalments — and `null` too where
   * nobody has opened it, because how far it got is a fact about a **pass**.
   *
   * It is the **current pass's** number rather than the furthest any pass ever reached: the
   * question this answers is *where am I*, and a run given up at nine in 2019 and started
   * again last week is at one.
   */
  howFarItGot: HowFarItGot | null;
  /** Who wrote it and who drew it, in the order roles are credited in. */
  credits: StoryCredit[];
  /** Newest first. Several is the ordinary case, because rereading is. */
  readings: StoryReading[];
  /** Judgements attached to no Reading — a score imported with no act to point at. */
  standaloneRatings: StoryRating[];
};

/**
 * The line a Story stands in, as the tile on the wall wears it.
 *
 * A Story does not have a Series — objects do (ADR-0001) — so this is derived across the
 * many-to-many: the Series of the Volumes that carry it. `null` is the ordinary answer and
 * not a gap, because a Story read digitally or borrowed is carried by no object at all.
 */
export type WallSeries = { id: string; name: string; editionLine: string | null };

/**
 * The score the owner set most recently, written once.
 *
 * Three readers ask for it — the index an assistant reads, the wall the owner looks at, and
 * the foot of the tile a Story's own page draws (#29) — and
 * a second copy of these five lines would be a second answer to *what did I think of this*.
 * The same rule `STORY_STATE` is exported under, for the same reason. It names the Story
 * `s`, so a statement using it joins `story s`.
 */
const LATEST_SCORE = `
  (select g.score::float8
     from rating g
    where g.story_id = s.id
    order by g.set_at desc
    limit 1)`;

// **The two facts a Story borrows, and they are borrowed three times each now.**
//
// A Story has no Series and no ISBN of its own, because a Story is not an object
// (ADR-0001) — so the line it stands in and the jacket it is faced with are the *Volumes'*,
// reached across the many-to-many. Both are read by the wall, which faces seventy-seven
// tiles outwards, by the Story's own page, which draws the one tile the owner tapped to
// get there (#29), and by a person's body of work, which is a wall of the same tiles split
// by the role they held on each (`queries/credit.ts`, #31). Written once for that reason: a
// tile that changed colour or changed picture on the way in would be the wall lying about
// where it led.
//
// Exported for the third reader rather than copied into it, under the rule `STORY_STATE` is
// exported under: there is one right place for the pick, and a second copy of it is a second
// answer to *which jacket does this narrative wear*. Both fragments name the Story `s`, so a
// statement spending one joins `story s`.

// Which line a Story stands in, when it stands in more than one.
//
// *Fullmetal Alchemist* runs in the standard printing and in the Ultimate Deluxe Edition,
// and a tile has one colour — so one is picked, and **the pick is total**: name, then
// edition with the standard printing first, then id. That is the order `queries/series.ts`
// reads two Series of one name in, and the id at the end is what makes it a tie-break
// rather than a preference of the planner's. A colour that depended on which row Postgres
// reached first would be a shelf that repainted itself between two page loads.
export const THE_LINE_IT_STANDS_IN = `
  (select jsonb_build_object('id', se.id, 'name', se.name, 'editionLine', se.edition_line)
     from volume_story vs
     join volume v  on v.id = vs.volume_id
     join series se on se.id = v.series_id
    where vs.story_id = s.id
    order by lower(se.name), se.edition_line nulls first, se.id
    limit 1)`;

// Which of a Story's Volumes lends it a jacket, when several could.
//
// **A Story has no cover of its own, because a Story is not an object** (ADR-0001). *Slam
// Dunk* is one narrative across twenty tankōbon, and the picture a shelf shows for it is the
// first of them — which is what a bookshop does, and what the owner would point at. So the
// borrowing is: the Volumes carrying this Story, in the order they stand on the shelf, and
// the first one that is faced with anything.
//
// **The pick is total**, like the line it stands in above, and it is the order the Story's own
// page stands those same objects up in — one fragment, in `queries/collection.ts`, because a
// jacket picked in one order beside a shelf drawn in another would be a page disagreeing with
// itself.
export const THE_COVER_IT_IS_FACED_OUT_WITH = `
  (select ${THE_COVER_IT_IS_FACED_WITH}
     from volume_story vs
     join volume v on v.id = vs.volume_id
    where vs.story_id = s.id
      and (v.own_image_url is not null or v.cover_url is not null)
    ${THE_ORDER_A_RUN_OF_OBJECTS_STANDS_IN}
    limit 1)`;

// The Rating shape, as a subquery builds it. `score` leaves as a double rather than as
// `numeric`, which the driver would hand over as a string.
const RATING = `
  jsonb_build_object(
    'id', g.id,
    'score', g.score::float8,
    'prose', g.prose,
    'provenance', jsonb_build_object('id', gp.id, 'name', gp.name),
    'scale', g.scale
  )`;

/**
 * One Story with its Readings, each carrying the Rating it carried, and the judgements
 * that point at no Reading. `null` when there is no such Story.
 *
 * One statement rather than one per list: the Readings and the Ratings are the answer to
 * the same question, and reading them in three round trips would be reading three
 * different moments.
 */
// The whole of a Story, written once. Two questions ask for it — *show me this one* and
// *what have I read* — and they differ only in the `where`, so the shape and the
// derivation live here rather than in each of them.
//
// The select list and the `from` are two constants rather than one because a third reader
// arrived that wants **more** than this shape: the Story's own page draws the tile the owner
// tapped, so it asks for the line and the jacket as well (`findStory`). Splitting the
// statement is what lets it add two columns without the corpus an assistant recommends from
// growing a jacket URL it has no use for.
const STORY_COLUMNS = `
    s.id,
    s.title,
    jsonb_build_object('id', t.id, 'name', t.name) as type,
    ${STORY_STATE} as state,
    s.instalments,
    ${HOW_FAR_IT_GOT} as "howFarItGot",
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'person', jsonb_build_object('id', pe.id, 'name', pe.name),
          'role', jsonb_build_object('id', cr.id, 'name', cr.name)
        )
        order by cr.display_order, lower(pe.name), c.id
      )
        from credit c
        join person pe on pe.id = c.person_id
        join credit_role cr on cr.id = c.role_id
       where c.story_id = s.id
    ), '[]'::jsonb) as credits,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'medium', r.medium,
          'outcome', r.outcome,
          'atInstalment', r.at_instalment,
          'startedOn', r.started_on::text,
          'endedOn', r.ended_on::text,
          'provenance', jsonb_build_object('id', rp.id, 'name', rp.name),
          'rating', (
            select ${RATING}
              from rating g
              join provenance gp on gp.id = g.provenance_id
             where g.reading_id = r.id
          )
        )
        -- **What is open leads.** The same judgement STORY_STATE makes one screen up: an
        -- open Reading wins over a finished one, because it is what is happening to the Story
        -- now rather than what happened to it. It matters because the day a Reading started
        -- is optional and routinely absent — the owner opens one from their own screen and
        -- leaves the date empty, since that it is open is the fact — and ordering by the day
        -- alone would drop the book in their hands under a Reading from 2019. Below it, newest
        -- first by the day it began, and a Reading nobody recorded a day for after the ones
        -- with one: a Goodreads import full of dateless acts must not crowd out the history
        -- that has dates.
        order by (r.outcome is null) desc, r.started_on desc nulls last, r.created_at desc
      )
        from reading r
        join provenance rp on rp.id = r.provenance_id
       where r.story_id = s.id
    ), '[]'::jsonb) as readings,
    coalesce((
      select jsonb_agg(${RATING} order by g.set_at desc)
        from rating g
        join provenance gp on gp.id = g.provenance_id
       where g.story_id = s.id and g.reading_id is null
    ), '[]'::jsonb) as "standaloneRatings"`;

/** Where a Story is read from. Named beside the columns, because the two are one statement. */
const A_STORY = `
  from story s
  join type t on t.id = s.type_id`;

const WHOLE_STORY = `select ${STORY_COLUMNS} ${A_STORY}`;

// A Story's id is generated, so nobody types one: what arrives here came from a screen or
// from an assistant reading the library over MCP. A malformed one is the same event as an
// unknown one — there is no such Story — and this keeps it that way, because `where s.id =
// $1` on a uuid column raises a *syntax* error for `"banana"`, which would reach the door
// as a 500 rather than as an answer. The same guard every other `find` in this directory
// has.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One Story, as its own page draws it: the whole of it, plus the two facts it borrows from
 * the objects carrying it.
 *
 * The page is a detail screen and still wears the shelf's vocabulary — the tile the owner
 * tapped on the wall is drawn again at its head (#29) — and a tile is a tint and a jacket.
 * Neither is a Story's own (ADR-0001), so both come off the Volumes, by the derivations the
 * wall reads.
 */
export type FoundStory = Story & {
  /** The line the objects carrying it stand in, or `null` where none does. */
  series: WallSeries | null;
  /** The jacket it is faced with, borrowed off the first Volume that has one. */
  cover: FacedWith | null;
  /**
   * The score at the tile's foot, which is the third thing the wall's tile carries — and the
   * same one, off the same fragment, so the tile does not change what it says on the way in.
   * The stack below it is the whole story of the judgements; this is what the tile can fit.
   */
  latestScore: number | null;
};

export async function findStory(storyId: string): Promise<FoundStory | null> {
  if (!UUID.test(storyId)) return null;

  const rows = await query<FoundStory>(
    `select ${STORY_COLUMNS},
            ${THE_LINE_IT_STANDS_IN} as series,
            ${THE_COVER_IT_IS_FACED_OUT_WITH} as cover,
            ${LATEST_SCORE} as "latestScore"
     ${A_STORY}
     where s.id = $1`,
    [storyId]
  );

  return rows[0] ?? null;
}

/**
 * Every Story the owner has read, whole: the Readings that finished it and the Rating
 * each one carried, prose and Provenance included.
 *
 * **This is the corpus an external reader recommends from** (ADR-0002, user story 32),
 * and it is the reason nothing here is a summary. A score alone is a genre guess with a
 * number on it; what makes a recommendation evidence is the prose the owner wrote and
 * the Provenance that says whether they remember writing it — so both travel, and a score
 * doubled from a 1-5 scale arrives marked `coarse` on its own axis, with its Provenance
 * still saying where it came from (ADR-0008).
 *
 * `read` is the derived state and not a column, so the three states that are *not* read
 * are excluded by the same expression `findStory` reports: a Story in the owner's hands
 * right now is not something they have read, and neither is one they abandoned.
 *
 * By title, like `listStories`, for the same reason: the order is not an opinion this
 * query has been asked for, and an assistant that wants recency has the dates.
 */
export async function listReadStories(): Promise<Story[]> {
  return query<Story>(`${WHOLE_STORY} where ${STORY_STATE} = 'read' order by s.title`);
}

/** A Story as a list shows it: enough to choose one, and nothing more. */
export type StorySummary = {
  id: string;
  title: string;
  type: StoryType;
  state: StoryState;
  readingCount: number;
  /** The score the owner set most recently, or `null` if they set none. */
  latestScore: number | null;
};

/**
 * Every Story, by title.
 *
 * By title rather than by state or by score, because the list answers *"what have I
 * read"* by being readable, and any other order would be an opinion the screen has not
 * asked for.
 */
export async function listStories(): Promise<StorySummary[]> {
  return query<StorySummary>(
    `select
       s.id,
       s.title,
       jsonb_build_object('id', t.id, 'name', t.name) as type,
       ${STORY_STATE} as state,
       (select count(*)::int from reading r where r.story_id = s.id) as "readingCount",
       ${LATEST_SCORE} as "latestScore"
     from story s
     join type t on t.id = s.type_id
    order by s.title`
  );
}

/** A Story as the wall shows it: what is drawn on the tile, and what colours it. */
export type WallStory = {
  id: string;
  title: string;
  type: StoryType;
  /** The axis the wall is split along, derived from the Readings like everywhere else. */
  state: StoryState;
  /** The score the owner set most recently, or `null` where they judged it never. */
  latestScore: number | null;
  series: WallSeries | null;
  /**
   * The image the tile is faced with, off the first Volume that carries the Story and has
   * one — or `null`, which is still the normal case and is the drawn tile (ADR-0013).
   *
   * **A Story is not keyed by an ISBN and never will be**: the object is, and a narrative is
   * not an object (ADR-0001). So this is borrowed rather than owned, and what it borrows is
   * decided in one place — see `THE_COVER_IT_IS_FACED_OUT_WITH`.
   */
  cover: FacedWith | null;
};

/**
 * How the wall is narrowed. Both are optional and they compose, because the URL can carry
 * both — `/stories?type=manga&state=reading` is a page the owner can bookmark.
 */
export type StoryWallFilter = {
  /** Where the owner is with it: `to-read`, `reading`, `read`, `abandoned`. */
  state?: StoryState;
  /** A Type id, from `queries/type.ts`. It is a data row, never an enum (ADR-0006). */
  typeId?: string;
};

// The state, derived once per row rather than twice.
//
// This wall both *reports* the state and *narrows* by it, and interpolating the expression
// into the select list and into the `where` would walk the Readings of every Story twice
// for the one answer. Joined laterally, which is how `queries/series.ts` computes a Series'
// missing Volumes for the three questions that read it — same shape, same reason.
const STATE_ONCE = `cross join lateral (select ${STORY_STATE} as state) derived`;

/**
 * The Stories as a wall shows them — narrowed, and each carrying the line it stands in.
 *
 * **The filter is an argument and not a pass over the answer.** A narrowed wall is a `GET`
 * whose state is in the URL, so it is linkable, survives a refresh and works with nothing
 * running in the browser (#18); a page that fetched everything and kept four of them would
 * do the reading anyway, on a phone, on a shop's signal.
 *
 * The state stays derived here as it is everywhere else: `state` narrows by the same
 * expression `findStory` reports, so there is still no column anybody could store it in
 * wrongly.
 *
 * By title, like `listStories`, and for the same reason. What splits the wall into shelves
 * is the state, and that is the screen's grouping rather than an order this query has been
 * asked for.
 */
export async function listStoryWall(filter: StoryWallFilter = {}): Promise<WallStory[]> {
  return query<WallStory>(
    `select
       s.id,
       s.title,
       jsonb_build_object('id', t.id, 'name', t.name) as type,
       derived.state,
       ${LATEST_SCORE} as "latestScore",
       ${THE_LINE_IT_STANDS_IN} as series,
       ${THE_COVER_IT_IS_FACED_OUT_WITH} as cover
     from story s
     join type t on t.id = s.type_id
     ${STATE_ONCE}
    where ($1::text is null or s.type_id = $1)
      and ($2::text is null or derived.state = $2)
    order by s.title`,
    [filter.typeId ?? null, filter.state ?? null]
  );
}

/**
 * A Story nothing has happened to, and **what a strike would take with it** — which is the
 * whole of why this is not just an id and a title.
 *
 * A bulk destructive control has to say what it is about to destroy while the owner is still
 * ticking, and *the row* is where that is legible: two Credits and a link to an object the
 * house does not hold are records that go quietly, and the Person each Credit named is not one
 * of them (ADR-0012).
 */
export type StoryNothingHasHappenedTo = {
  id: string;
  title: string;
  type: StoryType;
  /**
   * How many Volumes carry it — **none of them in the house**, or the Story would not be in
   * this list at all. A catalogued object the Collection does not claim is the ordinary case
   * here, and the link goes when the Story does.
   */
  carriedBy: number;
  /** How many Credits go with it. The people stay, credited wherever else they are. */
  credits: number;
};

/**
 * The Stories the library knows and the owner's life does not touch: **nothing read, nothing
 * judged, no Path naming them, and nothing in the house carrying them.**
 *
 * This is the list striking is offered over, and the list *is* the safety (ADR-0015, and
 * ADR-0014 for the argument): its membership is `WHY_A_STORY_STANDS` read the other way round,
 * so the screen cannot come to offer a row `strikeStories` would refuse, and no wrong tick can
 * reach a narrative the owner has lived with. One expression, two directions — a `not exists`
 * written again here would be a second answer to the same question, drifting the day a fifth
 * branch is added.
 *
 * Unnarrowed, like the catalogue's own other half: this is the residue of approvals that went
 * through in a hurry — a dozen rows, next to a wall of seventy-seven — so it is read whole and
 * there is no filter to keep in step with the wall's.
 *
 * By title, so a duplicate stands next to the Story it duplicates: *Slam Dunk 5* twice, one
 * under the other, is what makes the mess visible at all. Then oldest first, so of two rows
 * that read the same it is the one that arrived last that looks new.
 */
export async function listStoriesNothingHasHappenedTo(): Promise<StoryNothingHasHappenedTo[]> {
  return query<StoryNothingHasHappenedTo>(
    `select
       s.id,
       s.title,
       jsonb_build_object('id', t.id, 'name', t.name) as type,
       (select count(*)::int from volume_story vs where vs.story_id = s.id) as "carriedBy",
       (select count(*)::int from credit c where c.story_id = s.id) as credits
     from story s
     join type t on t.id = s.type_id
    where (${WHY_A_STORY_STANDS}) is null
    order by lower(s.title), s.created_at, s.id`
  );
}

// **A run the owner is in the middle of**, which is the fourth source the Reading list
// composes from (#43, user stories 30 and 31).
//
// The case this exists for is the one that started the whole tracker: *Slam Dunk* collected,
// twenty published and twenty on the shelf, so the Series source — which names what is
// **missing** — has nothing to say about it, and without a hand-made Path the run was
// invisible. **A Story with an open pass that has somewhere left to go is itself the
// signal**: no route minted for something that was never a route, no flag on the Series, and
// nothing copied by hand.
//
// It is a Story question and lives here for that reason: what a run is, how far the pass got
// and what comes next are facts about the narrative and its Readings. The Reading list asks
// it, lays it beside the other three and adds the objects (`queries/reading-list.ts`).

/** One run in progress: the work, where the pass stands, and the part that comes next. */
export type RunInProgress = {
  story: { id: string; title: string; type: StoryType };
  /**
   * *Seven of twenty*, and it is never `null` here — a run is in this list because a pass is
   * open on it and the work declares a count, which is exactly the two absences that make the
   * Story's own `howFarItGot` nothing.
   */
  howFarItGot: HowFarItGot;
  /**
   * The Instalment to read next: one past where the pass stands, so a pass that has finished
   * none points at the first.
   *
   * Derived from the same number the fraction is built from rather than counted again, which
   * is what stops the row saying *7 of 20* and *read 9 next* in one breath.
   */
  nextInstalment: number;
};

/**
 * **Every run the owner is in the middle of that has somewhere left to go.**
 *
 * Three conditions, and each of them is a sentence rather than a rule of this file's own:
 *
 *   - the work is a **run** — it declares Instalments, which most Stories do not, and a Story
 *     with no parts to be at is not something to carry on with;
 *   - a pass is **open** on it, which is `STORY_STATE` reading `reading` and nothing new. A
 *     pass that finished contributes nothing, and so does one that was abandoned: the owner
 *     closed it, and being told to carry on with a book they gave up on is the recommendation
 *     this list exists not to make;
 *   - it has **somewhere left to go**. A pass standing at the last Instalment is still open —
 *     finishing is a separate act (`verbs/reading.ts`) — and there is nothing left to read.
 *
 * A work nobody has opened is **absent**, and that is the deliberate half: *wholly unread* is
 * not *at nought*, because how far it got is a fact about a pass and there is no pass. What
 * puts an unread run on the Reading list is a **Want**, which is the source that costs
 * nothing (`queries/want.ts`).
 *
 * By title, like every other list here: the order is not an opinion this query was asked for.
 */
export async function listRunsInProgress(): Promise<RunInProgress[]> {
  return query<RunInProgress>(
    // The pass's number is read once, laterally, and both the fraction and what comes next
    // are built out of it — the same shape `listStoryWall` derives the state in when it both
    // reports it and narrows by it. Two copies of the pick would be two answers to *where am
    // I*, and the second would be the one that is wrong.
    `select
       jsonb_build_object(
         'id', s.id,
         'title', s.title,
         'type', jsonb_build_object('id', t.id, 'name', t.name)
       ) as story,
       jsonb_build_object(
         'atInstalment', pass.at_instalment,
         'instalments', s.instalments
       ) as "howFarItGot",
       pass.at_instalment + 1 as "nextInstalment"
     from story s
     join type t on t.id = s.type_id
     cross join lateral (
       select coalesce(${THE_INSTALMENT_THE_CURRENT_PASS_REACHED}, 0) as at_instalment
     ) pass
    where s.instalments is not null
      and (${STORY_STATE}) = 'reading'
      and pass.at_instalment < s.instalments
    order by lower(s.title), s.id`
  );
}
