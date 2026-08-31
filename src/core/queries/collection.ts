import "server-only";

import { query } from "../db.ts";
import type { WallSeries } from "./story.ts";

/**
 * **What being in the Collection is**, as SQL: the Volume named `v` has an open
 * acquisition (ADR-0007).
 *
 * Exported for the reason `STORY_STATE` is exported from `queries/story.ts`: five queries
 * in three files ask this one question — the Collection, the Series ledger, the shopping
 * list's overlap with the shelf, a Story's carriers — and a second copy of it would be a
 * second answer. The fragment names the Volume `v`, so a statement using it joins
 * `volume v`.
 */
export const IN_THE_HOUSE = `
  exists (select 1 from acquisition a
           where a.volume_id = v.id and a.released_on is null)`;

/**
 * One Volume as the Collection shows it: everything about the object, and nothing about
 * the narrative.
 *
 * There is no medium here because there is none in the model — an owned ebook is not
 * something this app can hold (see `db/migrations/0005_02_volume_and_the_collection.sql`).
 * Money and days are strings rather than `number` and `Date`: `24.90` is what the owner
 * typed and what both doors render, and a float would make it `24.900000000000002` on the
 * way through.
 *
 * The price and the day come off the **open acquisition** rather than off the object, and
 * that is where they live now: what was paid is a fact about coming home, and the same
 * catalogued Volume bought twice was bought at two prices (ADR-0007).
 */
export type CollectionVolume = {
  id: string;
  title: string;
  publisher: string;
  editionLine: string | null;
  /** Included by name as well as by id, because MCP reads this and prose is the point. */
  binding: { id: string; name: string };
  language: string;
  pricePaid: string | null;
  /** The day it came home, where the owner knows it. */
  acquiredOn: string | null;
  isbn: string | null;
};

/**
 * What narrows the Collection. Everything absent is everything.
 *
 * **Type is the fourth field and it arrived with the Story ↔ Volume join**, which is what
 * it was waiting for. Type is an attribute of a *Story* (ADR-0006), so it is reached from a
 * Volume through what that Volume carries and never off the Volume itself: giving `volume` a
 * `type_id` would have answered this search by contradicting the model, because a Volume
 * holding three Stories of two Types has no one Type.
 */
export type CollectionFilter = {
  /** Matched anywhere in the title, case-insensitively. */
  title?: string;
  /** Matched anywhere in the publisher, case-insensitively. */
  publisher?: string;
  /** A Binding id — exact, because it comes from the Binding vocabulary. */
  binding?: string;
  /**
   * A Type id — exact, for the reason Binding is exact. Answers with the Volumes carrying
   * at least one Story of that Type, so a Volume of two Types is found under either, once.
   * A Volume carrying nothing is found under no Type at all: nothing says what it is.
   */
  type?: string;
};

/**
 * The Collection: the Volumes physically in the owner's house, narrowed.
 *
 * This is the query the shop is standing in — *do I already have this?* — and it is the
 * one the MCP door exposes, Binding included, so an assistant can say *you own that story
 * in the Must Have already*.
 *
 * **It is a subset of the catalogue, and that is what makes it worth asking** (ADR-0007).
 * A Volume the library knows but the owner does not own — the wishlist's twenty-one, an
 * object released years ago — is not here, and answering *no* about one of those is the
 * whole point of the question. Every row here has an open acquisition; nothing is deleted
 * to make that true, because Readings made through an object are still true after it goes.
 */
