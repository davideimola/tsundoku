"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal } from "@/core/refusal";
import { acquireVolume, amendVolume, releaseVolume } from "@/core/verbs/collection";
import { dropOwnCover, forgetTheCover, lookUpCoverFor, setOwnCover } from "@/core/verbs/cover";
import { eraseEditionNote, writeEditionNote } from "@/core/verbs/edition-note";
import { createStoryCarriedBy, splitVolumeIntoStories } from "@/core/verbs/story";
import {
  recordVolumeCarriesStory,
  recordVolumeCoversInstalments,
  recordVolumeNoLongerCarriesStory,
} from "@/core/verbs/story-to-volume";
import { requireOwner } from "@/lib/auth/owner";
import type { Panel } from "./standing";

// The write side of one Volume's page: what the object **is**, whether it is in the house,
// what it carries, and what the owner thinks of it as an object. A thin adapter like every other one (ADR-0002) — it reads a form, calls one
// verb, and carries the verb's own prose back to the screen. No SQL, no SQLSTATE, no
// constraint name, and no rule about what a Volume may hold.
//
// Each function calls `requireOwner()` itself, because a layout does not run for a Server
// Function and the group is not the wall (`src/app/gated.test.ts`).
//
// The answer travels in the URL rather than in React state, so the page after a write is a
// plain server render and nothing needs to be running in the browser.

