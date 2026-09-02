import "server-only";

import { query } from "../db.ts";
import type { SeriesStatus } from "../verbs/series.ts";
import { IN_THE_HOUSE } from "./collection.ts";

// What the owner and an external reader ask of the completeness ledger.
//
// The interesting thing in this file is that **the missing Volumes are not in the
// database**. The spreadsheet holds four hand-written rows for the Death Note Black
// Edition volumes still to buy, and they were wrong the day a fifth was published; here
// they are `generate_series(1, published_count)` minus the shelf, computed on the way out,
// and there is nowhere they could be stored stale. That is the shape every derivation in
// this repo takes, and this one is the argument for the rule (README, "The schema").

// The derivation, written once and used by all three queries below.
//
// Two judgements are in it. **Only what the house holds counts**: a Volume the owner
// catalogued and does not own, or released, is missing again, because the shelf is what the
// ledger is measured against and being catalogued is not being owned (ADR-0007).
// And the list is `null` rather than empty for a Series the owner never decided to collect
// — the Naruto case. Holding 42 of 72 volumes opens no project, so there is nothing
// missing from it; an empty list would say the opposite, that the Series is complete.
//
// Joined laterally rather than repeated in the select list: the answer is read three
// times — the list, the next one to buy, and the filter in `listMissingVolumes` — and a
// lateral join computes it once per Series instead of walking the shelf three times.
const MISSING = `
  cross join lateral (
    select case when s.collecting_since is null then null else coalesce((
      select jsonb_agg(n order by n)
        from generate_series(1, s.published_count) as n
       where not exists (
         select 1 from volume v
          where v.series_id = s.id
            and v.series_number = n
            and ${IN_THE_HOUSE}
       )
    ), '[]'::jsonb) end as missing
  ) derived`;

const OWNED = `
  (select count(*)::int
     from volume v
    where v.series_id = s.id and ${IN_THE_HOUSE})`;

// Name, then edition. The standard printing has no edition line and comes first, which is
// the order the owner reads two Series of one name in.
const BY_SERIES = "order by lower(s.name), s.edition_line nulls first";

// The Story the Series publishes, as the ledger wears it.
//
// One column rather than a join, because it is **the one thing a Series and a Story say to
// each other** and it is absent on most Series: forty-three of this library's ninety-seven
// Volumes belong to no Series at all, and a Series that names no Story answers `null` here
// without the row disappearing. It names the Series `s`, so a statement spending it selects
// from `series s`.
const PUBLISHES = `
  (select jsonb_build_object('id', st.id, 'title', st.title)
     from story st
    where st.id = s.story_id)`;

/** The Story a Series publishes: what it prints, and never what it was worth. */
export type PublishedStory = { id: string; title: string };

/** One Series, and how far from complete it is. */
export type SeriesLedger = {
  id: string;
  /** The Series' name without its edition: `Death Note`. */
  name: string;
  publisher: string;
  editionLine: string | null;
  status: SeriesStatus;
  /** How many Volumes are out, as the owner last recorded it. */
  publishedCount: number;
  /** How many of them are in the house. */
  ownedCount: number;
  /** The day the owner decided to complete this Series, `YYYY-MM-DD`, or `null`. */
  collectingSince: string | null;
  /**
   * The positions the house has none of, ascending — and **`null` for a Series the owner is
   * not collecting**, which is not the same as nothing being missing.
   */
  missing: number[] | null;
  /** The one to buy next, which is the first of `missing`. */
  nextMissing: number | null;
  /**
   * The Story this Series publishes, or `null` where it names none — which is the ordinary
   * case and not a gap. **Many Series may name one Story**: the standard printing and the
   * Ultimate Deluxe Edition are two ledgers over one narrative, so this is what is printed
   * and never what it was worth (ADR-0001).
   */
  publishes: PublishedStory | null;
};

const LEDGER = `
  s.id,
  s.name,
  s.publisher,
  s.edition_line                            as "editionLine",
  s.status,
  s.published_count                         as "publishedCount",
  ${OWNED}                                  as "ownedCount",
  to_char(s.collecting_since, 'YYYY-MM-DD') as "collectingSince",
  derived.missing,
  (derived.missing -> 0)::int               as "nextMissing",
  ${PUBLISHES}                              as publishes`;

/**
 * Every declared Series, collected or not.
 *
 * The screen's list. A Series the owner is not collecting is here on purpose — it is a
 * ledger of what the publisher has done, and knowing that Naruto is 72 volumes is worth
 * having before deciding anything — and it carries no missing list, because deciding is
 * what produces one.
 */
export async function listSeries(): Promise<SeriesLedger[]> {
  return query<SeriesLedger>(`select ${LEDGER} from series s ${MISSING} ${BY_SERIES}`);
}

/**
 * What is missing from every Series the owner is collecting, and nothing about the Series
 * they are not.
 *
 * **This is the query the MCP door exposes** (user story 36): an assistant reads it and
 * can suggest a purchase that completes something, without the owner having typed a row.
 * A collected Series with nothing missing is not here — the question is what is missing,
 * and a complete Series is not an answer to it.
 */
export async function listMissingVolumes(): Promise<SeriesLedger[]> {
  return query<SeriesLedger>(
    `select ${LEDGER}
       from series s
       ${MISSING}
      where derived.missing is not null
        and jsonb_array_length(derived.missing) > 0
      ${BY_SERIES}`
  );
}

/** One Volume of a Series, as the Series lists it. */
export type SeriesVolume = {
  id: string;
  title: string;
  /** Its position in the Series. */
  number: number;
  binding: { id: string; name: string };
};

