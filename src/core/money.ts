import "server-only";

import { Refusal } from "./refusal.ts";

// WHAT A PRICE IS, as the owner types it — and it sits beside `db.ts` and `covers.ts` rather
// than in an area, because what it knows is a value and not a question about the library.
//
// **It exists because of a keyboard.** A price becomes `numeric` on the way into Postgres, so
// the shape has to be checked before it gets there: `6,50` raises a *syntax* error rather
// than an integrity violation, and `refusing` deliberately never launders a syntax error into
// an answer, so the owner would meet a 500 with their whole entry gone. Two verbs did that
// check, each with its own copy of the regex, and the comment in `verbs/wish.ts` said the
// duplication was deliberate: "the shared thing would be a `utils.ts` and each verb owns what
// it refuses."
//
// **That reasoning is reversed here, and it is worth saying why rather than quietly moving
// the code.** What the two verbs were sharing then was a regex, which is a layer's business.
// What they share now is a fact about the owner: the numeric keyboard on an Italian phone has
// a **comma and no dot**, and the Collection is used one-handed in a shop. So *a price may be
// written either way* is a rule about the domain's own vocabulary, it has to be true in every
// place a price is typed, and a second copy of it is a screen where the owner cannot enter
// what they paid. That is a thing to name, and naming it is not a `utils.ts`.
//
// What the verbs still own is **when** a price is asked for and what it means; this owns only
// what one looks like.

// At most one separator, at most two decimals, no currency and no thousands mark. A comma or
// a dot: the two ways the same number is written, on the two keyboards the owner has.
const AMOUNT = /^[0-9]+([.,][0-9]{1,2})?$/;

/** The one sentence the owner reads, wherever a price was not one. */
const NOT_A_PRICE =
  "A price is a number with no currency: 6.50 or 6,50, whichever your keyboard gives you.";

/**
 * A price on its way into `numeric` — **as Postgres takes it**, whichever way it was typed.
 *
 * A comma becomes a dot here rather than anywhere further in, because that is the last place
 * the value is still text the owner wrote. Below this it is a number, and above it is a form
 * field on a phone.
 *
 * A blank is **not a price**: a door that hands the core an empty box — a form field nobody
 * filled, an assistant sending `""` for a number it does not know — means the number is
 * unknown. It answers `null`, which is the fact that there is no price, and never `0`, which
 * would be a claim about money.
 */
export function priceAsTyped(price: string | null | undefined): string | null {
  if (price === null || price === undefined) return null;

  const written = price.trim();
  if (written === "") return null;
  if (!AMOUNT.test(written)) throw new Refusal("invalid", NOT_A_PRICE);

  return written.replace(",", ".");
}
