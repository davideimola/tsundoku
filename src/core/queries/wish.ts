import "server-only";

import { query } from "../db.ts";

/**
 * One open Wish, as a shopping list shows it: what to buy, how much it should cost, how
 * much it does, and where.
 *
 * The Volume comes with it rather than as an id, because a Wish is only useful with the
 * object's name on it — this is the list read standing in a shop, and it is the list an
 * external assistant reads over MCP to suggest a purchase.
 *
 * Money is a string, as everywhere in this repo: `12.90` is what the owner typed and what
 * both doors render, and a float would make it `12.900000000000002` on the way through.
 *
 * There is no state field, and there is nothing missing. A Wish on this list is open, and
 * open is the only state a Wish has: one that ended is not here at all (see
 * `db/migrations/0010_01_wish_is_an_open_intention.sql` for why `Acquistato` is not
 * representable).
 */
export type OpenWish = {
  id: string;
  /** 1 next, 2 soon, 3 someday. What the list is ordered by. */
  priority: number;
  targetPrice: string | null;
  priceFound: string | null;
  /**
   * Whether the price found is at or under the target — the question the two numbers are
   * there to answer, subtracted once here rather than by every reader. Null while either
   * number is unknown, which is not the same as false.
   */
  withinTarget: boolean | null;
  shop: string | null;
  openedOn: string;
  volume: {
    id: string;
    title: string;
    publisher: string;
    editionLine: string | null;
    binding: { id: string; name: string };
    language: string;
    isbn: string | null;
  };
  /**
   * Whether the Volume this Wish names is in the Collection right now.
   *
   * A fact about the shelf, never a state of the Wish: owning the object does not end the
   * intention to buy it, and only the owner ends that. It is here because a shopping list
   * that quietly overlapped the Collection would be the one thing worse than no list — so
   * the overlap is shown, and the owner decides.
   */
  inCollection: boolean;
};

/**
 * The shopping list: every open Wish, in the order the owner buys in.
 *
 * Priority first, and within one priority the oldest intention first — a Wish that has
 * been waiting is a Wish the owner keeps meaning to act on. This is the query the MCP door
 * exposes for reading what the owner means to buy.
 */
export async function listOpenWishes(): Promise<OpenWish[]> {
  return query<OpenWish>(
    `select w.id,
            w.priority,
            w.target_price::text as "targetPrice",
            w.price_found::text  as "priceFound",
            case
              when w.target_price is null or w.price_found is null then null
              else w.price_found <= w.target_price
            end                  as "withinTarget",
            w.shop,
            to_char(w.opened_on, 'YYYY-MM-DD') as "openedOn",
            jsonb_build_object(
              'id', v.id,
              'title', v.title,
              'publisher', v.publisher,
              'editionLine', v.edition_line,
              'binding', jsonb_build_object('id', b.id, 'name', b.name),
              'language', v.language,
              'isbn', v.isbn
            )                    as volume,
            v.released_on is null as "inCollection"
       from wish w
       join volume v on v.id = w.volume_id
       join binding b on b.id = v.binding_id
      where w.closed_on is null
      order by w.priority, w.opened_on, lower(v.title), w.id`
  );
}

/** How many Wishes are open. The number on the screen, counted rather than fetched. */
export async function countOpenWishes(): Promise<number> {
  const [row] = await query<{ open: string }>(
    "select count(*) as open from wish where closed_on is null"
  );
  return Number(row.open);
}

/** A Volume the owner can open a Wish on, named well enough to pick out of a list. */
export type WishableVolume = {
  id: string;
  title: string;
  publisher: string;
  editionLine: string | null;
  binding: string;
  /** Whether it is in the Collection, so the picker can say so rather than hide it. */
  inCollection: boolean;
};

/**
 * Every Volume a Wish could name.
 *
 * The Wish screen's own question rather than the Collection's, which is why it lives
 * here: a Wish names a Volume whether or not it is on the shelf, so this deliberately
 * does not read `released_on is null`. A Volume that left the house is a Volume the owner
 * can want again.
 *
 * A Volume that is *not in the library at all* is not offered and cannot be: creating one
 * is not this door's to do (ADR-0005), and a Wish naming a Volume nobody recorded is a
 * proposal for the Inbox rather than a row here.
 */
export async function listWishableVolumes(): Promise<WishableVolume[]> {
  return query<WishableVolume>(
    `select v.id,
            v.title,
            v.publisher,
            v.edition_line as "editionLine",
            b.name         as binding,
            v.released_on is null as "inCollection"
       from volume v
       join binding b on b.id = v.binding_id
      order by lower(v.title), b.display_order, v.id`
  );
}