export async function searchCollection(filter: CollectionFilter): Promise<CollectionVolume[]> {
  return query<CollectionVolume>(
    `select v.id,
            v.title,
            v.publisher,
            v.edition_line                       as "editionLine",
            jsonb_build_object('id', b.id, 'name', b.name) as binding,
            v.language,
            a.price_paid::text                   as "pricePaid",
            to_char(a.acquired_on, 'YYYY-MM-DD') as "acquiredOn",
            v.isbn
       from volume v
       join binding b on b.id = v.binding_id
       -- The join *is* the Collection: an open acquisition is what being in the house
       -- means, so a catalogued Volume the owner does not own has no row to join to and
       -- drops out here rather than being filtered out afterwards.
       join acquisition a on a.volume_id = v.id and a.released_on is null
        -- strpos rather than ilike '%…%', so that what the owner typed is a word and not
        -- a pattern: % and _ are ordinary characters in a title, and a search box that
        -- treated them as wildcards would answer a question nobody asked.
        and ($1::text is null or strpos(lower(v.title), lower($1)) > 0)
        and ($2::text is null or strpos(lower(v.publisher), lower($2)) > 0)
        and ($3::text is null or v.binding_id = $3)
        -- An existence test rather than a join, so that a Volume carrying three Stories of
        -- the asked Type is one row here and not three: the Collection answers with objects.
        and ($4::text is null or exists (
              select 1
                from volume_story vs
                join story s on s.id = vs.story_id
               where vs.volume_id = v.id and s.type_id = $4
            ))
      order by lower(v.title), b.display_order, v.id`,
    [filter.title ?? null, filter.publisher ?? null, filter.binding ?? null, filter.type ?? null]
  );
}

// A Volume's id is generated, so it is never typed: it arrives from a link on the Collection
// the owner was just looking at. A malformed one is therefore the same event as an unknown
// one — `where id = 'banana'` on a uuid column raises a syntax error, and the screen wants a
// 404 rather than a 500.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One Volume as its own page shows it: the object, and where it stands with the owner.
 *
 * Three states rather than two, since the catalogue and the Collection came apart
 * (ADR-0007): in the house, catalogued and never acquired, or acquired and let go. The
 * first is `inTheHouse`; the other two are told apart by `releasedOn`, which only an
 * object that was once owned has. None of it is on `CollectionVolume`, because everything
 * the Collection answers with is in the house and the question is not open there.
 */
export type RecordedVolume = CollectionVolume & {
  /** Whether the Collection claims it right now. */
  inTheHouse: boolean;
  /** The day the last acquisition of it ended, or `null` if none ever did. */
  releasedOn: string | null;
  /**
   * The Series the object belongs to, or `null` for one that belongs to none.
   *
   * Which Series an object stands in is a fact about the *thing* (ADR-0001), so it is part
   * of what this object **is** rather than of what the owner has done with it — which is the
   * distinction the object's own screen is laid out along (#30). It is also where the page
   * takes its colour from, since a tint is a function of the Series' identity.
   */
  series: WallSeries | null;
  /** Its position in that Series: 12 of Slam Dunk. `null` where it stands in none. */
  seriesNumber: number | null;
};

/**
 * One Volume, however the owner stands with it, or `null` where there is no such object.
 *
 * **Answers with more than `searchCollection` does.** The Collection is what is in the
 * house; one object's own page is a record of the object, and what the owner learned about
 * it — its Edition note, the Stories it carried — outlives their owning it, or their ever
 * having owned it.
 *
 * The price and the day are the **latest** acquisition's, open or ended, because that is
 * the one the page is a record of: what it cost the last time it came home.
 */
export async function findVolume(volumeId: string): Promise<RecordedVolume | null> {
  if (!UUID.test(volumeId)) return null;

  const rows = await query<RecordedVolume>(
    `select v.id,
            v.title,
            v.publisher,
            v.edition_line as "editionLine",
            jsonb_build_object('id', b.id, 'name', b.name) as binding,
            v.language,
            latest.price_paid::text as "pricePaid",
            to_char(latest.acquired_on, 'YYYY-MM-DD') as "acquiredOn",
            v.isbn,
            latest.id is not null and latest.released_on is null as "inTheHouse",
            to_char(latest.released_on, 'YYYY-MM-DD') as "releasedOn",
            case when se.id is null then null
                 else jsonb_build_object('id', se.id, 'name', se.name,
                                         'editionLine', se.edition_line)
            end as series,
            v.series_number as "seriesNumber"
       from volume v
       join binding b on b.id = v.binding_id
       -- Left, because standing in no Series is ordinary rather than missing: an omnibus, a
       -- novel, a standalone. The wall joins it the same way, off the object's own column.
       left join series se on se.id = v.series_id
       -- The latest acquisition, left-joined because a catalogued Volume has none: an open
       -- one first, then the most recent that ended. Ordered rather than filtered, so the
       -- three states are one row with different columns filled in.
       left join lateral (
         select a.id, a.acquired_on, a.released_on, a.price_paid
           from acquisition a
          where a.volume_id = v.id
          order by a.released_on desc nulls first, a.acquired_on desc nulls last, a.created_at desc
          limit 1
       ) latest on true
      where v.id = $1`,
    [volumeId]
  );

  return rows[0] ?? null;
}

