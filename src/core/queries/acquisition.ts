import "server-only";

import { query } from "../db.ts";
import { THE_COVER_IT_IS_FACED_WITH } from "./cover.ts";
import type { Covered } from "./library.ts";
import type { WallSeries } from "./story.ts";

// **WHAT CAME HOME, AND WHEN** — every acquisition the library has ever recorded, in the
// months they were made in.
//
// It is a file of its own rather than more of `queries/collection.ts`, and the line between
// the two is the one `CONTEXT.md` draws: the **Collection** is the Volumes with an *open*
// acquisition, which is to say the shelf as it stands this evening, and it is asked standing
// in a shop. This asks about the acquisitions themselves — including the ones that **ended**,
// because money spent on a Volume later sold was still spent — and it is asked at a desk,
// about time and about money. A question the Collection cannot answer without stopping being
// the Collection is a question that gets its own file (`src/core/README.md`).
//
// **The month is what is being asked about, not how the answer is read.** Banding is
// ordinarily the screen's (`AGENTS.md`, *Where a filter goes*), and this is the same
// exception the Pile states: *what did I spend per month* is a **composition**, not a wall
// narrowed for reading, and the figure each month carries is a `Covered<…>` — which the same
// document says is the query's to supply and impossible for a page to invent. A screen adding
// the prices up itself would be the second arithmetic this file exists to prevent, and it
// would be the one that disagrees with the dashboard.
//
// **Nothing disappears.** `acquired_on` is optional — a book owned since before any of this
// was written down has no receipt — so those acquisitions belong to no month, and they get a
// band of their own with a `null` month rather than being dropped out of the ledger. It is
// the shopping list's rule (ADR-0023) applied to the thing that already happened: an object
// cannot be in the house and on no band of what came home.

/** One acquisition, and the object it was made of. */
export type AcquisitionMade = {
  id: string;
  /** The day it came home, where the owner knows it. `null` is the band with no month. */
  acquiredOn: string | null;
  /** What was paid for *this* acquisition, as the owner typed it: `24.90`. */
  pricePaid: string | null;
  /** The day this acquisition ended, or `null` while the object is still in the house. */
  releasedOn: string | null;
  /** The object, as a wall draws it — so a row here is the same tile as one on the shelf. */
  volume: {
    id: string;
    title: string;
    publisher: string;
    editionLine: string | null;
    binding: { id: string; name: string };
    /** The Series the object belongs to, or `null` for one that belongs to none. */
    series: WallSeries | null;
    seriesNumber: number | null;
    /** A column, never a lookup: nothing on a render calls a third party (ADR-0013). */
    cover: { url: string; from: string; at?: string | null } | null;
  };
};

/** One month of the ledger: what came home in it, and what it came to. */
export type MonthThingsCameHome = {
  /** `2026-09`, or `null` for the acquisitions with no day recorded. */
  month: string | null;
  /**
   * What the month cost, over the acquisitions in it that carried a price.
   *
   * `from` and `of` are counts of **acquisitions**, never of euro: eighteen of this library's
   * seventy-seven acquisitions carry a price, so a month's total handed over on its own would
   * read as *what I spent in September* and would be a floor rather than a sum.
   */
  comesTo: Covered<string>;
  /** What came home in it, the most recent first. */
  acquisitions: AcquisitionMade[];
};

/** What this month has cost so far, and which month that is. */
export type ThisMonth = {
  /** `2026-09`, read off the database's own clock rather than off the browser's. */
  month: string;
  /** What has been spent in it, over the acquisitions made in it. */
  comesTo: Covered<string>;
};

// **What a month comes to**, said once and spent by both statements below, so the figure the
// dashboard prints for September and the figure the ledger's September band prints cannot
// come to disagree. It names the acquisition `a` and groups by whatever the statement groups
// by. Fixed to two places on the way out, so a month with nothing in it reads `0.00` rather
// than `0` and the figure is one shape wherever it lands.
const WHAT_A_MONTH_CAME_TO = `
  coalesce(sum(a.price_paid), 0)::numeric(12,2)::text as "comesTo",
  count(a.price_paid)::int                            as priced,
  count(*)::int                                       as acquisitions`;

type MonthRow = {
  month: string | null;
  comesTo: string;
  priced: number;
  acquisitions: number;
  came: AcquisitionMade[];
};

