// THE ADDRESSES THE STORIES HAVE — the wall's panel, its two filters, and the panels
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

/**
 * The wall's one panel: the Stories nothing has happened to, and the strike over them
 * (ADR-0015).
 *
 * **This panel's form posts a destructive act**, so a name spelled one way here and another in
 * `actions.ts` is a selection of records the owner ticked coming back to a wall with no drawer
 * on it and no sentence anywhere about what happened to them.
 *
 * It is the only one left. *Record a Story* was the other, and it is the one door now (#45).
 */
export const NOTHING_ON_IT = "nothing-on-it";

/**
 * The panel on **one Story's own page**: striking that Story, and the only place the four
 * refusals can be read (ADR-0015).
 *
 * It is in this file rather than beside `[id]/page.tsx` because it is a panel name on
 * that screen that two files spell — the page opens the drawer, and `[id]/actions.ts` reopens
 * it to print a refusal inside it. The other four are the page's alone and stay there.
 */
export const STRIKE = "strike";

/**
 * **Striking one act of reading, and striking one judgement** (ADR-0018) — the two doors that
 * make a mis-tap survivable.
 *
 * Here for `STRIKE`'s reason and more sharply than any of the others: both acts are refusable
 * by something the screen cannot foresee. A rated pass stays until its score goes, and the
 * sentence saying so is about the row the owner pressed, so it has to come back into the panel
 * that is standing over that row.
 *
 * Two names rather than one, though the two drawers ask the same single question, because they
 * destroy two different records and the address has to say which. A panel that meant *strike
 * whatever this is about* would be one URL away from unmaking the judgement when the owner
 * meant the pass.
 */
export const STRIKE_READING = "strike-reading";
export const STRIKE_RATING = "strike-rating";

/**
 * Saying how many **Instalments** a Story has, and where a pass got to in them (#37).
 *
 * Here for `STRIKE`'s reason: each is spelled by the page that opens the drawer and again by
 * `[id]/actions.ts`, which reopens it to print a refusal inside it — and both of these acts
 * are genuinely refusable, by Postgres rather than by anything the screen could foresee. A
 * work cannot be made shorter than what a pass has read of it, and a pass cannot stand past
 * the end of the work, so the sentence has to come back to the field it is about.
 */
export const SERIALIZE = "instalments";
export const REACHED = "at";

/**
 * **Saying which Series publishes this Story** — the arrow, set from the end the work is
 * managed from (#34, user stories 35 and 36).
 *
 * Here for the reason the two above are: the page opens the drawer and `[id]/actions.ts`
 * reopens it to print a refusal inside it — and this is the most refusable act on the screen.
 * The gesture collapses a line onto the work, and it refuses rather than loses anything: a
 * line that already publishes a Story, a narrative an object outside the line carries too, two
 * scores that cannot both be the work's one, a pass that counted its way through a narrative in
 * that narrative's own units. Each of those sentences is about the line the owner just chose,
 * so it has to come back to the picker it was chosen in.
 */
export const PUBLISHES = "publishes";

/**
 * **Correcting the Story's own title.**
 *
 * Here for the reason the others are: the page opens the drawer and `[id]/actions.ts` reopens
 * it to print a refusal inside it. `amendStory` refuses a blank one — by the
 * `story_title_is_not_blank` constraint, in the prose the verb already maps it to — and a
 * field the owner emptied has to come back with the sentence beside it rather than as a
 * screen that looks like it worked.
 *
 * It does **not** refuse a title the library already holds, and deliberately: a title is not
 * unique in this schema, `Batman: Anno Uno` is legitimately two records in two lines, and the
 * one door's own advisory list is where a duplicate is noticed. Renaming cannot be the place
 * that argument is had.
 *
 * Why the act exists at all. `amendStory` has carried the title since the Inbox was built, and
 * for three releases the only door onto it was an assistant's Amendment — the owner could
 * approve a rename they were offered and could not type one. The gap only became a hazard
 * when a line came to publish a work: the default mints one Story per object, so the work a
 * line collapses onto is as likely as not to be called *Slam Dunk 1*, and the arrow
 * deliberately leaves the target's own title standing rather than renaming what the owner has
 * lived with. Something has to be able to say the work's real name, and it is this.
 */
export const RENAME = "title";

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
