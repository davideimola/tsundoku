import "server-only";

import { query } from "../db.ts";
import { priceAsTyped } from "../money.ts";
import { Refusal, refusing } from "../refusal.ts";

/**
 * What the owner decides when they mean to buy something: a named Volume, how soon, what
 * it should cost, what it does cost and where.
 *
 * **This type is the proposal.** A caller that wants to *suggest* a Wish rather than open
 * one — the Reading list, when an entry needs a Volume the owner does not own — builds one
 * of these, shows it, and does not call `openWish`. Buying stays a decision: nothing in
 * this module writes until the verb is called, and there is no second path that writes.
 */
export type ProposedWish = {
  /** The Volume the owner means to buy. It must already be in the library (ADR-0005). */
  volumeId: string;
  /** 1 next, 2 soon, 3 someday. */
  priority: number;
  /** What it should cost, as the owner typed it: `15.00`. */
  targetPrice?: string | null;
  /** What it costs where they found it: `12.90`. */
  priceFound?: string | null;
  /** Where that price was — a name the owner reads, not a vocabulary. */
  shop?: string | null;
};

// A Volume's id is generated, so the owner never types one: what arrives here came from a
// picker or from an assistant reading the library over MCP. A malformed id is the same
// event as an unknown one — there is nothing to want — and saying so here keeps it from
// reaching the driver as a syntax error on a uuid column.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_SUCH_VOLUME =
  "No Volume has that id. A Volume that is not in the library yet is a proposal, not a Wish.";

// The picker's three labels, in one place: the prose the owner reads is the same whether
// the value never was one of the three or the database was the one to say so.
const NOT_A_PRIORITY = "A priority is 1 (next), 2 (soon) or 3 (someday).";

/**
 * Open a Wish: the owner means to acquire this Volume, and it joins the shopping list.
 *
 * It names a Volume that already exists and never creates one — a title nobody recorded is
 * an Inbox proposal the owner approves, not a row this verb writes (ADR-0005).
 *
 * Nothing else follows from it. The Volume is not touched, the Collection does not change,
 * and no Reading or Series is implied: a Wish is an intention and the only thing it changes
 * is what the owner is planning to buy.
 *
 * Refused where there is already an open Wish for that Volume, so that the list cannot say
 * *buy this* twice for one object.
 */
export async function openWish(wish: ProposedWish): Promise<{ id: string }> {
  if (!UUID.test(wish.volumeId)) {
    throw new Refusal("not-found", NO_SUCH_VOLUME);
  }
  if (!Number.isInteger(wish.priority)) {
    throw new Refusal("invalid", NOT_A_PRIORITY);
  }
  const targetPrice = priceAsTyped(wish.targetPrice);
  const priceFound = priceAsTyped(wish.priceFound);

  const rows = await refusing(
    () =>
      query<{ id: string }>(
        `insert into wish (volume_id, priority, target_price, price_found, shop)
         values ($1, $2, $3, $4, $5)
         returning id`,
        [wish.volumeId, wish.priority, targetPrice, priceFound, wish.shop ?? null]
      ),
    (constraint) => {
      switch (constraint) {
        case "wish_volume_id_fkey":
          return NO_SUCH_VOLUME;
        case "wish_one_open_per_volume":
          return "There is already an open Wish for that Volume.";
        case "wish_priority_is_one_to_three":
          return NOT_A_PRIORITY;
        case "wish_target_price_is_not_negative":
        case "wish_price_found_is_not_negative":
          return "A price is not negative. Leave it empty while it is unknown.";
        case "wish_shop_is_not_blank":
          return "Leave the shop empty rather than blank.";
        default:
          return "That Wish could not be opened.";
      }
    }
  );

  return rows[0];
}

/**
 * End a Wish, deliberately: it leaves the shopping list today.
 *
 * **This is the only thing that ends one.** Acquiring the Volume does not, releasing it
 * does not, and no other verb in this repo writes that day — the owner's stated reason is
 * that nothing should silently disappear from what they meant to buy. What ending meant —
 * bought here, bought elsewhere, no longer wanted — is deliberately not recorded: a
 * fulfilled Wish is a Wish that ended, and `Acquistato` is not a state this model has.
 *
 * The row is kept rather than deleted, so the same Volume can be wished again later and the
 * history of having wanted it survives.
 *
 * Refused on a Wish that has already ended, rather than passing silently: it is off the
 * list already, so a second close is a mistake worth naming.
 */
export async function closeWish(wishId: string): Promise<void> {
  if (!UUID.test(wishId)) {
    throw new Refusal("not-found", "No Wish has that id.");
  }

  // One statement, so the read that diagnoses a no-op cannot disagree with the write:
  // `known` sees the Wish as it was, `ended` is the close when there was one to make.
  const [outcome] = await refusing(
    () =>
      query<{ known: boolean; ended: boolean }>(
        `with known as (
           select id from wish where id = $1
         ), ended as (
           update wish set closed_on = current_date
            where id = $1 and closed_on is null
           returning id
         )
         select exists (select 1 from known) as known,
                exists (select 1 from ended) as ended`,
        [wishId]
      ),
    "That Wish could not be closed."
  );

  if (!outcome.known) throw new Refusal("not-found", "No Wish has that id.");
  if (!outcome.ended) throw new Refusal("not-allowed", "That Wish has already ended.");
}
