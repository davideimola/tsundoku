// THE ADDRESSES THIS SCREEN HAS — the four panels, the five filters, and the one field a
// script writes into. **Named here because more than one file spells each of them**, and
// because every one of these strings fails silently when two files disagree about it.
//
// That is the whole argument for the file. `?panel=banana` opens nothing, which is the honesty
// every filter on this wall is held to — and it means a panel name typed correctly in
// `page.tsx` and mistyped in `identified.ts` is a redirect to a wall with no drawer on it and
// no error anywhere. A filter left out of `onlyTheFilters` is a search silently dropped on the
// way into a drawer. A field id composed by hand in the scanner and by `Field` in the page is
// a camera that reads a barcode and writes it nowhere.
//
// None of the three is caught by a type, because all three are strings that are correct on
// their own and wrong only in relation to each other.

export const COVERS = "covers";
export const CATALOGUE = "catalogue";
export const ELSEWHERE = "elsewhere";
export const ISBN = "isbn";

/**
 * The panels, read against this list rather than trusted.
 *
 * `page.tsx` decides which one is open from it, and `identified.ts` addresses two of them from
 * the same constants, so a rename reaches both or neither.
 */
export const PANELS = [COVERS, CATALOGUE, ELSEWHERE, ISBN] as const;

/**
 * What the owner asked the *wall* for: the five filters, in the order the controls stand in.
 *
 * Every address that opens or closes a panel carries these through unchanged — a *Catalogue*
 * button that dropped `?series=…&type=manga` would answer the owner's search by throwing it
 * away, and so would a lookup that came back from a Server Function without them.
 */
export const THE_WALLS_FILTERS = ["title", "series", "publisher", "binding", "type"] as const;

/**
 * The ISBN field the scanner writes into: the prefix `Field` composes its id from, and the id
 * that composition produces.
 *
 * Both halves are named here because the scanner is handed the *id* while the form is handed
 * the *prefix*, and `Field`'s `${idPrefix}-${name}` is what joins them — two files composing
 * one string, in opposite directions. `identified.test.ts` asserts they still meet.
 */
export const THE_ISBN_FIELD = { prefix: "scan", name: "isbn", id: "scan-isbn" } as const;
