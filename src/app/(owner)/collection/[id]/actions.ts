"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type Band, theStoriesOnOffer } from "@/components/stories-on-offer";
import { whatIsPublishedUnderThisIsbn } from "@/core/queries/isbn";
import { listStoriesNotInVolume } from "@/core/queries/story-to-volume";
import { isRefusal } from "@/core/refusal";
import { acquireVolume, amendVolume, releaseVolume } from "@/core/verbs/collection";
import { dropOwnCover, forgetTheCover, lookUpCoverFor, setOwnCover } from "@/core/verbs/cover";
import { eraseEditionNote, writeEditionNote } from "@/core/verbs/edition-note";
import { createStoryCarriedBy, strikeStoryCarriedBy } from "@/core/verbs/story";
import {
  recordVolumeCarriesStories,
  recordVolumeCoversInstalments,
  recordVolumeNoLongerCarriesStory,
} from "@/core/verbs/story-to-volume";
import { requireOwner } from "@/lib/auth/owner";
import { THE_ISBN_FIELD, WHAT_THE_CATALOGUE_SAID } from "./panels";
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
 *
 * `carrying` is **what a reopened panel needs to be the panel it was**, and it is the one door's
 * rule arriving here (`THE_FIELDS_A_REFUSAL_CARRIES`, `../../add/door.ts`). A refusal replaces
 * the answer wholesale, which is right for a report and wrong for a *proposal*: the panel that
 * stands the catalogue's account of an object beside this library's would come back with the
 * refusal in it and the account gone, and the owner would have to scan the barcode again to
 * read the sentence they had just been refused about. Only the presses that have something to
 * carry pass it, and it is used on a refusal alone — a write that succeeded is answered by the
 * record.
 */
async function saying(
  volumeId: string,
  said: URLSearchParams,
  work: () => Promise<void>,
  reopens?: Panel,
  carrying?: Record<string, string>
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
    for (const [name, value] of Object.entries(carrying ?? {})) answer.set(name, value);
  }

  revalidatePath(`/collection/${volumeId}`);
  redirect(`/collection/${volumeId}?${answer}`);
}

// **THE FOUR ACTS UNDER ONE FIELD** (#47, ADR-0019), which are this screen's half of the
// adapter the stories component takes (`@/components/stories-it-holds`). Every one of them
// writes at once through a verb that already exists and comes back to this page with the
// list re-read — the other mounting of that same component, at cataloguing time, holds what
// was said until one submission instead, and the component knows the difference only by what
// these functions do.
//
// They take their arguments rather than a `FormData`, because the caller is a script and not
// a form: an id that came off a row the browser is holding is not a field somebody typed, and
// asking it to build a form to hand one back would be ceremony over a function call. What is
// unchanged is everything after that — one verb each, the verb's own prose on a refusal, and
// the answer in the URL rather than in React state.

/**
 * What the catalogue holds under what the owner has typed, banded by the line each Story
 * stands in.
 *
 * The only one of the five that reads rather than writes, and the only one that answers with
 * something other than a redirect. Banding is the screen's (`AGENTS.md`) and it is done here
 * rather than in the browser for the finder's reason: what arrives at a client component is
 * drawn, so the component holds no derivation (`vitest.config.ts`).
 */
export async function suggestStories(volumeId: string, term: string): Promise<Band[]> {
  await requireOwner();

  return theStoriesOnOffer(await listStoriesNotInVolume(volumeId, { title: term }));
}

/**
 * Record that this Volume carries these Stories — one row, or a whole band in one press.
 *
 * One verb for the whole band rather than one call per row: twenty calls from here would
 * invent a transaction that does not exist (`@/core/verbs/README.md`), and the band is the
 * gesture the owner made.
 */