function text(form: FormData, field: string): string | null {
  const value = form.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Do the work, and say what it said. One shape for every verb on this page.
 *
 * `reopens` is the panel the form was standing in, and it is used **only on a refusal**
 * (#30, and it is #32's judgement on the Collection's own drawer). A write that succeeded is
 * answered by the record: the panel closes, and the page behind it now says the thing the
 * owner just made true. A refusal is the opposite — the sentence is about what was typed, so
 * it is only useful beside the field it is about, and closing the drawer over it would leave
 * the owner reading a banner at the top of the page with nowhere to correct anything. A form
 * with no panel behind it passes nothing and comes back to the page either way.
 */
async function saying(
  volumeId: string,
  said: URLSearchParams,
  work: () => Promise<void>,
  reopens?: Panel
): Promise<never> {
  let answer = said;

  try {
    await work();
  } catch (error) {
    // Anything that is not a refusal is a bug rather than an answer, and stays unhandled:
    // it becomes a 500 and nobody dresses it up as advice.
    if (!isRefusal(error)) throw error;
    answer = new URLSearchParams({ refused: error.message });
    if (reopens) answer.set("panel", reopens);
  }

  revalidatePath(`/collection/${volumeId}`);
  redirect(`/collection/${volumeId}?${answer}`);
}

/** Record that this Volume carries a Story. */
export async function carry(form: FormData): Promise<void> {
  await requireOwner();

  const volumeId = text(form, "volumeId") ?? "";
  const storyId = text(form, "storyId") ?? "";

  return saying(volumeId, new URLSearchParams({ carried: "1" }), () =>
    recordVolumeCarriesStory(volumeId, storyId)
  );
}

/**
 * Say which **Instalments** of a Story are inside this object (#37).
 *
 * The case is the omnibus: one object collecting thirty-five parts of a work. Where a line
 * prints one part per Volume, which is every manga on these shelves, the range follows the
 * object's position in its Series and this is never pressed — so both boxes empty is a real
 * answer and means *follow the line* rather than *nothing*.
 *
 * It is a correction made while reading the list above it rather than a form the owner
 * opened, so it is not a panel, and its refusal is read on the page beside the list.
 */
export async function coverInstalments(form: FormData): Promise<void> {
  await requireOwner();

  const volumeId = text(form, "volumeId") ?? "";
  const storyId = text(form, "storyId") ?? "";
  const from = text(form, "coversFrom");
  const to = text(form, "coversTo");

  return saying(volumeId, new URLSearchParams({ covered: "1" }), () =>
    recordVolumeCoversInstalments(
      volumeId,
      storyId,
      // Both empty hands the answer back to the line. One empty is half a range, and the
      // verb refuses it in its own prose rather than this door guessing at the other end.
      from === null && to === null
        ? null
        : { from: Number(from ?? Number.NaN), to: Number(to ?? Number.NaN) }
    )
  );
}

/**
 * Record a Story the library has never held, **inside this object**, in one act (#33).
 *
 * The picker beside this one names a Story that exists; this one is the case that used to
 * cost two screens — *Hulk Rosso* holds the six issues of one arc and a back-up story from a
 * Wolverine issue, and neither narrative is in the library while the owner is reading the
 * contents page off the back of the object. The old answer was *record the Story first if it
 * is not in the list*, which meant the Story wall, a form, and finding this object again; the
 * second narrative of a volume is the one that never survived the trip.
 *
 * **One verb and therefore one transaction** (`src/core/verbs/README.md`): this adapter does
 * not create a Story and then link it, because composing two verbs here would invent a
 * transaction that does not exist and a half-landed act is either a Story nothing carries or
 * an object recorded as holding nothing. `createStoryCarriedBy` is the verb.
 *
 * It comes back to **this** object rather than to the new Story, and that is the difference
 * from the same act on the wall (`../../stories/actions.ts`, which lands on the Story). The
 * owner is here to say what is inside a thing they are holding, and a volume that holds two
 * narratives is the whole reason this exists: the list they are correcting is the page they
 * came back to, with the new title in it.
 */
export async function recordStory(form: FormData): Promise<void> {
  await requireOwner();

  const volumeId = text(form, "volumeId") ?? "";

  return saying(
    volumeId,
    new URLSearchParams({ carried: "1" }),
    async () => {
      await createStoryCarriedBy(
        { title: text(form, "title") ?? "", typeId: text(form, "type") ?? "" },
        volumeId
      );
    },
    "story"
  );
}

/**
 * Split this object into the several Stories it holds (#38).
 *
 * **One field, and it is a contents page.** The titles arrive as lines of one box rather than
 * as a row of inputs somebody has to add to: a form that grows needs a script, a fixed row of
 * five boxes is four of them empty on the ordinary case, and what the owner is reading off the
 * back of the object is a list of lines. Blank ones are lines they did not need, and the verb
 * drops them — so a box with room for five holds three titles without saying anything about
 * the two.
 *
 * It comes back to this object, with the panel reopened on a refusal like every other write
 * here: the sentence is about the titles that were just typed, and the three narratives the
 * split makes are read back in the list on the page behind it.
 */
export async function split(form: FormData): Promise<void> {
  await requireOwner();

  const volumeId = text(form, "volumeId") ?? "";
  const titles = (text(form, "titles") ?? "").split("\n");

  return saying(
    volumeId,
    new URLSearchParams({ split: "1" }),
    async () => {
      await splitVolumeIntoStories(volumeId, titles);
    },
    "split"
  );
}

/** Take that back: this Volume does not carry that Story after all. */
export async function stopCarrying(form: FormData): Promise<void> {
  await requireOwner();

  const volumeId = text(form, "volumeId") ?? "";
  const storyId = text(form, "storyId") ?? "";

  return saying(volumeId, new URLSearchParams({ uncarried: "1" }), () =>
    recordVolumeNoLongerCarriesStory(volumeId, storyId)
  );
}

/**
 * Record that this Volume left the house: sold, given away or lost.
 *
 * **It lives here rather than on the Collection since that screen became a wall** (#23): a
 * tile carries no controls, and the act that stops the house claiming an object belongs on
 * the page that is a record of the object. Nothing undoes it, so it costs a deliberate
 * second tap — and it erases nothing, because the Readings made through this object and
 * what the owner thought of it are still true afterwards (ADR-0007).
 */
export async function release(form: FormData): Promise<void> {
  await requireOwner();

  const volumeId = text(form, "volumeId") ?? "";

  return saying(
    volumeId,
    new URLSearchParams({ released: "1" }),
    () => releaseVolume(volumeId),
    "release"
  );
}

/**
 * Record that this Volume is in the house: it joins the Collection, from a day and at a
 * price (ADR-0007).
 *
 * **It is here as well as on the Collection wall, and the two are not a duplicate.** The
 * wall's copy is the shop's — a catalogued object arrived, said from the list where it was
 * waiting. This one is the object's own page, which is where the owner stands when the thing
 * they let go of comes back: said again after a release it is a *second acquisition* of one
 * object, which is the event the page is a record of.
 */
export async function acquire(form: FormData): Promise<void> {
  await requireOwner();

  const volumeId = text(form, "volumeId") ?? "";

  return saying(
    volumeId,
    new URLSearchParams({ acquired: "1" }),
    () =>
      acquireVolume({
        volumeId,
        pricePaid: text(form, "pricePaid"),
        acquiredOn: text(form, "acquiredOn"),
      }),
    "acquire"
  );
}

/**
 * Record the object's ISBN, or correct the one that stands there.
 *
 * **This screen is the only place a human can put one** (#30). The spreadsheets had no ISBN
 * column at all, so 0 of 96 Volumes carry one, and until the Inbox starts delivering them
 * from an assistant this field is the whole of the answer — and after that it is where a
 * wrong one is fixed. It is the same verb the Inbox's approval calls, because completing a
 * catalogued object is the owner's act either way and an Amendment is only the door a
 * proposal reaches it through (ADR-0011).
 *
 * An empty box records nothing rather than emptying the field: the verb refuses an amendment
 * that changes no field, in its own words, and that refusal is carried to the screen like
 * every other one. Taking a fact *out* of the record is a different act and there is no verb
 * for it here.
 */
export async function recordIsbn(form: FormData): Promise<void> {
  await requireOwner();

  const volumeId = text(form, "volumeId") ?? "";

  return saying(
    volumeId,
    new URLSearchParams({ isbn: "1" }),
    () => amendVolume(volumeId, { isbn: text(form, "isbn") }),
    "isbn"
  );
}

/**
 * Ask the sources for this one object's cover, and say what came back.
 *
 * **The one thing on this screen that waits on somebody else's server**, and it is still a
 * plain form post: nothing runs in the browser, and the page after it is an ordinary server
 * render with the jacket on the tile (ADR-0010). A render calls no source, ever — this
 * action is the only path that does (#32).
 *
 * A Volume with no ISBN is refused in the verb's own words rather than probed, and that
 * refusal reaches the screen the way every other one does. The four answers are four
 * different sentences, and the one that matters is the third: a rate limit or a timeout is
 * *not* an absence, and nothing about the object was written down.
 */
export async function lookUpCover(form: FormData): Promise<void> {
  await requireOwner();

  const volumeId = text(form, "volumeId") ?? "";

  // The one verb on this page whose *answer* is worth carrying back rather than only its
  // success, so the work fills in the params `saying` is already holding — it redirects with
  // that same object, and a refusal replaces it wholesale as it does everywhere else.
  const said = new URLSearchParams();

  return saying(
    volumeId,
    said,
    async () => {
      const answer = await lookUpCoverFor(volumeId);
      said.set("cover", answer.outcome);
      if (answer.outcome === "unanswered") said.set("because", answer.because);
    },
    "cover"
  );
}

/**
 * Take the looked-up cover off: the tile goes back to the drawn one.
 *
 * **A blank tile is better than a wrong one.** An object wearing another book's jacket is
 * not a gap in the library, it is the library lying — and the owner should not have to wait
 * on a source to stop it. It leaves an image of their own alone, and leaves nothing behind
 * that would stop a later lookup asking again.
 */
export async function forgetCover(form: FormData): Promise<void> {
  await requireOwner();

  const volumeId = text(form, "volumeId") ?? "";

  return saying(
    volumeId,
    new URLSearchParams({ forgot: "1" }),
    () => forgetTheCover(volumeId),
    "cover"
  );
}

/**
 * Put the owner's own image on the object: a photograph, or a scan. It overrides whatever
 * the lookup found.
 *
 * **The one image this application is allowed to keep** (ADR-0013). Hosting a source's cover
 * is a breach of their terms; hosting the owner's own is not a question anybody else has a
 * say in — and it is the only thing that will ever face a Bonelli monthly, which carries no
 * ISBN to look one up by. The verb refuses an address on a source's own domain, because that
 * would be somebody else's bytes wearing the owner's name.
 */
export async function useOwnImage(form: FormData): Promise<void> {
  await requireOwner();

  const volumeId = text(form, "volumeId") ?? "";

  return saying(
    volumeId,
    new URLSearchParams({ imaged: "1" }),
    () => setOwnCover(volumeId, text(form, "imageUrl") ?? ""),
    "cover"
  );
}

/** Take the owner's own image off. What the lookup found is standing underneath it. */
export async function removeOwnImage(form: FormData): Promise<void> {
  await requireOwner();

  const volumeId = text(form, "volumeId") ?? "";

  return saying(
    volumeId,
    new URLSearchParams({ unimaged: "1" }),
    () => dropOwnCover(volumeId),
    "cover"
  );
}

/** Write what the owner thinks of the object. Replaces what they thought before. */
export async function writeNote(form: FormData): Promise<void> {
  await requireOwner();

  const volumeId = text(form, "volumeId") ?? "";
  const note = text(form, "note");

  // An empty box is the owner clearing the note rather than writing a blank one, which the
  // verb would refuse — so the two intentions arrive at the two verbs from one control.
  if (note === null) {
    return saying(
      volumeId,
      new URLSearchParams({ erased: "1" }),
      () => eraseEditionNote(volumeId),
      "note"
    );
  }

  return saying(
    volumeId,
    new URLSearchParams({ noted: "1" }),
    () => writeEditionNote(volumeId, note),
    "note"
  );
}