/**
 * One acquisition of a Volume: it was in the house from a day, at a price, and until when.
 *
 * The day and the price are both optional on the fact itself — a book owned since before any
 * of this was written down has no receipt — and `releasedOn` is `null` for the one that is
 * open, which is to say for the object that is on the shelf right now (ADR-0007).
 */
export type Acquisition = {
  id: string;
  /** The day it came home, where the owner knows it. */
  acquiredOn: string | null;
  /** What was paid for *this* acquisition, as the owner typed it. */
  pricePaid: string | null;
  /** The day this acquisition ended, or `null` while the object is still in the house. */
  releasedOn: string | null;
};

/**
 * Everything the house has done with one object, newest first.
 *
 * **This is the query that lets a screen say *one object acquired twice***, which is the
 * half of ADR-0007 that nothing read back before the object got its own screen (#30). An
 * acquisition that ends is not deleted, so a Volume sold and bought again is one object with
 * two acquisitions at two prices — and a page reading only the latest one would print the
 * second acquisition and quietly lose the first.
 *
 * It answers `[]` for a catalogued object the house has never held, which is an ordinary
 * answer and not a gap, and for an id that is no id at all: a Volume's id is never typed, so
 * a malformed one is the same event as an unknown one.
 *
 * **The open acquisition first, then the ones that ended, most recently ended first** — the
 * order the object's page reads in: what is true now, then what was true before it. It is
 * `findVolume`'s ordering, deliberately the same one, so *the latest acquisition* means the
 * same row in both answers and the sentence at the top of a screen cannot describe a
 * different acquisition than the first row of the list under it.
 */
export async function listAcquisitions(volumeId: string): Promise<Acquisition[]> {
  if (!UUID.test(volumeId)) return [];

  return query<Acquisition>(
    `select a.id,
            to_char(a.acquired_on, 'YYYY-MM-DD') as "acquiredOn",
            a.price_paid::text                   as "pricePaid",
            to_char(a.released_on, 'YYYY-MM-DD') as "releasedOn"
       from acquisition a
      where a.volume_id = $1
      -- The open one first, then the most recent that ended, and the row's own moment under both, so
      -- that two acquisitions with no day recorded still come back in a stable order rather
      -- than in whichever order Postgres reached them.
      order by a.released_on desc nulls first, a.acquired_on desc nulls last, a.created_at desc`,
    [volumeId]
  );
}

/**
 * How many Volumes are in the house.
 *
 * Its own question, and its own statement, because the screen says *3 of 98* while a
 * search is on: counting by fetching the whole Collection would read ninety-eight rows,
 * ISBNs and prices and all, to print one number.
 */
export async function countCollection(): Promise<number> {
  const [row] = await query<{ owned: string }>(
    `select count(*) as owned from volume v where ${IN_THE_HOUSE}`
  );
  return Number(row.owned);
}

/** A catalogued Volume the Collection does not claim, and the little the owner knows of it. */
export type CataloguedVolumeOutsideTheCollection = {
  id: string;
  title: string;
  publisher: string;
  editionLine: string | null;
  binding: { id: string; name: string };
  language: string;
  isbn: string | null;
  /** The day the last acquisition of it ended, or `null` if it was never in the house. */
  releasedOn: string | null;
};

/**
 * Every Volume the library knows and the owner does not have: the other half of the
 * catalogue.
 *
 * It exists because the split made it possible to record an object without owning it
 * (ADR-0007), and a screen that could only show the Collection would let the owner
 * catalogue something and watch it vanish. Two kinds of row are in it and they are not
 * separated: one released years ago and one never acquired are both *not on the shelf*,
 * which is the question, and `releasedOn` says which is which where it matters.
 *
 * Unnarrowed on purpose. The Collection is a hundred rows and this is a few dozen — the
 * wishlist's twenty-one and whatever has been let go — so it is read whole and there is no
 * filter to keep in step with the Collection's.
 */
