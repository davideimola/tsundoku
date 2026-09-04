import "server-only";

import { query } from "../db.ts";
import { IN_THE_HOUSE } from "./collection.ts";
import { listMissingVolumes } from "./series.ts";
import { listStoryWall, type WallStory } from "./story.ts";

// **What the library is, as figures — and each one arrives with how much of the library it
// speaks for.**
//
// This is the file behind the dashboard (#24), and the one decision in it is the shape of
// an answer rather than any of the arithmetic. Eighteen of this library's seventy-seven
// acquisitions carry a price. A screen handed a bare total would print it as *what I have
// spent on my books*, which is a lie by a factor of four — and no screen can defend itself
// against that, because a total carries no evidence of what it was computed over.
//
// So the coverage is **part of the query's contract and not a presentation choice**: every
// figure below is a `Covered<…>`, the denominator comes out of Postgres beside the figure,
// and a page has nothing to invent. Two of the four are whole by construction and will stay
// whole — every Volume says whether it is in the house, every Series says whether it is
// being collected — and that is an argument *for* the uniform shape rather than against it:
// a contract with two special cases is a contract a screen has to remember, and the screen
// that forgets is the one printing the lie.
//
// It composes rather than re-derives. What is missing from a Series is
// `listMissingVolumes`, and the pile is `listStoryWall` narrowed to `to-read` — both
// already tested where they live, and a second copy of either would be a second answer to
// a question this repo has one of.

/**
 * A figure, and **how much of the library it speaks for**.
 *
 * `from` and `of` are counts of *records*, never of the thing being measured: they say how
 * many rows could have carried the fact the figure needs, and how many did. So a sum of
 * prices over 18 of 77 acquisitions is `{ figure: "412.50", from: 18, of: 77 }`, and the
 * page renders both halves or neither.
 *
 * `from === of` is a figure that speaks for everything it was asked about — which is what
 * `whole` is for, so that no screen writes the comparison itself and gets it backwards.
 */
export type Covered<Figure> = {
  /** The figure, computed over the records that carried what it needs. */
  figure: Figure;
  /** How many records carried it. */
  from: number;
  /** How many records there were. */
  of: number;
};

/**
 * Whether a figure speaks for the whole of what it was asked about.
 *
 * **A library with nothing in it is whole**, and that is deliberate: `from` and `of` are
 * both zero, there was nothing to cover, and no coverage sentence would tell the owner
 * anything they cannot see from the figure. What an empty figure says is decided by the
 * figure being zero — never by its coverage.
 */
export function whole(covered: Covered<unknown>): boolean {
  return covered.from === covered.of;
}

/**
 * Whether the records exist and **not one of them carries the fact the figure needs** — which
 * is the single case where a figure must not be printed at all.
 *
 * `whole`'s sibling, and here rather than on a screen because the line it draws is a statement
 * about the data and not about layout. Both halves of it are load-bearing:
 *
 *   - **Records that carry nothing is a gap.** Seventy-seven acquisitions and not one price is
 *     *nobody wrote it down*, and a `0.00` printed for it is a claim about the owner's money.
 *   - **No records at all is a measurement.** Nothing has come home, so nothing has been
 *     spent, and the honest figure is zero. A dash there would be the mirror-image lie —
 *     hiding a fact the library does know.
 *
 * So it is deliberately *not* `!whole(…)`, and deliberately *not* `from === 0`: an empty
 * library answers `false` to this and `true` to `whole`, and both answers are right.
 */
export function unrecorded(covered: Covered<unknown>): boolean {
  return covered.of > 0 && covered.from === 0;
}

/** What the library is, in the four figures the dashboard's second band is made of. */
export type LibraryInFigures = {
  /**
   * The Volumes in the house, over the Volumes the library knows of at all.
   *
   * Whole: an acquisition is recorded deliberately (ADR-0007), so a Volume with none is one
   * the owner does not own rather than one nobody got round to. Nothing is unrecorded here.
   */
  owned: Covered<number>;
  /**
   * The Series the owner decided to complete, over the Series declared.
   *
   * Whole, for the same reason and by the same rule: collecting a Series is a decision and
   * never derived from what is on the shelf, so every declared Series answers the question.
   */
  collecting: Covered<number>;
  /**
   * How many positions the Series being collected are missing, over those Series.
   *
   * **Partial where a collected Series has no published count recorded.** Nothing is
   * missing from a ledger measured against zero, and reporting that as *complete* is
   * exactly the lie this type exists to prevent: `from` counts the collected Series the
   * ledger can speak for.
   */
  missing: Covered<number>;
  /**
   * What the library cost, as the owner typed it, over every acquisition ever made.
   *
   * **Over every acquisition and not over the shelf**: money spent on a Volume later sold
   * was still spent, and the acquisition that ended is the record of having spent it.
   *
   * A string rather than a number, like every price in this repo: `24.90` is what the owner
   * typed and what both doors render, and a float would make it `24.900000000000002` on the
   * way through.
   */
  spent: Covered<string>;
};

