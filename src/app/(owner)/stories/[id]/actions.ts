"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FIRST_HAND } from "@/core/queries/provenance";
import { isRefusal } from "@/core/refusal";
import { setRating } from "@/core/verbs/rating";
import {
  abandonReading,
  finishReading,
  type Medium,
  recordInstalmentReached,
  recordReading,
} from "@/core/verbs/reading";
import { mergeSeriesIntoOneStory } from "@/core/verbs/series";
import { amendStory, declareInstalments, strikeStories } from "@/core/verbs/story";
import { recordVolumeCarriesStory } from "@/core/verbs/story-to-volume";
import { openWant, strikeWant } from "@/core/verbs/want";
import { requireOwner } from "@/lib/auth/owner";
import { PUBLISHES, REACHED, RENAME, SERIALIZE, STRIKE } from "../panels";

// The writes on a Story's page, and **#29 is where the web stopped being a read-only view of
// the thing it exists to record**. The assistant could already say *I've started the Batman
// omnibus* over MCP and the owner could not say it from their own screen: `recordReading`,
// `finishReading`, `abandonReading` and `setRating` were four verbs with one door.
//
// Four acts, and the shape of them is the model's rather than a form's:
//
//   - **Opening a Reading is one act and closing it is another.** A Reading that has started
//     and not ended is what *reading now* is — it is why the dashboard has a top band — so
//     the owner says *I have started this* and says *I finished it* later, and neither
//     pretends to be an edit of the other.
//   - **Nothing is ever overwritten.** Reading it again is a new Reading, which is what keeps
//     last time's judgement beside this one's. `finishReading` refuses a Reading that has
//     already ended, in its own prose, and this door does not soften that.
//   - **A Rating belongs to an act of reading.** It is posted with the Reading it came out of,
//     so a reread's score sits beside the first one instead of over it. Saying it again about
//     the *same* Reading is an edit of that one judgement — the only write on this page that
//     replaces something the owner wrote, which is why the form arrives filled in with what
//     it is about to replace.
//   - **The Provenance is the core's**, and it is `FIRST_HAND`: the owner typing it here is
//     the same first-hand evidence as the owner telling an assistant, so there is no picker
//     and no slug written by this door (`core/queries/provenance.ts` says why).
//
// Thin adapters (ADR-0002): read a form, call one verb, carry back what the verb said. Each
// calls `requireOwner()` itself, because a layout does not run for a Server Function
// (`src/app/gated.test.ts`).

/**
 * Where a refused write comes back to: the drawer it was typed in, and — for the acts that
 * are about one act of reading rather than about the Story — which Reading that is.
 *
 * The pair travels together because the address is one thing, which is the shape the
 * Volume's own page already gives it (`collection/[id]/actions.ts` calls it `reopens` too).
 */
type Reopens = { panel: string; reading?: string };

