import type { Covered } from "@/core/queries/library";
import type { OpenWish } from "@/core/queries/wish";

// **How a shopping list is read**, and it is a file for the reason `../pile/entry.ts`
// is one: three screens say it now. The Wishes screen bands the list by the month each Wish
// is planned into, and the Pile and the one door offer the same months in the picker beside
// *Want it* and *I want to buy it* — where the three priorities were a second copy under a
// comment saying *as the Wishes screen names them*, which is a second answer waiting to
// happen.
//
// The banding is the screen's, the way every band in this application is: what the core
// answers with is the list in the order the owner buys in, and cutting it into the months
// they buy in is a judgement about reading rather than about the model.
//
// One rule holds the whole file together, and it is the Wish's own: **nothing silently
// disappears from what the owner meant to buy** (`@/core/verbs/wish`). So the bands are built
// out of the periods that are *there* rather than by filtering a fixed list of months down to
// them — an empty heading cannot arise, a month that has gone by keeps its band instead of
// being folded into this one, and neither can a Wish be on the list and on no band of it.
//
// **A month that has gone by is not a state** (ADR-0023). It gets a word — *still waiting* —
// and nothing else: no colour, no warning, no reordering. A period is a plan the owner wrote
// down, and this application does not enforce the owner's plans.
//
// Nothing is imported but a type, which is erased: this file is read by a client component
// (`../add/the-object.tsx`) and holds no server import for that reason.

/**
 * **The acts on this screen that need a field**, named here rather than in the page for the
 * reason `../paths/acts.ts` gives: the page reads `?panel=` against these names and the Server
 * Functions behind the forms send the owner back into the same panel when a verb refuses. Two
 * files spelling one panel is a rename that drops a refusal behind a closed drawer.
 *
 * *Close it* is not among them, because it asks for nothing: **a press that asks for nothing
 * is a plain form and not a panel**, and a drawer in front of it would be a door in front of
 * a door.
 */
export const OPENING_A_WISH = "open";
export const BUYING_WHAT_WAS_WISHED = "bought";
export const REPLANNING_A_WISH = "amend";

/** Which Wish a per-card panel stands over, as the address spells it. */
export const THE_WISH_A_PANEL_IS_ABOUT = "wish";

/** The months the picker offers, counting the one the owner is standing in. */
const MONTHS_ON_OFFER = 6;

