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
 * **Type is missing, and it is owed rather than forgotten.** The ticket asks for it, and
 * it cannot be answered from here yet: Type is an attribute of a *Story* (ADR-0006), so
 * reaching it from a Volume needs the Story ↔ Volume join, which is many-to-many and
 * belongs to the slice that builds it. Giving a Volume a `type_id` of its own would
 * answer the search by contradicting the model — a Volume holding three Stories of two
 * Types has no one Type — so this filter stays three fields wide until the join exists,
 * and then gains a fourth here.
 */
export type CollectionFilter = {
  /** Matched anywhere in the title, case-insensitively. */
  title?: string;
  /** Matched anywhere in the publisher, case-insensitively. */
  publisher?: string;
  /** A Binding id — exact, because it comes from the Binding vocabulary. */
  binding?: string;
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
      order by lower(v.title), b.display_order, v.id`,
    [filter.title ?? null, filter.publisher ?? null, filter.binding ?? null]
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
    "select count(*) as owned from volume where released_on is null"
  );
  return Number(row.owned);
}
