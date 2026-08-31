import "server-only";

import type { CoverSourceName } from "../covers.ts";
import { query } from "../db.ts";

// WHAT A TILE IS FACED WITH, and how far the walls have got.
//
// A cover is a reference and never bytes (ADR-0013), so there is nothing here that reads an
// image and nothing that could: what a wall needs off a Volume is a URL, who it belongs to,
// and — for the day the public page ships — the source's own page for the book.

/**
 * The image a tile is faced with, resolved: **the owner's own first, then whatever the
 * lookup found.**
 *
 * The order is the decision. A looked-up cover is 128 pixels wide and somebody else can
 * withdraw it; an owner's photograph is theirs, at whatever size they took it, is the only
 * thing that will ever face a Bonelli monthly, and is the one image this application is
 * allowed to keep. So the photograph wins wherever there is one, and no screen decides that
 * for itself.
 */
export type FacedWith = {
  url: string;
  /** Whose bytes these are: `own` for the owner's photograph, otherwise the source asked. */
  from: "own" | CoverSourceName;
  /**
   * The source's own page for this book, where the source publishes one.
   *
   * Nothing on the owner's surface needs it. It is selected because the *public* page owes
   * Google Books "a prominent link to … the Google Books page for that book", and a column
   * a screen has to go back for is a column that gets fetched on a render.
   */
  at?: string | null;
};

/**
 * **What a tile is faced with**, as SQL — the one resolution of the fallback chain, named
 * once for every wall that lays a tile out.
 *
 * Exported for the reason `IN_THE_HOUSE` is: the Collection wall, one object's own page and
 * the Story wall all ask this, and a second copy of it would be a second answer — a wall
 * that showed Google's cover over a photograph the owner took, on one screen out of three,
 * is exactly the bug this shape exists to make impossible.
 *
 * The fragment names the Volume `v`, so a statement using it selects from `volume v`.
 */
export const THE_COVER_IT_IS_FACED_WITH = `
  case when v.own_image_url is not null
            then jsonb_build_object('url', v.own_image_url, 'from', 'own')
       when v.cover_url is not null
            then jsonb_build_object('url', v.cover_url, 'from', v.cover_source,
                                    'at', v.cover_info_url)
  end`;

/**
 * How far the covers have got, and what is left that a lookup could reach.
 *
 * **The three numbers are not a proportion of one another, which is why they are three.**
 * `due` is the gap a lookup could still close; `withoutAnIsbn` is a gap nothing keyed by an
 * ISBN can ever close — every Bonelli monthly carries an ISSN-derived periodical EAN and no
 * ISBN at all, so those objects are not waiting for a lookup, they are waiting for a
 * photograph. A screen that showed one figure would let the owner run the lookup for ever
 * expecting the second number to move.
 *
 * **It is deliberately not a `Covered<Figure>`** (`queries/library.ts`, and the rule
 * `AGENTS.md` states under *Where a figure goes*). That contract exists for an aggregate
 * whose denominator says **how far it can be trusted** — *18 of 77 acquisitions carried a
 * price* is what makes a total honest. Here the fraction **is the report**: *31 of 96 Volumes
 * are faced* is the thing being said, the way *67 of 77 Stories are unread* is, and the rule
 * says in as many words that it does not reach one of those. Wrapping it would claim the
 * count of covers was measured over a sample, which it is not — it is measured over all of
 * them, and that is the answer.
 */
export type CoverStanding = {
  /** Every catalogued Volume. */
  volumes: number;
  /** How many are faced with something: a looked-up cover, or the owner's own image. */
  faced: number;
  /**
   * How many carry an ISBN and no cover: **the gap a lookup could still close.**
   *
   * Not the size of a run. A run draws from every Volume with an ISBN, oldest look first,
   * because it re-checks the covers it already has as well as asking about the ones it does
   * not — so this number is what the lookup is *for*, and `stillDue` on the run's own report
   * is what a second press would start with.
   */
  due: number;
  /** How many carry no ISBN, which no lookup will ever reach. */
  withoutAnIsbn: number;
};

/** How far the covers have got. */
export async function coverStanding(): Promise<CoverStanding> {
  const [row] = await query<{
    volumes: string;
    faced: string;
    due: string;
    withoutAnIsbn: string;
  }>(
    `select count(*)                                                        as volumes,
            count(*) filter (where v.own_image_url is not null
                                or v.cover_url is not null)                 as faced,
            count(*) filter (where v.isbn is not null
                               and v.cover_url is null)                     as due,
            count(*) filter (where v.isbn is null)                          as "withoutAnIsbn"
       from volume v`
  );

  return {
    volumes: Number(row.volumes),
    faced: Number(row.faced),
    due: Number(row.due),
    withoutAnIsbn: Number(row.withoutAnIsbn),
  };
}