export async function listCataloguedOutsideTheCollection(): Promise<
  CataloguedVolumeOutsideTheCollection[]
> {
  return query<CataloguedVolumeOutsideTheCollection>(
    `select v.id,
            v.title,
            v.publisher,
            v.edition_line as "editionLine",
            jsonb_build_object('id', b.id, 'name', b.name) as binding,
            v.language,
            v.isbn,
            to_char(max(history.released_on), 'YYYY-MM-DD') as "releasedOn"
       from volume v
       join binding b on b.id = v.binding_id
       left join acquisition history on history.volume_id = v.id
      where not ${IN_THE_HOUSE}
      group by v.id, v.title, v.publisher, v.edition_line, b.id, b.name, b.display_order,
               v.language, v.isbn
      order by lower(v.title), b.display_order, v.id`
  );
}

/**
 * One Volume as the Collection wall shows it: what is drawn on the tile, and what colours
 * it.
 *
 * Leaner than `CollectionVolume` on purpose, and the difference is the whole argument for
 * a second query. A wall is read on a phone on a shop's signal, and a tile carries a title,
 * a number and a colour — so the price, the day, the language and the ISBN are not fetched
 * to be thrown away. What the owner wants beyond that is one tap onto the object's own page.
 *
 * The Series is the object's own, off its column, rather than derived across the
 * many-to-many the way a Story's is: an object belongs to exactly one Series, and which one is
 * a fact about the thing (ADR-0001). `null` is an ordinary answer — an omnibus, a novel, a
 * standalone — and not a gap.
 */
export type WallVolume = {
  id: string;
  title: string;
  publisher: string;
  editionLine: string | null;
  binding: { id: string; name: string };
  /** The Series the object belongs to, or `null` for one that belongs to none. */
  series: WallSeries | null;
  /** Its position in that Series: 12 of Slam Dunk. `null` where it belongs to none. */
  seriesNumber: number | null;
};

/**
 * How the wall is narrowed. Everything absent is everything, and they compose, because the
 * URL can carry all of them at once.
 *
 * **The publisher is exact here and matched-anywhere in `searchCollection`, and that is the
 * difference between the two doors rather than an inconsistency.** What narrows this wall
 * comes off a picker over the publishers the house actually holds (`listCollectionPublishers`),
 * so `Panini Comics` is a value the owner chose and not a word they typed; an assistant
 * reading the Collection over MCP is typing a word, and gets the search that forgives it.
 */
export type CollectionWallFilter = {
  /** Matched anywhere in the title, case-insensitively — the one thing still typed. */
  title?: string;
  /** A Series id — exact. Narrowing to one Series is the wall's own filter (user story 26). */
  series?: string;
  /** A publisher, exact and whole, as `listCollectionPublishers` offers it. */
  publisher?: string;
  /** A Binding id — exact, because it comes from the Binding vocabulary. */
  binding?: string;
  /** A Type id — exact, reached through the Stories the Volume carries, as above. */
  type?: string;
};

// **The order the shelf stands in**, which is the whole of what makes this a wall rather
// than a list, and it is one expression because it has to answer for two kinds of object at
// once.
//
// A Volume in a Series sorts under that Series' name; one in none sorts under its own
// title — so a standalone omnibus takes its place *among* the Series rather than being swept
// to the end, which is where it stands on the real shelf. Inside a Series the number is the
// order, so 2 follows 1 and 10 does not come between them.
//
// The rest is the tie-break, and every level of it is total: the standard printing before an
// edition line (the order `queries/series.ts` reads two Series of one name in), then the
// Series' id, then the title, the Binding and the object's own id. A wall whose order
// depended on which row Postgres reached first would rearrange itself between two loads of
// the same page.
const THE_ORDER_THE_SHELF_STANDS_IN = `
  order by coalesce(lower(se.name), lower(v.title)),
           se.edition_line nulls first,
           se.id,
           v.series_number,
           lower(v.title),
           b.display_order,
           v.id`;