/** What a form's field held, or nothing where it was left empty. */
function text(form: FormData, field: string): string | null {
  const value = form.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Run one verb and land back on the Story, with the drawer that posted it closed.
 *
 * **Only a refusal is said in words**, as on every screen here: what worked is already on the
 * page that comes back — the Reading is in the stack, the score is under it — and a banner
 * announcing it would be the screen talking about itself. Closing the drawer is what the
 * plain address does, since a drawer's open state is the URL (`@/components/drawer`).
 *
 * Anything that is not a refusal is a bug rather than an answer and stays unhandled.
 */
async function saying(
  storyId: string,
  work: () => Promise<unknown>,
  reopens?: Reopens
): Promise<never> {
  let said: URLSearchParams | undefined;

  try {
    await work();
  } catch (error) {
    if (!isRefusal(error)) throw error;
    said = new URLSearchParams({ refused: error.message });
    // **A refused write comes back with its panel open**, carrying the verb's prose into the
    // panel rather than printing it on the page behind (the drawer covers that page): the
    // sentence is about what was typed, so it is only useful beside the field it is about.
    // The acts that pass none are the ones whose refusals are about the record rather than
    // about a field — they are read on the page, where the record is.
    if (reopens) {
      said.set("panel", reopens.panel);
      if (reopens.reading) said.set("reading", reopens.reading);
    }
  }

  revalidatePath(`/stories/${storyId}`);
  redirect(said ? `/stories/${storyId}?${said}` : `/stories/${storyId}`);
}

/**
 * **Start reading it, and do not say how it ends** — the act #29 exists for.
 *
 * No outcome, so the Story reads `reading` from this moment: the state is derived from the
 * Readings on every request and stored nowhere, so nothing else has to be told. The day is
 * optional the way *came home* is on the Collection, because the fact does not depend on it.
 */
export async function startReading(form: FormData): Promise<void> {
  await requireOwner();

  const storyId = text(form, "storyId") ?? "";

  await saying(storyId, () =>
    recordReading({
      storyId,
      // The verb refuses a medium that is not one of its two, in prose the owner reads, so
      // nothing here filters the vocabulary — that would be a second place the model lives.
      medium: (text(form, "medium") ?? "") as Medium,
      // Absent is ordinary and required on digital: an owned ebook is not a thing this model
      // has, so a digital Reading went through no object.
      volumeId: text(form, "volumeId"),
      startedOn: text(form, "startedOn"),
      provenanceId: FIRST_HAND,
    })
  );
}

/** The owner finished it. Refused on a Reading that has already ended — that is a reread. */
export async function finishIt(form: FormData): Promise<void> {
  await requireOwner();

  const storyId = text(form, "storyId") ?? "";

  await saying(storyId, () => finishReading(text(form, "readingId") ?? "", text(form, "endedOn")));
}

/**
 * The owner gave up on it, which is as much a fact as finishing and is evidence about taste.
 *
 * The same form as finishing, posted by the other button: one day, two outcomes, and no way
 * to say both.
 */
export async function giveUp(form: FormData): Promise<void> {
  await requireOwner();

  const storyId = text(form, "storyId") ?? "";

  await saying(storyId, () => abandonReading(text(form, "readingId") ?? "", text(form, "endedOn")));
}

/**
 * What the owner thought of it, attached to the act of reading it came out of.
 *
 * The score arrives from a picker of the nineteen half points rather than from a number
 * field: the owner's keyboard offers a comma where this scale wants a dot, and a score is the
 * one value in this library nobody would want guessed at. Nothing chosen at all is
 * `Number.NaN` and not zero — `Number(null)` is `0`, which the scale would read as a
 * judgement rather than as a silence, and it is exactly the confusion an absent score is not
 * allowed to make anywhere else in this application.
 */
export async function rate(form: FormData): Promise<void> {
  await requireOwner();

  const storyId = text(form, "storyId") ?? "";

  await saying(storyId, () =>
    setRating({
      storyId,
      readingId: text(form, "readingId"),
      score: Number(text(form, "score") ?? Number.NaN),
      prose: text(form, "prose"),
      provenanceId: FIRST_HAND,
    })
  );
}

/**
 * A whole number the owner typed, or `null` where the box was left empty.
 *
 * `Number(null)` is `0`, and nought is a *count* this model refuses rather than an absence —
 * so an empty box is carried through as nothing at all and the verb reads it as *stop
 * counting*. Anything that is not a number is handed on as `NaN`, which the verb refuses in
 * its own prose rather than this door deciding what the owner meant.
 */
function counted(form: FormData, field: string): number | null {
  const said = text(form, field);
  return said === null ? null : Number(said);
}

/**
 * **Say how many Instalments the work has**, or take the numbering off it again.
 *
 * A fact about the narrative and never about a printing, which is why it is written here and
 * on no object's page: the omnibus and the tankōbon carrying one work carry the same twenty.
 * It is refused while a pass has read further than the number given, and the sentence comes
 * back into the panel it was typed in.
 */
export async function serialize(form: FormData): Promise<void> {
  await requireOwner();

  const storyId = text(form, "storyId") ?? "";

  await saying(storyId, () => declareInstalments(storyId, counted(form, "instalments")), {
    panel: SERIALIZE,
  });
}

/**
 * **Say where this pass got to.** It is written on the Reading and never on the Story: how
 * far you are is a fact about an act, so a reread starts again at nothing and the pass before
 * it keeps the number it ended on.
 */
export async function sayWhereIGotTo(form: FormData): Promise<void> {
  await requireOwner();

  const storyId = text(form, "storyId") ?? "";
  const readingId = text(form, "readingId") ?? "";

  await saying(storyId, () => recordInstalmentReached(readingId, counted(form, "atInstalment")), {
    panel: REACHED,
    reading: readingId,
  });
}

/**
 * Record that a Volume carries this Story.
 *
 * It exists because of *Slam Dunk*: one Story carried by twenty objects. It is the same fact
 * the Volume's page writes and the same verb — recorded from the end the owner happens to be
 * standing at, because twenty visits to twenty Volume pages is not a thing anybody does.
 *
 * Taking the fact back stays on the Volume's page. A Volume carries Stories, so removing one
 * from an object is a statement about that object, and one screen owning the correction is
 * how the owner knows where to look for it.
 */
export async function carryFromStory(form: FormData): Promise<void> {
  await requireOwner();

  const storyId = text(form, "storyId") ?? "";
  const volumeId = text(form, "volumeId") ?? "";

  await saying(storyId, () => recordVolumeCarriesStory(volumeId, storyId));
}

/**
 * **Strike this Story from the library: the one act on this page that leaves nothing to come
 * back to** (ADR-0015).
 *
 * It is the same verb the wall's drawer presses, over a selection of one, and this door exists
 * for what the wall's cannot show. That list holds only Stories nothing has happened to, so no
 * refusal is ever reachable from it — **here is the only place the four are said**: an object
 * in the house carrying it, a Reading through it, a score on it, a Path naming it. The owner is
 * standing on the record they believe is a mistake, and the answer is either that it is gone or
 * a sentence about what they have lived with.
 *
 * So the two directions land in different places, which is the whole of this function. Struck,
 * it lands on the **wall** with the count in the address: this page no longer describes
 * anything, and coming back to a 404 is the screen failing to say what it just did. Refused, it
 * comes back here with the panel open over it, because the sentence is about the thing on the
 * screen behind it (`@/components/drawer`).
 *
 * `revalidatePath` on the wall either way: it is the page being landed on in one case, and in
 * the other the tile is still there and the owner may go back to it.
 */
export async function strikeIt(form: FormData): Promise<void> {
  await requireOwner();

  const storyId = text(form, "storyId") ?? "";

  try {
    await strikeStories([storyId]);
  } catch (error) {
    // Anything that is not a refusal is a bug rather than an answer and stays unhandled.
    if (!isRefusal(error)) throw error;
    revalidatePath(`/stories/${storyId}`);
    redirect(
      `/stories/${storyId}?${new URLSearchParams({ panel: STRIKE, refused: error.message })}`
    );
  }

  revalidatePath("/stories");
  redirect(`/stories?${new URLSearchParams({ struck: "1" })}`);
}

/**
 * **Say it out loud: I want to read this** — and nothing else follows from it (#35).
 *
 * No Path is minted, no order is decided and no Volume is implied. That is the whole reason
 * this press exists: saying it used to cost a named, ordered route that could not be
 * undefined, for something that was never a route.
 *
 * There is no press that undoes it by *closing* it. A Want falls quiet by itself once a
 * Reading begins after it was opened, which is what makes a planned reread ordinary.
 */
export async function wantIt(form: FormData): Promise<void> {
  await requireOwner();

  const storyId = text(form, "storyId") ?? "";

  await saying(storyId, () => openWant(storyId));
}

/**
 * Take a Want back: it was a slip, and the row goes.
 *
 * A **strike** rather than a close (`core/verbs/want.ts`), and the label says so. The Story,
 * its Readings and its Rating are untouched.
 */
export async function unwant(form: FormData): Promise<void> {
  await requireOwner();

  await saying(text(form, "storyId") ?? "", () => strikeWant(text(form, "wantId") ?? ""));
}

/**
 * **Say which Series publishes this Story**, and let the line collapse onto it.
 *
 * The arrow, set from the end the work is managed from (#34, user stories 35 and 36). Its
 * consequence is the whole gesture and not a flag: every Volume of the line comes to carry this
 * Story, the per-volume narratives the default minted collapse onto it, and any Rating,
 * Reading, Credit, Path stop, Want or pin on them is carried across or repointed. Nothing the
 * owner holds moves — the Volumes, the acquisitions and the completeness ledger are exactly as
 * they were.
 *
 * The verb refuses rather than losing anything, and every one of those sentences is about the
 * line just chosen, so a refusal comes back into the picker it was chosen in.
 */
export async function sayWhichSeriesPublishesIt(form: FormData): Promise<void> {
  await requireOwner();

  const storyId = text(form, "storyId") ?? "";

  await saying(storyId, () => mergeSeriesIntoOneStory(text(form, "seriesId") ?? "", { storyId }), {
    panel: PUBLISHES,
  });
}

/**
 * **Correct the work's own title.**
 *
 * The one field on this page that overwrites a fact the owner wrote, and it is here because
 * nothing else could say the work's real name: `amendStory` has carried the title since the
 * Inbox, and until now the only door onto it was an Amendment an assistant proposed — the
 * owner could approve a rename and could not type one.
 *
 * What made that a hazard rather than an omission is the arrow. One Volume mints one Story, so
 * a line collapsing onto a work lands on whatever that work was called when it was one object
 * — *Slam Dunk 1*, as often as not — and the gesture deliberately leaves the target's title
 * standing rather than renaming something the owner has lived with. So the name the shelf uses
 * and the name the work carries can part, and this is what closes them again.
 *
 * It sends the title alone. The Type and the Instalment count travel through the same verb and
 * are asked for in their own places — `serialize` below, and the picker on the wall — because a
 * drawer called *Correct the title* that quietly also wrote the Type would be two acts wearing
 * one name.
 */
export async function rename(form: FormData): Promise<void> {
  await requireOwner();

  const storyId = text(form, "storyId") ?? "";

  // The raw field rather than `text()`, which answers `null` for an empty one. `null` means
  // *leave the title standing* to `amendStory`, so an emptied box would come back as *an
  // amendment changes at least one field* — true of the verb and beside the point to someone
  // who has just deleted a name. Sent as the empty string it reaches
  // `story_title_is_not_blank` instead, and the sentence that comes back is *A Story needs a
  // title*, in the field it is about.
  const title = String(form.get("title") ?? "");

  await saying(storyId, () => amendStory(storyId, { title }), { panel: RENAME });
}