export async function carryStories(volumeId: string, storyIds: string[]): Promise<void> {
  await requireOwner();

  return saying(volumeId, new URLSearchParams({ carried: "1" }), async () => {
    await recordVolumeCarriesStories(volumeId, storyIds);
  });
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
 * Record a Story the library has never held, **inside this object**, in one act (#33, #47).
 *
 * It is what enter on the field does. The trip it replaced — the Story wall, a form, then
 * finding this object again — is where the second narrative of a volume stopped being
 * recorded at all, and where a narrative the library had never heard of stopped being
 * recorded from the object that holds it.
 *
 * **One verb and therefore one transaction** (`@/core/verbs/README.md`): this adapter does
 * not create a Story and then link it, because a half-landed act is either a Story nothing
 * carries or an object recorded as holding nothing. `createStoryCarriedBy` is the verb.
 *
 * The Type is the one the component asked **once for the whole object** — guessed from the
 * Binding where the Binding decides and otherwise from the last one used
 * (`@/core/queries/type`) — and it is stored on the narrative, which is the only thing that
 * ever has one.
 */
export async function mintStory(volumeId: string, title: string, typeId: string): Promise<void> {
  await requireOwner();

  return saying(volumeId, new URLSearchParams({ carried: "1" }), async () => {
    await createStoryCarriedBy({ title, typeId }, volumeId);
  });
}

/** Take that back: this Volume does not carry that Story after all. */
export async function stopCarrying(volumeId: string, storyId: string): Promise<void> {
  await requireOwner();

  return saying(volumeId, new URLSearchParams({ uncarried: "1" }), () =>
    recordVolumeNoLongerCarriesStory(volumeId, storyId)
  );
}

/**
 * Strike the narrative this object carries: the library stops knowing it.
 *
 * The other half of the cross beside it, and the repair for the default that was wrong about
 * an object — a narrative minted from a jacket, taken off the object and then left standing
 * in the library with nothing carrying it.
 *
 * The row draws this press only where striking would be allowed, off the same expression the
 * verb refuses with, so the refusals here are the ones a race produces rather than the ones
 * the owner would meet by pressing.
 */
export async function strikeStory(volumeId: string, storyId: string): Promise<void> {
  await requireOwner();

  return saying(volumeId, new URLSearchParams({ struck: "1" }), () =>
    strikeStoryCarriedBy(volumeId, storyId)
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
 * Record the object's ISBN, or correct the one that stands there — **and ask the catalogue of
 * record what is published under it.**
 *
 * **This screen is the only place a human can put one** (#30). The spreadsheets had no ISBN
 * column at all, so 0 of 96 Volumes carry one, and until the Inbox starts delivering them
 * from an assistant this field is the whole of the answer — and after that it is where a
 * wrong one is fixed. It is the same verb the Inbox's approval calls, because completing a
 * catalogued object is the owner's act either way and an Amendment is only the door a
 * proposal reaches it through (ADR-0011).
 *
 * **The lookup is the second half of one press, and the camera is why.** The field is scanned
 * as well as typed now (`@/components/scan`), and the gesture the barcode buys is *hold the
 * object, point the phone*: an owner who has just handed the library the number off the back
 * of a book is an owner in a position to be told what that number is published as. Asking
 * afterwards, from a second press, would be a lookup nobody performs — which is how 96 Volumes
 * came to carry a publisher somebody typed and no ISBN at all.
 *
 * **Nothing the catalogue says is written by this press.** What comes back rides in the
 * address and stands in the panel beside the record, and `correctWhatItIs` below is the act
 * that accepts it. That is the whole of what the drawer's rule is bent for here — a write that
 * succeeded closes its panel, and this one reopens it — and the reason is that the press has
 * *two* answers: the ISBN is recorded, which the record now says, and the catalogue answered,
 * which is a form to read rather than a report to print behind a closed drawer.
 *
 * The ISBN is read by the core before anything is written (`whatIsPublishedUnderThisIsbn`), so
 * a hyphenated one that a keyboard or a phone's text scan handed over is stored as the bare
 * digits the column accepts, and the barcode beside the one that matters — the price add-on,
 * a Bonelli monthly's periodical EAN — is refused by name with the digits still in the field.
 *
 * An empty box records nothing rather than emptying the field: the verb refuses an amendment
 * that changes no field, in its own words, and that refusal is carried to the screen like
 * every other one. Taking a fact *out* of the record is a different act and there is no verb
 * for it here.
 */
export async function recordIsbn(form: FormData): Promise<void> {
  await requireOwner();

  const volumeId = text(form, "volumeId") ?? "";
  const typed = text(form, THE_ISBN_FIELD.name) ?? "";
  const carrying = { [THE_ISBN_FIELD.name]: typed };

  // Read and looked up before the write, which costs nothing and buys the ordering: an ISBN
  // the core will not read is an ISBN nothing was written about.
  const said = await whatIsPublishedUnderThisIsbn(typed);

  // **Not a verb's refusal — no verb was asked anything yet** — so it is not raised as one.
  // It is the core's own prose either way (`@/core/isbn` names which barcode the owner is
  // holding), and it comes back the way every refusal on this screen does: the panel open over
  // the field, with what was scanned still in it.
  if (said.it === "not-an-isbn") {
    redirect(
      `/collection/${volumeId}?${new URLSearchParams({
        panel: "isbn" satisfies Panel,
        refused: said.because,
        ...carrying,
      })}`
    );
  }

  // The panel it came from, reopened over the account of the object it just fetched. `isbn` is
  // the core's normalised digits and never what was typed: the column is strict and the field
  // is not.
  const answer = new URLSearchParams({
    panel: "isbn" satisfies Panel,
    [WHAT_THE_CATALOGUE_SAID.said]: said.it,
  });

  if (said.it === "a-record") {
    answer.set(WHAT_THE_CATALOGUE_SAID.title, said.record.title);
    // Omitted rather than empty, for the one door's reason: a box prefilled with nothing is a
    // box the owner has to notice is not prefilled — and here it would read as the catalogue
    // saying this object has no publisher.
    if (said.record.publisher) {
      answer.set(WHAT_THE_CATALOGUE_SAID.publishedBy, said.record.publisher);
    }
  }
  if (said.it === "unanswered") answer.set(WHAT_THE_CATALOGUE_SAID.because, said.because);

  return saying(
    volumeId,
    answer,
    () => amendVolume(volumeId, { isbn: said.isbn }),
    "isbn",
    carrying
  );
}

/**
 * **Correct what the object is from the catalogue's record of it**: the title, the publisher,
 * or whichever of the two the owner keeps.
 *
 * The second half of one gesture, and the half that writes. `recordIsbn` above put the number
 * on the record and asked SBN what is published under it; this is the press that accepts as
 * much of that answer as the owner wants, having read it beside the two facts this library
 * already held.
 *
 * **Two fields and only two**, because that is all a `BookRecord` has. Everything else about
 * the object — the Binding, the language, the edition line, its position in a line — is not in
 * the catalogue's answer and is not named here, so `amendVolume` leaves it standing: the
 * amendment is what it says and nothing more, which is the type's own rule (ADR-0011).
 *
 * **An empty box keeps what stands on the record**, which is the same sentence the ISBN field
 * beside it is held to and is the whole of the *keep mine* gesture: a librarian's spelling of
 * a title is not always an improvement on the spine's, and clearing the box is how the owner
 * takes the publisher and leaves the title alone. Both cleared is an amendment that changes no
 * field, and the verb refuses it in its own words.
 */
export async function correctWhatItIs(form: FormData): Promise<void> {
  await requireOwner();

  const volumeId = text(form, "volumeId") ?? "";
  const title = text(form, "title");
  const publisher = text(form, "publisher");

  return saying(
    volumeId,
    new URLSearchParams({ corrected: "1" }),
    () => amendVolume(volumeId, { title, publisher }),
    "isbn",
    // The proposal itself, so a refusal reopens the panel it was refused in rather than a
    // panel with nothing in it. What is carried is what was in the boxes, because that is what
    // the sentence the owner is about to read is about.
    {
      [WHAT_THE_CATALOGUE_SAID.said]: "a-record",
      ...(title ? { [WHAT_THE_CATALOGUE_SAID.title]: title } : {}),
      ...(publisher ? { [WHAT_THE_CATALOGUE_SAID.publishedBy]: publisher } : {}),
    }
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
