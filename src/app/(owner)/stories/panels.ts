// THE ADDRESSES THE STORIES HAVE — the wall's two panels, its two filters, and the one panel
// on a single Story's page — **named here because
// more than one file spells each of them**, which is the Collection's own argument for the
// same file (`../collection/panels.ts`).
//
// Both of these are strings that are correct on their own and wrong only in relation to each
// other, and both fail silently when two files disagree. A panel name spelled one way in
// `page.tsx` and another in `actions.ts` is a refused write that comes back to a wall with no
// drawer on it and the owner's typing gone, with no error anywhere. A filter left out of this
// list is a narrowed wall that quietly un-narrows itself the moment a Story is recorded.
//
// Neither is caught by a type, which is what buys the file its few lines.

export const RECORD = "record";

/**
 * The other panel: the Stories nothing has happened to, and the strike over them (ADR-0015).
 *
 * Named here for `RECORD`'s reason and with one more of its own — **this panel's form posts a
 * destructive act**, so a name spelled one way here and another in `actions.ts` is a selection
 * of records the owner ticked coming back to a wall with no drawer on it and no sentence
 * anywhere about what happened to them.
 */
export const NOTHING_ON_IT = "nothing-on-it";

/**
 * The panel on **one Story's own page**: striking that Story, and the only place the four
 * refusals can be read (ADR-0015).
 *
 * It is in this file rather than beside `[id]/page.tsx` because it is the one panel name on
 * that screen that two files spell — the page opens the drawer, and `[id]/actions.ts` reopens
 * it to print a refusal inside it. The other four are the page's alone and stay there.
 */
export const STRIKE = "strike";

/**
 * What the owner has narrowed the *wall* to, in the order the controls stand in.
 *
 * `page.tsx` puts these in the form as hidden fields and `actions.ts` reads them back off it,
 * because a Server Function has no URL to read them from — the Collection's lookup already
 * threads them the same way. A refusal comes back to the wall the owner was actually looking
 * at, with the panel open over it.
 */
export const THE_WALLS_FILTERS = ["type", "state"] as const;

/**
 * The field name a carried filter travels under — **and it is prefixed for a reason that cost
 * this ticket a bug.**
 *
 * The wall narrows by Type and the form asks for a Type, so carrying the filter under its own
 * name put two fields called `type` in one form. `FormData.get` answers with the first, which
 * is the *filter*: a wall narrowed to Manga would have recorded every Story as a Manga
 * whatever the picker said, silently, and the only trace would be a wrong Type on a permanent
 * record. The two names are two things — what the owner is *looking at*, and what this Story
 * *is* — and they may never collide again.
 *
 * Both sides compose the string through this function, in opposite directions, so a rename
 * reaches the page and the action or neither.
 */
export function carriedAs(filter: (typeof THE_WALLS_FILTERS)[number]): string {
  return `wall-${filter}`;
}
