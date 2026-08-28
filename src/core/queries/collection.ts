import "server-only";

import { query } from "../db.ts";

/**
 * One Volume as the Collection shows it: everything about the object, and nothing about
 * the narrative.
 *
 * There is no medium here because there is none in the model — an owned ebook is not
 * something this app can hold (see `db/migrations/0005_02_volume_and_the_collection.sql`).
 * Money and days are strings rather than `number` and `Date`: `24.90` is what the owner
 * typed and what both doors render, and a float would make it `24.900000000000002` on the
 * way through.
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
  purchaseDate: string | null;
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
 * in the Must Have already*. A Volume the owner released is not here and never comes back;
 * its row is kept, because Readings made through it are still true.
 */
export async function searchCollection(filter: CollectionFilter): Promise<CollectionVolume[]> {
  return query<CollectionVolume>(
    `select v.id,
            v.title,
            v.publisher,
            v.edition_line                       as "editionLine",
            jsonb_build_object('id', b.id, 'name', b.name) as binding,
            v.language,
            v.price_paid::text                   as "pricePaid",
            to_char(v.purchase_date, 'YYYY-MM-DD') as "purchaseDate",
            v.isbn
       from volume v
       join binding b on b.id = v.binding_id
      where v.released_on is null
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
 * One Volume as its own page shows it: the object, and whether it is still in the house.
 *
 * `releasedOn` is here and not on `CollectionVolume` because the Collection is the Volumes
 * in the house and everything it answers with is in it — the column would be null in every
 * row of it. One object's own page is the only place the question is open.
 */
export type RecordedVolume = CollectionVolume & {
  /** The day it left the house, or `null` while the owner still has it. */
  releasedOn: string | null;
};

/**
 * One Volume, owned or released, or `null` where there is no such object.
 *
 * **Released ones are answered with, unlike `searchCollection`.** The Collection is what is
 * in the house and a released Volume is not in it; one object's own page is a record of the
 * object, and what the owner learned about it — its Edition note, the Stories it carried —
 * outlives their owning it.
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
            v.price_paid::text as "pricePaid",
            to_char(v.purchase_date, 'YYYY-MM-DD') as "purchaseDate",
            v.isbn,
            to_char(v.released_on, 'YYYY-MM-DD') as "releasedOn"
       from volume v
       join binding b on b.id = v.binding_id
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
    "select count(*) as owned from volume where released_on is null"
  );
  return Number(row.owned);
}