/**
 * **The ledger**: every acquisition ever made, banded into the month it was made in, the most
 * recent month first and the acquisitions with no day recorded at the foot.
 *
 * It reads every acquisition, and that is the answer rather than a wall left unnarrowed: the
 * screen it is for is *what came home, month by month*, and a ledger showing the last three
 * months would be a different question with no way to ask the rest of it.
 *
 * **Every acquisition and not the shelf.** One that ended is still in it, at the price it was
 * made at, carrying the day it ended — an object sold in March is money spent in January, and
 * a ledger that quietly dropped it would be a screen the owner cannot reconcile against a bank
 * statement.
 */
export async function theMonthsThingsCameHome(): Promise<MonthThingsCameHome[]> {
  const rows = await query<MonthRow>(
    `with a as (
       select acq.id,
              acq.price_paid,
              to_char(acq.acquired_on, 'YYYY-MM')    as month,
              to_char(acq.acquired_on, 'YYYY-MM-DD') as "acquiredOn",
              acq.price_paid::text                   as "pricePaid",
              to_char(acq.released_on, 'YYYY-MM-DD') as "releasedOn",
              acq.acquired_on,
              acq.created_at,
              lower(v.title) as sorts_under,
              jsonb_build_object(
                'id', v.id,
                'title', v.title,
                'publisher', v.publisher,
                'editionLine', v.edition_line,
                'binding', jsonb_build_object('id', b.id, 'name', b.name),
                'series', case when se.id is null then null
                               else jsonb_build_object('id', se.id, 'name', se.name,
                                                       'editionLine', se.edition_line)
                          end,
                'seriesNumber', v.series_number,
                'cover', ${THE_COVER_IT_IS_FACED_WITH}
              ) as volume
         from acquisition acq
         join volume v on v.id = acq.volume_id
         join binding b on b.id = v.binding_id
         -- Left, because belonging to no Series is an ordinary thing for an object to do:
         -- an omnibus is in no publisher's ordered line, and it still came home in March.
         left join series se on se.id = v.series_id
     )
     select a.month,
            ${WHAT_A_MONTH_CAME_TO},
            -- The row's own moment is the last tie-break rather than the first, so two
            -- objects bought on one afternoon come back in a stable order instead of in
            -- whichever order Postgres reached them.
            jsonb_agg(
              jsonb_build_object(
                'id', a.id,
                'acquiredOn', a."acquiredOn",
                'pricePaid', a."pricePaid",
                'releasedOn', a."releasedOn",
                'volume', a.volume
              )
              order by a.acquired_on desc nulls last, a.sorts_under, a.created_at, a.id
            ) as came
       from a
      group by a.month
      -- The month just gone at the top, and the acquisitions with no day at the foot: a day
      -- nobody wrote down is the one band that is never the most recent.
      order by a.month desc nulls last`
  );

  return rows.map((row) => ({
    month: row.month,
    comesTo: { figure: row.comesTo, from: row.priced, of: row.acquisitions },
    acquisitions: row.came,
  }));
}

/**
 * **What this month has cost so far**, which is the one figure the dashboard prints about
 * money.
 *
 * Two exports over one shared fragment rather than one export the dashboard filters, for the
 * reason `whatIsPublishedUnderThisIsbn` is beside `whatIsOnThisIsbn`: the **answers** differ
 * and not merely the work. The ledger is asked *what have the months been*, and has to read
 * every acquisition to say so; this is asked *where am I this month*, on a screen that must
 * not read seventy-seven rows to print one number — and it answers `0.00` over nothing rather
 * than an absent band, because a month with no acquisition in it has no band at all.
 *
 * The month comes back **with** the figure, off the database's own clock, so the page names
 * the month the sum was taken over rather than the one the server rendering it happens to be
 * standing in.
 */
export async function whatThisMonthHasCost(): Promise<ThisMonth> {
  const [row] = await query<{
    month: string;
    comesTo: string;
    priced: number;
    acquisitions: number;
  }>(
    `select to_char(current_date, 'YYYY-MM') as month,
            ${WHAT_A_MONTH_CAME_TO}
       from acquisition a
      where a.acquired_on >= date_trunc('month', current_date)::date
        and a.acquired_on <  (date_trunc('month', current_date) + interval '1 month')::date`
  );

  if (!row) throw new Error("what this month has cost returned no row");

  return {
    month: row.month,
    comesTo: { figure: row.comesTo, from: row.priced, of: row.acquisitions },
  };
}
