import type { OpenWish } from "@/core/queries/wish";

// **How a shopping list is read**, and it is a file for the reason `../pile/entry.ts`
// is one: two screens say it now. The Wishes screen bands the list by priority, and the
// Pile offers the same three words in the picker beside *Want it* — where they were a
// second copy under a comment saying *as the Wishes screen names them*, which is a second
// answer waiting to happen.
//
// The banding is the screen's, the way every band in this application is: what the core
// answers with is the list in the order the owner buys in, and cutting it into the three
// steps they buy in is a judgement about reading rather than about the model.
//
// One rule holds the whole file together, and it is the Wish's own: **nothing silently
// disappears from what the owner meant to buy** (`@/core/verbs/wish`). So the bands are built
// out of the priorities that are *there* rather than by filtering a fixed list of three
// down to them — an empty heading cannot arise, and neither can a Wish that is on the list
// and on no band of it.
//
// Nothing is imported but a type, which is erased.

/**
 * **The one act on this screen that needs a field**, named here rather than in the page for
 * the reason `../paths/acts.ts` gives: the page reads `?panel=` against this name and the
 * Server Function behind the form sends the owner back into the same panel when the verb
 * refuses. Two files spelling one panel is a rename that drops a refusal behind a closed
 * drawer.
 */
export const OPENING_A_WISH = "open";

/** The three steps a shopping list is read in, and what each one is called on screen. */
export const PRIORITIES = [
  { value: 1, name: "Next", hint: "buying this" },
  { value: 2, name: "Soon", hint: "when it turns up" },
  { value: 3, name: "Someday", hint: "not yet" },
] as const;

/**
 * What a priority is called — and a number the vocabulary does not name is called by its
 * number.
 *
 * The database constrains a priority to the three, so the second half is about a Wish that
 * cannot exist. It is here anyway because the alternative to naming it is dropping it, and
 * a shopping list that quietly loses a row is the one thing this area refuses to be.
 */
export function priorityNamed(priority: number): string {
  return PRIORITIES.find((one) => one.value === priority)?.name ?? `Priority ${priority}`;
}

/** One step of the list: what it is called, what it means, and what is under it. */
export type ShoppingBand = {
  priority: number;
  name: string;
  /** What the step means, where the vocabulary says: *buying this*. */
  hint: string | null;
  wishes: OpenWish[];
};

/**
 * The open Wishes, banded into the steps they are bought in.
 *
 * The order **inside** a band is the core's and is not touched: priority first and then the
 * oldest intention, because a Wish that has been waiting is one the owner keeps meaning to
 * act on.
 */
export function theShoppingList(wishes: readonly OpenWish[]): ShoppingBand[] {
  const bands = new Map<number, ShoppingBand>();

  for (const wish of wishes) {
    const step = PRIORITIES.find((one) => one.value === wish.priority);
    const band = bands.get(wish.priority) ?? {
      priority: wish.priority,
      name: step?.name ?? priorityNamed(wish.priority),
      hint: step?.hint ?? null,
      wishes: [],
    };

    band.wishes.push(wish);
    bands.set(wish.priority, band);
  }

  return [...bands.values()].sort((one, other) => one.priority - other.priority);
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