/**
 * The Collection as a wall shows it: the Volumes in the house, in the order they stand in,
 * each carrying the Series it belongs to.
 *
 * **Volumes and not Stories, because the object is what the question is about.** *Do I
 * already have this?* is asked standing in a shop with a book in hand, and two editions of
 * one story are two different things on a wall — which one is on the shelf is exactly what
 * the owner cannot remember (#23).
 *
 * **In the house, never merely catalogued** (ADR-0007): the join to an open acquisition is
 * the Collection, so an object the library knows and the house does not hold has no row to
 * join to. That is the answer the shop is for, and a wall that blurred the two would give
 * the owner a second copy of something they only ever wanted.
 *
 * The filter is an argument and not a pass over the answer, like every wall in this app: a
 * narrowed wall is a `GET` whose state is in the URL, so it is linkable, survives a refresh
 * and works with nothing running in the browser (ADR-0010) — and it reads the four rows it
 * shows rather than ninety-six to keep four, on a shop's signal.
 */
export async function listCollectionWall(filter: CollectionWallFilter = {}): Promise<WallVolume[]> {
  return query<WallVolume>(
    `select v.id,
            v.title,
            v.publisher,
            v.edition_line as "editionLine",
            jsonb_build_object('id', b.id, 'name', b.name) as binding,
            case when se.id is null then null
                 else jsonb_build_object('id', se.id, 'name', se.name,
                                         'editionLine', se.edition_line)
            end as series,
            v.series_number as "seriesNumber"
       from volume v
       join binding b on b.id = v.binding_id
       -- Left, because belonging to no Series is the ordinary case for sixteen of these
       -- objects and not a missing row: an omnibus is in no publisher's ordered line.
       left join series se on se.id = v.series_id
      -- The fragment rather than searchCollection's join, because nothing here is read off
      -- the acquisition: what is wanted is the *fact* of one, said once for the whole repo.
      where ${IN_THE_HOUSE}
        and ($1::text is null or strpos(lower(v.title), lower($1)) > 0)
        -- Cast to text rather than compared as a uuid: a hand-edited ?series=banana
        -- narrows to nothing, which is the honest answer, where series_id = 'banana' on a
        -- uuid column raises a syntax error and reaches the screen as a 500.
        and ($2::text is null or v.series_id::text = $2)
        and ($3::text is null or v.publisher = $3)
        and ($4::text is null or v.binding_id = $4)
        -- An existence test rather than a join, so a Volume carrying three Stories of the
        -- asked Type is one tile and not three: the wall is laid out with objects.
        and ($5::text is null or exists (
              select 1
                from volume_story vs
                join story s on s.id = vs.story_id
               where vs.volume_id = v.id and s.type_id = $5
            ))
      ${THE_ORDER_THE_SHELF_STANDS_IN}`,
    [
      filter.title ?? null,
      filter.series ?? null,
      filter.publisher ?? null,
      filter.binding ?? null,
      filter.type ?? null,
    ]
  );
}

/**
 * The Series the house holds something of, in the order the wall stands them in.
 *
 * **Only the Series with a Volume on the shelf**, and that is the picker's whole rule: a
 * control offering *Berserk Deluxe* to an owner who has none of it is a control whose every
 * use empties the wall. The Series screen is where one the owner is collecting and has not
 * started is read; this is the wall's own vocabulary, and it is a vocabulary of what is
 * there.
 */
export async function listCollectionSeries(): Promise<WallSeries[]> {
  return query<WallSeries>(
    `select se.id, se.name, se.edition_line as "editionLine"
       from series se
      where exists (select 1 from volume v
                     where v.series_id = se.id and ${IN_THE_HOUSE})
      order by lower(se.name), se.edition_line nulls first, se.id`
  );
}

/**
 * The publishers the house holds something of, once each, by name.
 *
 * A publisher is a string on a Volume rather than a row of its own, so this is the closest
 * thing to a vocabulary there is for it — and it is derived from the shelf for the reason
 * the Series are: what the wall offers to narrow by is what the wall can be narrowed to.
 */
export async function listCollectionPublishers(): Promise<string[]> {
  const rows = await query<{ publisher: string }>(
    `select v.publisher
       from volume v
      where ${IN_THE_HOUSE}
      group by v.publisher
      order by lower(v.publisher)`
  );

  return rows.map((row) => row.publisher);
}