/** One Series with the objects of it that are in the house. */
export type SeriesInDetail = SeriesLedger & {
  /** Owned only, by position. A Volume the house does not hold is not here, and is missing again. */
  volumes: SeriesVolume[];
};

// A Series' id never comes from a keyboard, so a malformed one is the same event as an
// unknown one: nothing to show. Checked here because `where id = $1` on a uuid column
// raises a syntax error for `"banana"`, which is a 500 and not an answer.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One Series: its ledger, and what of it is on the shelf. `null` when there is no such
 * Series.
 *
 * One statement rather than two, because the shelf and the missing list are two halves of
 * one answer and reading them separately would be reading two moments.
 */
export async function findSeries(seriesId: string): Promise<SeriesInDetail | null> {
  if (!UUID.test(seriesId)) return null;

  const rows = await query<SeriesInDetail>(
    `select ${LEDGER},
            coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', v.id,
                  'title', v.title,
                  'number', v.series_number,
                  'binding', jsonb_build_object('id', b.id, 'name', b.name)
                )
                order by v.series_number
              )
                from volume v
                join binding b on b.id = v.binding_id
               where v.series_id = s.id and ${IN_THE_HOUSE}
            ), '[]'::jsonb) as volumes
       from series s
       ${MISSING}
      where s.id = $1`,
    [seriesId]
  );

  return rows[0] ?? null;
}

/** A Volume waiting to be told which position of which Series it is. */
export type PlaceableVolume = {
  id: string;
  title: string;
  publisher: string;
  editionLine: string | null;
};

/**
 * The Volumes in the house that belong to no Series yet.
 *
 * What a Series screen offers when placing an object, and it is deliberately the whole
 * Collection minus what is placed rather than a guess from the title: the owner knows
 * which of their books is volume 3, and a screen that matched on words would place the
 * wrong one confidently.
 */
export async function listVolumesOutsideASeries(): Promise<PlaceableVolume[]> {
  return query<PlaceableVolume>(
    `select v.id, v.title, v.publisher, v.edition_line as "editionLine"
       from volume v
      where v.series_id is null and ${IN_THE_HOUSE}
      order by lower(v.title), v.id`
  );
}

/** What one press of the merge gesture would collapse, counted before it is pressed. */
export type WhatAMergeWouldCollapse = {
  /** How many objects are placed in the line, in the house or not: all of them carry the work. */
  objects: number;
  /** How many narratives those objects stand for today, and therefore how many become one. */
  narratives: number;
};

/**
 * What merging this Series into one Story would collapse, or `null` where there is no such
 * Series.
 *
 * **A destructive gesture says what it is about to do while the owner is still deciding**, the
 * way the Stories a strike is offered over carry what goes with each (`listStoriesNothingHasHappenedTo`).
 * *Eighteen narratives across twenty objects become one* is the whole of what the press means,
 * and neither number is on the screen otherwise: the ledger counts what is in the house and this
 * counts what is in the line.
 *
 * It is two counts rather than the rows themselves, because the panel says a sentence and a page
 * reading twenty rows to print a number is the thing the filter rule exists about.
 */
export async function whatAMergeWouldCollapse(
  seriesId: string
): Promise<WhatAMergeWouldCollapse | null> {
  if (!UUID.test(seriesId)) return null;

  const rows = await query<WhatAMergeWouldCollapse>(
    `select (select count(*)::int from volume v where v.series_id = s.id) as objects,
            (select count(*)::int
               from (select distinct vs.story_id
                       from volume_story vs
                       join volume v on v.id = vs.volume_id
                      where v.series_id = s.id) carried) as narratives
       from series s
      where s.id = $1`,
    [seriesId]
  );

  return rows[0] ?? null;
}

/** One narrative of a line that a merge would carry something of the owner's across on. */
export type NarrativeAMergeWouldCarry = {
  id: string;
  title: string;
  /** How many passes went through it. */
  readings: number;
  /** Whether it carries a score of its own — a Rating naming no Reading. */
  judged: boolean;
};

/**
 * The narratives of this line that carry a Reading or a Rating, in the order their objects
 * stand on the shelf. Empty where the line has been neither read nor judged, and for a Series
 * the library does not know.
 *
 * **The merge carries these and is right to** — a pass through volume seven was a pass through
 * the work, and `mergeSeriesIntoOneStory` moves it. This is the question asked by whoever is
 * about to run the gesture *unattended*, over five lines at once and against the live library
 * (#44): there, carrying is exactly what must not happen quietly, because a Reading moved onto
 * a work is a claim about what the owner read that nobody watched being made. So the
 * conversion reads this first and refuses the whole run while it says anything at all.
 *
 * It answers rows rather than a count because the refusal names what stopped it. *Nothing was
 * converted* is only useful beside *Slam Dunk 7 has been read*, which is the one sentence that
 * tells the owner where to look.
 */
export async function whatAMergeWouldCarry(seriesId: string): Promise<NarrativeAMergeWouldCarry[]> {
  if (!UUID.test(seriesId)) return [];

  return query<NarrativeAMergeWouldCarry>(
    `select s.id,
            s.title,
            (select count(*)::int from reading r where r.story_id = s.id) as readings,
            exists (select 1 from rating g
                     where g.story_id = s.id and g.reading_id is null) as judged
       from story s
      where exists (select 1
                      from volume_story vs
                      join volume v on v.id = vs.volume_id
                     where vs.story_id = s.id and v.series_id = $1)
        and (exists (select 1 from reading r where r.story_id = s.id)
             or exists (select 1 from rating g where g.story_id = s.id))
      order by (select min(v.series_number)
                  from volume_story vs
                  join volume v on v.id = vs.volume_id
                 where vs.story_id = s.id and v.series_id = $1),
               lower(s.title),
               s.id`,
    [seriesId]
  );
}
