import "server-only";

import { query } from "../db.ts";
import { priceAsTyped } from "../money.ts";
import { Refusal, refusing } from "../refusal.ts";
import type { Executor } from "../transaction.ts";

/**
 * What the owner decides when they mean to buy something: a named Volume, how soon, what
 * it should cost, what it does cost and where.
 *
 * **This type is the proposal.** A caller that wants to *suggest* a Wish rather than open
 * one — the Pile, when an entry needs a Volume the owner does not own — builds one
 * of these, shows it, and does not call `openWish`. Buying stays a decision: nothing in
 * this module writes until the verb is called, and there is no second path that writes.
 */
export type ProposedWish = {
  /** The Volume the owner means to buy. It must already be in the library (ADR-0005). */
  volumeId: string;
  /**
   * The month it is planned into, written `2026-09`, or nothing at all — which is *someday*
   * and the absence of a plan rather than a third word for one (ADR-0023).
   */
  period?: string | null;
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

const NO_SUCH_WISH = "No Wish has that id.";

// Said twice now — closing one and replanning one — because both are acts on something that
// is on the list, and a Wish that ended is not. Buying what one names says it too, by closing
// the Wish first and letting this sentence come back out of that.
const THAT_WISH_HAS_ENDED = "That Wish has already ended.";

// A month, and never a day: `2026-09` is what both doors say and what the picker submits.
// The column holds the first of that month, which is what `wish_period_is_a_month` refuses
// anything else for — so the shape is checked here, before `to_date` gets a chance to read
// `2026-13` as a date somewhere in 2027.
const MONTH = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

// One sentence for both halves of the same mistake: a month that is not one, and the empty
// box that is a plan rather than a typo.
const NOT_A_PERIOD = "A period is a month, written 2026-09. Leave it empty for someday.";

/**
 * The month a Wish is planned into, on its way into a `date` — or `null`, which is *someday*.
 *
 * A blank is **not** a period, exactly as a blank is not a price (`../money.ts`): a form
 * field nobody filled and an assistant sending `""` both mean there is no plan, and *someday*
 * is a real answer rather than a missing one.
 */
function theMonthItIs(period: string | null | undefined): string | null {
  if (period === null || period === undefined) return null;

  const written = period.trim();
  if (written === "") return null;
  if (!MONTH.test(written)) throw new Refusal("invalid", NOT_A_PERIOD);

  return written;
}

/**
 * Open a Wish: the owner means to acquire this Volume, and it joins the shopping list.
 *
 * It names a Volume that already exists and never creates one — a title nobody recorded is
 * an Inbox proposal the owner approves, not a row this verb writes (ADR-0005).
 *
 * Nothing else follows from it. The Volume is not touched, the Collection does not change,
 * and no Pass or Series is implied: a Wish is an intention and the only thing it changes
 * is what the owner is planning to buy.
 *
 * Refused where there is already an open Wish for that Volume, so that the list cannot say
 * *buy this* twice for one object.
 *
 * `run` is how the one door runs this inside its own transaction (`what-happened.ts`, and
 * `../transaction.ts` for why a verb takes one at all): *I want to buy it* catalogues the
 * object and wishes for it in one breath, and an object catalogued with no Wish on it is a row
 * about nothing.
 */
export async function openWish(wish: ProposedWish, run: Executor = query): Promise<{ id: string }> {
  if (!UUID.test(wish.volumeId)) {
    throw new Refusal("not-found", NO_SUCH_VOLUME);
  }
  const period = theMonthItIs(wish.period);
  const targetPrice = priceAsTyped(wish.targetPrice);
  const priceFound = priceAsTyped(wish.priceFound);

  const rows = await refusing(
    () =>
      run<{ id: string }>(
        `insert into wish (volume_id, period, target_price, price_found, shop)
         values ($1, to_date($2, 'YYYY-MM'), $3, $4, $5)
         returning id`,
        [wish.volumeId, period, targetPrice, priceFound, wish.shop ?? null]
      ),
    (constraint) => {
      switch (constraint) {
        case "wish_volume_id_fkey":
          return NO_SUCH_VOLUME;
        case "wish_one_open_per_volume":
          return "There is already an open Wish for that Volume.";
        case "wish_period_is_a_month":
          return NOT_A_PERIOD;
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
 *
 * `run` is how `bought-what-was-wished.ts` closes one inside its own transaction: the
 * acquisition and the end of the intention are one press, so they land together or not at
 * all (ADR-0023, and `../transaction.ts` for why a verb takes an executor at all).
 */
export async function closeWish(wishId: string, run: Executor = query): Promise<void> {
  if (!UUID.test(wishId)) {
    throw new Refusal("not-found", NO_SUCH_WISH);
  }

  // One statement, so the read that diagnoses a no-op cannot disagree with the write:
  // `known` sees the Wish as it was, `ended` is the close when there was one to make.
  const [outcome] = await refusing(
    () =>
      run<{ known: boolean; ended: boolean }>(
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

  if (!outcome.known) throw new Refusal("not-found", NO_SUCH_WISH);
  if (!outcome.ended) throw new Refusal("not-allowed", THAT_WISH_HAS_ENDED);
}

/**
 * What the owner rewrites when a plan changes: the month, the two prices, the shop.
 *
 * **A field that is absent leaves what stands there, and a field that is present and empty
 * clears it** — which is the one way this parts from `amendVolume`, `amendStory` and
 * `amendSeries`, and it parts deliberately (ADR-0023). Those three cannot empty anything,
 * because an assistant *proposes* them through the Inbox and *this Volume has no publisher*
 * is a proposal to lose a fact (ADR-0011). This one is the owner's own plan about their own
 * money: moving a Wish to *someday* **is** emptying the period, and a price that is no longer
 * on the shelf is a number to take off rather than to leave standing as a lie.
 *
 * The Volume is not here and never will be. A Wish that names the wrong object is closed;
 * correcting the object is `amendVolume` on the object's own page.
 */
export type WishAmendment = {
  /** The month it is planned into, `2026-09`, or empty for *someday*. */
  period?: string | null;
  targetPrice?: string | null;
  priceFound?: string | null;
  shop?: string | null;
};

/**
 * Replan an open Wish: it stays the same intention, opened on the same day, and says
 * something different about when and for how much.
 *
 * **It exists so that replanning is not a delete.** Changing a priority used to mean closing
 * a Wish and opening a new one, which loses `opened_on` — the fact the list orders by and the
 * one that says *you have been meaning to buy this since March* — and it made the owner end an
 * intention in order to reschedule it, in an area whose whole rule is that nothing disappears
 * from what they meant to buy.
 *
 * Nothing else follows from it: no acquisition, no Volume touched, no Wish opened or ended.
 *
 * Refused on a Wish that has already ended — it is off the list, so what it says about a
 * month is nobody's plan — and on an amendment that changes nothing, because a write that
 * writes nothing is a press the owner would read as having worked.
 */
export async function amendWish(wishId: string, amendment: WishAmendment): Promise<void> {
  if (!UUID.test(wishId)) throw new Refusal("not-found", NO_SUCH_WISH);

  // The columns are a closed list written here — nothing a caller supplies reaches the
  // statement except as a parameter — and the `in` checks are what carry the type's own
  // distinction into SQL: a key that is not there is a column the `set` clause never names,
  // where a key holding nothing is a column set to null. `coalesce`, which is how
  // `amendVolume` says *leave it standing*, cannot say the second thing at all.
  const values: unknown[] = [wishId];
  const changes: string[] = [];

  if ("period" in amendment) {
    values.push(theMonthItIs(amendment.period));
    changes.push(`period = to_date($${values.length}, 'YYYY-MM')`);
  }
  if ("targetPrice" in amendment) {
    values.push(priceAsTyped(amendment.targetPrice));
    changes.push(`target_price = $${values.length}`);
  }
  if ("priceFound" in amendment) {
    values.push(priceAsTyped(amendment.priceFound));
    changes.push(`price_found = $${values.length}`);
  }
  if ("shop" in amendment) {
    values.push(amendment.shop ?? null);
    changes.push(`shop = $${values.length}`);
  }

  if (changes.length === 0) {
    throw new Refusal("invalid", "An amendment changes at least one field of the Wish.");
  }

  // One statement, for `closeWish`'s reason: `known` sees the Wish as it was, `amended` is
  // the write when there was an open one to make it on.
  const [outcome] = await refusing(
    () =>
      query<{ known: boolean; amended: boolean }>(
        `with known as (
           select id from wish where id = $1
         ), amended as (
           update wish set ${changes.join(", ")}
            where id = $1 and closed_on is null
           returning id
         )
         select exists (select 1 from known) as known,
                exists (select 1 from amended) as amended`,
        values
      ),
    (constraint) => {
      switch (constraint) {
        case "wish_period_is_a_month":
          return NOT_A_PERIOD;
        case "wish_target_price_is_not_negative":
        case "wish_price_found_is_not_negative":
          return "A price is not negative. Leave it empty while it is unknown.";
        case "wish_shop_is_not_blank":
          return "Leave the shop empty rather than blank.";
        default:
          return "That Wish could not be amended.";
      }
    }
  );

  if (!outcome.known) throw new Refusal("not-found", NO_SUCH_WISH);
  if (!outcome.amended) throw new Refusal("not-allowed", THAT_WISH_HAS_ENDED);
}
