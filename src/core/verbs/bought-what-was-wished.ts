import "server-only";

import { Refusal } from "../refusal.ts";
import { transaction } from "../transaction.ts";
import { acquireVolume } from "./collection.ts";
import { closeWish } from "./wish.ts";

// **BOUGHT IT**: the one press on the shopping list that says why a Wish ended (ADR-0023).
//
// It is a file named after the sentence rather than after an area, for `what-happened.ts`'s
// reason: it reaches the Collection and the Wish at once, so it belongs to neither, and it
// **composes those areas' verbs rather than writing their SQL again** — which is what makes
// every refusal reach the owner in the words the area wrote.
//
// What it does not do is as much of the decision as what it does:
//
//   * **it writes no new kind of fact.** An acquisition and a `closed_on`, which is exactly
//     what the two verbs write on their own. There is still no `Acquistato`, and a Wish that
//     ended because the book was bought and one that ended because the owner stopped wanting
//     it are the same row afterwards — the acquisition beside it is what says which;
//   * **it does not guess at money.** What was paid arrives from the owner, prefilled by the
//     screen with the price the Wish found. *What it costs where I saw it* and *what I paid*
//     are two numbers that are usually equal and sometimes not, and a verb that copied one
//     into the other would be inventing a receipt;
//   * **it is not what acquiring means.** `acquireVolume` still ends nothing: an object that
//     comes home as a gift, as a second copy, or recorded from the Collection leaves the
//     intention standing, because only a deliberate act ends a Wish and that one is not it.

/** What the owner says about the money when the object comes home. */
export type WhatWasPaid = {
  /**
   * The day it came home, `YYYY-MM-DD`. Optional, as it is for any acquisition: the fact does
   * not depend on the day, and the database's own default is today.
   */
  acquiredOn?: string | null;
  /** What was actually paid, as the owner typed it: `12,90`. */
  pricePaid?: string | null;
};

const NO_SUCH_WISH = "No Wish has that id.";

// The same shape both areas check, and the check is here for the same reason it is there: an
// id nobody could have typed reaches the driver as a syntax error on a uuid column, and a
// syntax error is never laundered into an answer (`../refusal.ts`).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The object a Wish named came home: record the acquisition and end the Wish, in one breath.
 *
 * **One transaction, so it is one event.** The precedent is `sayWhatHappened`, which has
 * composed these same two areas since the one door shipped: *I bought it* catalogues an object
 * and acquires it together, and nobody calls that two events. Either half alone is a lie here
 * too — a Wish still on the list for a book on the shelf, or an object in the house the owner
 * is still being told to buy.
 *
 * **The Wish is closed first, and that order is the refusals.** A Wish nobody has, or one that
 * already ended, is refused in the Wish's own words before any money is written; an object the
 * house already holds is refused in the Collection's, and the close rolls back with it. So
 * nothing is ever half-written, and the sentence the owner reads is the one about what actually
 * went wrong.
 */
export async function boughtWhatWasWished(wishId: string, paid: WhatWasPaid = {}): Promise<void> {
  if (!UUID.test(wishId)) throw new Refusal("not-found", NO_SUCH_WISH);

  await transaction(async (run) => {
    await closeWish(wishId, run);

    // The Volume the intention named, read after the close rather than before it: the close is
    // what says the Wish exists and is open, so there is always a row here.
    const [wish] = await run<{ volumeId: string }>(
      `select volume_id as "volumeId" from wish where id = $1`,
      [wishId]
    );

    await acquireVolume(
      { volumeId: wish.volumeId, acquiredOn: paid.acquiredOn, pricePaid: paid.pricePaid },
      run
    );
  });
}