/** How a month is written everywhere both doors say one: `2026-09`. */
export function theMonthOf(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`;
}

/** The month `count` months after the one `day` stands in, written the same way. */
function theMonthAfter(day: Date, count: number): string {
  return theMonthOf(new Date(day.getFullYear(), day.getMonth() + count, 1));
}

/**
 * What a period is called on screen: *September 2026*, and **Someday** for no period at all.
 *
 * *Someday* is a word rather than a gap because it is an answer the owner picked — the
 * absence of a plan and not a missing field — which is why it is the one band with no month
 * and why the picker offers it as a choice.
 */
export function periodNamed(period: string | null): string {
  if (period === null) return "Someday";

  const [year, month] = period.split("-");
  const named = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  // A period the vocabulary cannot read is called by what it says. The database constrains one
  // to the first of a month, so this is about a period that cannot exist — it is here for the
  // reason the rest of this file is: the alternative to naming it is dropping it, and a
  // shopping list that quietly loses a row is the one thing this area refuses to be.
  return named === "Invalid Date" ? period : named;
}

/** What a month means from where the owner is standing, or nothing where it means nothing. */
function whenItIs(period: string | null, today: Date): string | null {
  if (period === null) return "not yet";
  if (period === theMonthOf(today)) return "this month";
  if (period === theMonthAfter(today, 1)) return "next month";
  // Ordinary rather than late: the plan did not happen, and the row says so by still being
  // here in its own month.
  return period < theMonthOf(today) ? "still waiting" : null;
}

/** One month the picker offers, as the owner reads it. */
export type PeriodOnOffer = {
  /** `2026-09`, or the empty string for *Someday* — which is what a form submits for no plan. */
  value: string;
  name: string;
  hint: string | null;
};

/**
 * The months a Wish can be planned into from where the owner is standing: this one, the five
 * after it, and *Someday*.
 *
 * **It is a shortcut and never the whole of what a period can be.** Six months is as far ahead
 * as anybody has a plan; an owner who has one further out writes the month, because the field
 * takes a month and every door checks the month rather than this list. So a Wish already
 * planned into a period the picker does not offer keeps it — `chosen` is what puts it back in
 * front of the owner rather than quietly re-planning it on the way into a form.
 */
export function thePeriodsOnOffer(today: Date, chosen?: string | null): PeriodOnOffer[] {
  const months = Array.from({ length: MONTHS_ON_OFFER }, (_, after) => theMonthAfter(today, after));
  if (chosen && !months.includes(chosen)) months.push(chosen);
  months.sort();

  return [
    ...months.map((month) => ({
      value: month,
      name: periodNamed(month),
      hint: whenItIs(month, today),
    })),
    { value: "", name: periodNamed(null), hint: whenItIs(null, today) },
  ];
}

/** A price in whole cents, or nothing where there is no price to read. */
function cents(price: string | null): number | null {
  if (price === null) return null;
  const amount = Number(price);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

/** A number of cents written the way every price in this application is: `24.90`. */
function asMoney(amount: number): string {
  return (amount / 100).toFixed(2);
}

/**
 * **What a band comes to**: the price found where there is one, the target price where there
 * is not, added up over the Wishes that named either.
 *
 * The one figure a period made askable — *what does this month cost?* — and it could not be
 * asked of *soon*. It carries its own coverage, like every partial figure in this application
 * (`Covered` in `@/core/queries/library`), because a total over three of eight Wishes read as
 * *what this month costs* would be wrong and no heading can defend itself against that: the
 * denominator has to arrive with the number.
 *
 * The price found leads the target on purpose. The target is what the owner decided at a desk
 * and the found price is what the shop is actually charging, so where both exist the second is
 * the money that will leave the account.
 */
function whatItComesTo(wishes: readonly OpenWish[]): Covered<string> {
  const priced = wishes
    .map((wish) => cents(wish.priceFound) ?? cents(wish.targetPrice))
    .filter((amount): amount is number => amount !== null);

  return {
    figure: asMoney(priced.reduce((total, amount) => total + amount, 0)),
    from: priced.length,
    of: wishes.length,
  };
}

/** One step of the list: the month, what it is called, what it means, and what is under it. */
export type ShoppingBand = {
  /** `2026-09`, or `null` for *Someday*. */
  period: string | null;
  name: string;
  /** What the month means from here — *this month*, *still waiting* — where it means anything. */
  hint: string | null;
  /** What the band comes to, with the coverage the figure has to arrive with. */
  comesTo: Covered<string>;
  wishes: OpenWish[];
};

/**
 * The open Wishes, banded into the months they are planned into.
 *
 * The order **inside** a band is the core's and is not touched: the oldest intention first,
 * because a Wish that has been waiting is one the owner keeps meaning to act on. Inside one
 * month the order matters least of all — the owner buys all of them — which is the reason
 * there is no rank to drag a row up.
 *
 * The bands are the periods the list carries, earliest first, with *Someday* at the foot: a
 * plan with no month is the one thing that is never next.
 */
export function theShoppingList(wishes: readonly OpenWish[], today: Date): ShoppingBand[] {
  const banded = new Map<string, OpenWish[]>();

  for (const wish of wishes) {
    const key = wish.period ?? "";
    banded.set(key, [...(banded.get(key) ?? []), wish]);
  }

  return [...banded.entries()]
    .sort(([one], [other]) => theOrderOfBands(one, other))
    .map(([key, inIt]) => {
      const period = key === "" ? null : key;
      return {
        period,
        name: periodNamed(period),
        hint: whenItIs(period, today),
        comesTo: whatItComesTo(inIt),
        wishes: inIt,
      };
    });
}

/** Earliest month first, and *Someday* — the empty key — after every month. */
function theOrderOfBands(one: string, other: string): number {
  if (one === other) return 0;
  if (one === "") return 1;
  if (other === "") return -1;
  return one < other ? -1 : 1;
}

/**
 * Which per-card panel the address is asking for, read against **the Wishes that are actually
 * on the list** rather than trusted.
 *
 * The rule every filter and every panel in this application is held to: `?panel=banana` opens
 * nothing, and neither does `?panel=bought&wish=` naming a Wish that has ended or never
 * existed — otherwise a hand-typed address would stand a *Bought it* form over nothing at all.
 */
export type PanelStanding =
  | { act: typeof OPENING_A_WISH }
  | { act: typeof BUYING_WHAT_WAS_WISHED | typeof REPLANNING_A_WISH; wish: OpenWish }
  | null;

export function thePanelStanding(
  panel: string | undefined,
  about: string | undefined,
  wishes: readonly OpenWish[]
): PanelStanding {
  if (panel === OPENING_A_WISH) return { act: OPENING_A_WISH };
  if (panel !== BUYING_WHAT_WAS_WISHED && panel !== REPLANNING_A_WISH) return null;

  const wish = wishes.find((one) => one.id === about);
  return wish ? { act: panel, wish } : null;
}

/**
 * **Everything the tile beside a Wish cannot fit**, in the order a shop would say it: what
 * it is, which edition line, whose printing, and how it is bound.
 *
 * It is the tile's accessible name and its tooltip, and it is here for the reason
 * `storyDetail` is beside the Story wall's words: a tile the pointer describes one way and
 * the row beside it another would be two answers about one object. What the object has not
 * got is left out rather than printed as a gap — the binding is the last word because it is
 * the one that tells two printings of one title apart on a shelf.
 */
export function wishDetail(wish: OpenWish): string {
  return [
    wish.volume.title,
    wish.volume.editionLine,
    wish.volume.publisher,
    wish.volume.binding.name,
  ]
    .filter(Boolean)
    .join(" — ");
}