// Three of the four figures and their denominators, and the missing figure's coverage.
//
// Scalar subqueries rather than a round trip each: they are read from three tables that
// nothing here joins, and a dashboard showing the shelf from one moment and the spending from
// another is one nobody could reconcile. **The missing figure itself is not in here** — it is
// summed from `listMissingVolumes` below, so it is a second read and a second moment, which is
// the price of that derivation existing in exactly one place (`queries/series.ts`). Worth
// paying: the two figures cannot disagree about anything, because the count of collected
// Series comes from this statement and the gaps come from that one.
const FIGURES = `
  select
    (select count(*)::int from volume v where ${IN_THE_HOUSE})            as owned,
    (select count(*)::int from volume)                                    as catalogued,
    (select count(*)::int from series where collecting_since is not null)  as collecting,
    (select count(*)::int from series)                                    as declared,
    -- Collected, and with a published count to measure against. The two together are the
    -- missing figure's coverage, and the second is the half that can be short.
    (select count(*)::int from series
      where collecting_since is not null and published_count > 0)         as "collectedAndCounted",
    -- Fixed to two places on the way out, so an empty library reads 0.00 rather than 0 and
    -- the figure is one shape whatever is in it.
    (select coalesce(sum(a.price_paid), 0)::numeric(12,2)::text
       from acquisition a)                                                as spent,
    (select count(*)::int from acquisition a where a.price_paid is not null) as priced,
    (select count(*)::int from acquisition)                                as acquisitions`;

type FigureRow = {
  owned: number;
  catalogued: number;
  collecting: number;
  declared: number;
  collectedAndCounted: number;
  spent: string;
  priced: number;
  acquisitions: number;
};

/**
 * **What the library is**: what is owned, what is being collected, what that is short of,
 * and what it cost — each with the coverage that says how far it can be read.
 *
 * The missing figure is summed from `listMissingVolumes` rather than derived again here:
 * that query is the one place `generate_series(1, published_count)` minus the shelf is
 * written down, and this file asking the same question its own way would be the second
 * answer `queries/series.ts` exists to prevent.
 */
export async function libraryInFigures(): Promise<LibraryInFigures> {
  const [rows, incomplete] = await Promise.all([query<FigureRow>(FIGURES), listMissingVolumes()]);

  const [counted] = rows;
  if (!counted) throw new Error("the library's figures returned no row");

  // Only the Series with a gap come back, so this is the whole of what is missing — and a
  // collected Series with nothing missing contributes the zero it should.
  const missing = incomplete.reduce((short, ledger) => short + (ledger.missing?.length ?? 0), 0);

  return {
    owned: { figure: counted.owned, from: counted.catalogued, of: counted.catalogued },
    collecting: { figure: counted.collecting, from: counted.declared, of: counted.declared },
    missing: { figure: missing, from: counted.collectedAndCounted, of: counted.collecting },
    spent: { figure: counted.spent, from: counted.priced, of: counted.acquisitions },
  };
}

/**
 * **The pile the application is named after**: the Stories nobody has opened, and how many
 * Stories there are to measure them against.
 *
 * The spines are `listStoryWall` narrowed to `to-read` — the same tiles the Story wall is
 * laid out as, in the same Series' tints, so a spine in the pile and a cover on the wall are
 * one object at two sizes. **Every one of them, and not a sample**: the pile's height *is*
 * the figure, so a hero drawn from the first twelve would be a picture of a different
 * library.
 *
 * A Story being reread is not in it. That is `STORY_STATE`'s judgement and not this file's —
 * an open Pass wins over a finished one, so a Story in the owner's hands right now is
 * `reading` and the pile is what has never been opened.
 */
export type ThePile = {
  /** The unread Stories, by title, each one a spine the owner can open. */
  spines: WallStory[];
  /** How many Stories the library holds, read or not. */
  stories: number;
};

export async function thePile(): Promise<ThePile> {
  const [spines, rows] = await Promise.all([
    listStoryWall({ state: "to-read" }),
    query<{ stories: number }>("select count(*)::int as stories from story"),
  ]);

  const [counted] = rows;
  if (!counted) throw new Error("counting the Stories returned no row");

  return { spines, stories: counted.stories };
}
