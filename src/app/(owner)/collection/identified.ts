import type { WhatIsOnThisIsbn } from "@/core/queries/isbn";
import { CATALOGUE, ISBN } from "./panels";

// WHERE A SCANNED ISBN LEADS — this screen's own derivation, beside `./covers-found.ts` and
// under the same licence (`vitest.config.ts`): data in, data out, no render and no database.
//
// The core answers *what is on this ISBN* in five ways and deliberately does not know what a
// URL is. Which of those five is **a place**, which is **a form arriving half-filled** and
// which is **a sentence beside the field** is a fact about this application's addresses, so it
// is decided here and tested beside itself.
//
// Three of the decisions are worth stating out loud, because all three were arguable:
//
// **An ISBN the library already knows leads to the object's own page, not to a panel that
// says so.** The question being asked is *do I already have this?*, standing in a shop; the
// Volume's page answers it and then some — where the owner stands with the object, its
// Series, the Stories it carries, and the acts that follow from all three
// (`./[id]/standing.ts`). A panel reporting *you have this* would be a worse copy of a screen
// that already exists, and it would be a dead end where the real page is a place to act. The
// cost is real and is not hidden: **the scanner cannot reach the catalogue form for an ISBN
// already on the shelf**, so a genuine second copy of one object is catalogued the typed way.
// A second copy is rare; scanning something already owned is the common case, and it is the
// one being answered.
//
// **The three answers that are not a place all lead to the same form**, which is the ordinary
// *Catalogue a Volume* drawer, filled in as far as the answer allows. Not to a second form and
// not to a confirmation step: what the owner does next is identical in all three cases — read
// the fields, correct them, press *Catalogue it* — and the only difference is one sentence
// above them, which is `whatFilledItIn` below. A wizard would have been three screens for one
// act.
//
// **What the URL carries is the core's own word for what happened** (`a-record`, `no-record`,
// `unanswered`) rather than a second vocabulary invented here. There is one distinction and it
// is the model's, so translating it into `sbn`/`nothing`/… would have been the same three cases
// spelled two ways, switched on twice, drifting once.

/**
 * The wall's filters, as they were on the way in: every address here carries them through.
 *
 * A `URLSearchParams` or the pairs one is built from, so the caller may hand over whichever it
 * has — the page holds the former and the Server Function assembles the latter.
 */
export type TheFiltersOn = URLSearchParams | readonly (readonly [string, string])[];

/**
 * Where to go with what the ISBN turned out to be.
 *
 * `typed` is what was in the field — the camera's digits or the owner's — and it is carried
 * back on a refusal so that a misread digit is one keystroke from right rather than a field to
 * fill in again. It is deliberately *not* used for anything else: every other destination gets
 * the ISBN the core read and normalised.
 *
 * `filters` is what the owner had narrowed the wall to. It is threaded through every
 * destination that is this screen, because a lookup is one bit of navigation on a wall that is
 * still narrowed underneath — the rule `panelled()` states in `./page.tsx` and the one a
 * Server Function is most likely to forget, having only a `FormData` to read.
 */
export function whereTheIsbnLeads(
  typed: string,
  said: WhatIsOnThisIsbn,
  filters: TheFiltersOn = []
): string {
  // The object itself, and the only destination that is not this screen — so the only one the
  // wall's filters have nowhere to go. `volumes` is never empty on this answer: the core says
  // `already-catalogued` *because* it found one. Where an ISBN was catalogued twice either page
  // is the answer, so landing on the first is what shows the owner there are two.
  if (said.it === "already-catalogued") return `/collection/${said.volumes[0].id}`;

  const asking = new URLSearchParams(filters as URLSearchParams | string[][]);

  if (said.it === "not-an-isbn") {
    asking.set("panel", ISBN);
    asking.set("isbn", typed);
    asking.set("refused", said.because);
    return `/collection?${asking}`;
  }

  asking.set("panel", CATALOGUE);
  asking.set("isbn", said.isbn);
  // The core's own word for which of the three it was, read back by `whatFilledItIn`.
  asking.set("from", said.it);

  if (said.it === "a-record") {
    asking.set("named", said.record.title);
    // Omitted rather than empty: a form field prefilled with nothing is a field the owner has
    // to notice is not prefilled.
    if (said.record.publisher) asking.set("publishedBy", said.record.publisher);
  }

  return `/collection?${asking}`;
}

/**
 * What the catalogue form says about where its fields came from, or nothing where the owner
 * opened it themselves.
 *
 * Three sentences and not one, because the three states are three different things for the
 * owner to do. *Filled in* means check it. *No record* means type it, and is ordinary rather
 * than a failure — SBN holds legal deposit, and a volume out this month may simply not be in
 * it yet. *Could not be asked* means type it **and** that scanning the next one may well work,
 * which a sentence about an absent book would have quietly denied.
 */
export function whatFilledItIn(from: string | undefined): string | null {
  switch (from) {
    case "a-record":
      return "Filled in from SBN's record for this ISBN — check it against the object in your hand before you catalogue it.";
    case "no-record":
      return "SBN has no record under this ISBN, so the fields are yours to type. Ordinary rather than wrong: a volume out this month may not be in the national catalogue yet.";
    case "unanswered":
      return "SBN could not be asked just now, so the fields are yours to type. The next scan may well reach it — its backend goes down and comes back.";
    default:
      return null;
  }
}
