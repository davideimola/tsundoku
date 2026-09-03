// THE ADDRESSES THIS SCREEN HAS — the three panels and the five filters. **Named here because
// more than one file spells each of them**, and because every one of these strings fails
// silently when two files disagree about it.
//
// That is the whole argument for the file. `?panel=banana` opens nothing, which is the honesty
// every filter on this wall is held to — and it means a panel name typed correctly in
// `page.tsx` and mistyped in a Server Function is a redirect to a wall with no drawer on it
// and no error anywhere. A filter left out of `onlyTheFilters` is a search silently dropped
// on the way into a drawer.
//
// Neither is caught by a type, because both are strings that are correct on their own and
// wrong only in relation to each other.

export const COVERS = "covers";
export const ELSEWHERE = "elsewhere";
export const CARRYING_NOTHING = "carrying-nothing";

/**
 * The panels, read against this list rather than trusted.
 *
 * `page.tsx` decides which one is open from it, and reaches nothing that is not on it: a
 * hand-typed `?panel=banana` opens no drawer.
 *
 * **Three, where there were four and then two.** Cataloguing an object and looking one up by
 * ISBN were this screen's other two panels, and they are the one door now (#45) — `../add/`,
 * where the object, the narrative and the link between them are one act. What is left is the
 * Collection's own: an object coming home, the covers, and — since #51 — the objects the
 * library knows and nobody has named the contents of.
 *
 * That third one is the odd one and is worth a sentence, because it is the only panel here
 * that holds **no form at all**. It is a list of objects with a way to each, since what
 * closes that gap is said on the object's own page and not over a list: naming what an
 * omnibus holds is reading its rows and adding to them (#47), which is not a thing a drawer
 * over ninety-six tiles can offer.
 */
export const PANELS = [COVERS, ELSEWHERE, CARRYING_NOTHING] as const;

/**
 * What the owner asked the *wall* for: the five filters, in the order the controls stand in.
 *
 * Every address that opens or closes a panel carries these through unchanged — a *Covers*
 * button that dropped `?series=…&type=manga` would answer the owner's search by throwing it
 * away, and so would a refusal that came back from a Server Function without them.
 */
export const THE_WALLS_FILTERS = ["title", "series", "publisher", "binding", "type"] as const;
