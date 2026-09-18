import type { AcquisitionMade } from "@/core/queries/acquisition";

// **HOW THE LEDGER IS READ.** The core bands what came home into months and says what each
// one came to; what is left is the words, and the words are this file's for the reason every
// screen's derivation is beside its screen: data in, data out, and a function this
// application would still have if React were replaced.
//
// It holds no arithmetic over money, and that is deliberate. A month's total and the
// coverage under it arrive from `queries/acquisition.ts` already added up, because a figure
// whose denominator a page invented is the one thing `AGENTS.md` names as impossible to
// defend against. The shopping list adds its own band up (`../wishes/shopping.ts`) because a
// Wish's two prices are a *choice* — the price found over the target — and there is no such
// choice here: an acquisition carries one price or none.
//
// **There is a twin of `periodNamed` on the shopping list, and the two are deliberately not
// shared.** A Period is a month the owner *planned* to buy in, and it has a word for the
// absence of a plan: *Someday*, which is an answer they picked. A month here is a month
// something *happened* in, and its absence is a gap: nobody wrote the day down. Reaching for
// the Wishes screen's vocabulary would make the ledger say *Someday* over a book already on
// the shelf, which is the wrong sentence about the wrong fact — so what they share is a date
// format and not a meaning, and a date format is not a thing to couple two screens over.

/**
 * What a band is called: *September 2026*, and **No day recorded** for the acquisitions that
 * belong to no month.
 *
 * The absence is named in words rather than left as a heading with nothing in it, because
 * that band is the one the owner can act on — every row under it is a day waiting to be
 * filled in on the object's own page.
 */
export function monthNamed(month: string | null): string {
  if (month === null) return "No day recorded";

  const [year, ordinal] = month.split("-");
  const named = new Date(Number(year), Number(ordinal) - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  // A month the vocabulary cannot read is called by what it says. Postgres formats these, so
  // this is about a month that cannot arise — it is here for the reason the band with no day
  // is: the alternative to naming a row is dropping it, and a ledger that quietly loses one
  // is a ledger nobody can reconcile.
  return named === "Invalid Date" ? month : named;
}

/**
 * What a month means from where the owner is standing, or nothing where it means nothing.
 *
 * Two words and no more. *This month* is the running total the owner came to look at and
 * *last month* is the one they compare it against; everything further back is a month, which
 * is what its name already says. Nothing is called late, over or under: the ledger records
 * what happened and this application does not judge the owner's spending.
 */
export function whenItWas(month: string | null, today: Date): string | null {
  if (month === null) return null;

  const [year, ordinal] = month.split("-").map(Number);
  // Counted in months rather than by building a `2026-09` to compare against, so there is no
  // second copy of how a month is written anywhere in this screen.
  const away = (year - today.getFullYear()) * 12 + (ordinal - 1 - today.getMonth());

  if (away === 0) return "this month";
  if (away === -1) return "last month";
  return null;
}

/**
 * Where the object stands now, said on the row about the acquisition that brought it home.
 *
 * The two facts are not the same sentence: an acquisition is a thing that *happened*, and
 * whether the object is still in the house is what is true this evening. A ledger that showed
 * only the first would read as a shelf, and one that showed only the second would quietly
 * lose what was paid for a book that has since gone (ADR-0007).
 */
export function standingOf(made: AcquisitionMade): string {
  return made.releasedOn === null ? "In the house" : `Let go on ${made.releasedOn}`;
}

/**
 * **Everything the tile beside a row cannot fit**, in the order a shop would say it.
 *
 * The tile's accessible name and its tooltip, and it is here for the reason `wishDetail` is
 * beside the shopping list's words: a tile the pointer describes one way and the row beside
 * it another would be two answers about one object. What the object has not got is left out
 * rather than printed as a gap.
 */
export function acquisitionDetail(made: AcquisitionMade): string {
  return [
    made.volume.title,
    made.volume.editionLine,
    made.volume.publisher,
    made.volume.binding.name,
  ]
    .filter(Boolean)
    .join(" — ");
}
