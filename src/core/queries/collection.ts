import "server-only";

import { query } from "../db.ts";

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
            to_char(latest.released_on, 'YYYY-MM-DD') as "releasedOn"
       from volume v
       join binding b on b.id = v.binding_id
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
