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

/** What narrows the Collection. Everything absent is everything. */
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
        and ($1::text is null or v.title ilike '%' || $1 || '%')
        and ($2::text is null or v.publisher ilike '%' || $2 || '%')
        and ($3::text is null or v.binding_id = $3)
      order by lower(v.title), b.display_order, v.id`,
    [filter.title ?? null, filter.publisher ?? null, filter.binding ?? null]
  );
}
