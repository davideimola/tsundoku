"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type Band, theStoriesOnOffer } from "@/components/stories-on-offer";
import { whatIsOnThisIsbn } from "@/core/queries/isbn";
import { listStoriesToOffer } from "@/core/queries/story-to-volume";
import { isRefusal } from "@/core/refusal";
import type { Medium } from "@/core/verbs/reading";
import type { ANarrativeItHolds, WhatWasRecorded } from "@/core/verbs/what-happened";
import { sayWhatHappened, type WhatWasSaid } from "@/core/verbs/what-happened";
import { requireOwner } from "@/lib/auth/owner";
import {
  THE_FIELDS_A_REFUSAL_CARRIES,
  whatWasTyped,
  whereATitleLeads,
  whereTheBarcodeLeads,
} from "./door";
import { ASKED, THE_NARRATIVES_INSIDE } from "./panels";

// The write side of the one door, and a thin adapter like the page beside it (ADR-0002): it
// reads a form, calls one verb, and says what the verb said. No SQL, no rule about what a
// Story or a Volume may be, and no SQLSTATE — `refusing` in the core already turned the
// database's no into a `Refusal` carrying prose the verb wrote, and this file only decides
// where the owner lands with it.
//
// **Six functions and four of them are one sentence each**, which is what a door with four
// verbs behind it should look like. The other two write nothing: the ISBN lookup, and the
// search under the field that names what is inside an object.
//
// The answer travels in the URL rather than in React state, because this screen is used
// one-handed in a shop on whatever signal the shop has: a plain form and a redirect work with
// no JavaScript running at all, and the page after the write is a normal server render
// (ADR-0010).

/** What a form's field held, or nothing where the owner left it empty. */
function text(form: FormData, field: string): string | null {
  const value = form.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Read the one field: a title to say something about, or a barcode to look up first.
 *
 * **The only act on this screen that waits on somebody else's server, and the one a camera
 * starts.** It is a plain form post for the reason the cover run is (ADR-0010): the field is
 * typed into as often as it is scanned, the scanner writes into that same field and submits
 * this same form, and a lookup that only worked once a bundle had parsed would be a lookup
 * that is not there in a shop.
 *
 * It writes nothing. What it does is answer *do I already have this?* against Postgres before
 * anybody's network is involved, and then hand the sentences a title that arrived filled
 * in. Where each answer leads is `./door.ts` — a screen's own derivation, and the reason this
 * function is six lines.
 */
export async function identify(form: FormData): Promise<void> {
  await requireOwner();

  const typed = text(form, ASKED) ?? "";
  const read = whatWasTyped(typed);

  // The barcode the owner scanned a moment ago, still remembered while they type what the
  // object is called: SBN had no record, so the title is theirs and the ISBN is not.
  if (read.it === "a-title") {
    redirect(
      whereATitleLeads(read.title, {
        isbn: text(form, "isbn") ?? undefined,
        from: text(form, "from") ?? undefined,
      })
    );
  }

  // No `revalidatePath`: nothing was written.
  redirect(whereTheBarcodeLeads(typed, await whatIsOnThisIsbn(read.digits)));
}

/**
 * What the catalogue holds under what the owner has typed into the field that names what is
 * inside the object, banded by the line each Story stands in.
 *
 * **The same question the same field asks on a Volume's page** (`../collection/[id]/actions.ts`),
 * at the moment there is no Volume to ask it about. On that page the answer leaves out what the
 * object carries, and it is the links that say so; here there are no links yet, so the rows the
 * browser is holding are handed over and the answer leaves out the same thing. It is the same
 * promise either way — **the field never offers what the list already has** — and it is kept in
 * the query rather than in the browser, which is where every other narrowing on this screen is
 * kept.
 *
 * Banding is the screen's (`AGENTS.md`) and it is done here rather than in the browser for the
 * finder's reason: what arrives at a client component is drawn, so the component holds no
 * derivation (`vitest.config.ts`). It writes nothing, so there is no `revalidatePath` and no
 * redirect — the only function on this screen that answers with an answer.
 */
export async function suggestStories(term: string, alreadyNamed: string[]): Promise<Band[]> {
  await requireOwner();

  return theStoriesOnOffer(await listStoriesToOffer({ title: term, except: alreadyNamed }));
}

/**
 * **The narratives the owner named as being inside the object**, read off the two repeated
 * fields the object half posts (`./panels.ts`).
 *
 * A Story arrives as an id and a title it has never heard of arrives as prose, which is the
 * shape the verb takes: the id is linked, the title is minted and then linked, in one
 * transaction. Nothing here refuses an empty list — that sentence is the core's, in the core's
 * own words, and a door with its own copy of it would be two answers to one press.
 *
 * The names beside the ids are not read at all. They are carried for a refused press to put
 * the rows back with (`THE_NARRATIVES_INSIDE.storyTitle`), and what is recorded is the id.
 */
function whatTheFormSaysIsInside(form: FormData): ANarrativeItHolds[] {
  const named = (field: string) =>
    form
      .getAll(field)
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value !== "");

  return [
    ...named(THE_NARRATIVES_INSIDE.story).map((storyId) => ({ storyId })),
    ...named(THE_NARRATIVES_INSIDE.newStory).map((title) => ({ title })),
  ];
}

/**
 * Say *I bought it*: the object joins the catalogue and the house, and the narratives it holds
 * are recorded with it.
 *
 * One of the two acts on this screen that have fields, and therefore one of the two whose
 * refusals are worth anything — a Binding nobody knows, a blank publisher, a position of the
 * line the house already holds. Every one of those sentences is the core verb's own.
 */
export async function bought(form: FormData): Promise<void> {
  const seriesId = aLine(form);
  const number = text(form, "seriesNumber");

  return saying(form, "bought", (title, typeId) =>
    sayWhatHappened({
      title,
      typeId,
      said: "bought",
      object: {
        ...theObject(form),
        pricePaid: text(form, "pricePaid"),
        acquiredOn: text(form, "acquiredOn"),
        // **Either half means the owner meant to place it**, and the verb refuses the half
        // that is missing in its own words — an empty position on a chosen line is *a position
        // in a Series is a whole number*, and a position with no line is *no Series has that
        // id*. Requiring both here instead would drop the placement silently, and on a line
        // that names a work that is a second narrative minted for a volume that had one:
        // exactly the drift this door exists to end.
        // `NaN` and not `0` for a blank position: `Number(null)` is zero, which is a number the
        // owner never typed and which comes back as *a Series starts at 1*. A field they left
        // empty is not a number at all, and the verb says exactly that.
        inSeries:
          seriesId || number
            ? { seriesId: seriesId ?? "", number: Number(number ?? Number.NaN) }
            : null,
      },
    })
  );
}

/**
 * Say *I want to buy it*: the object joins the catalogue without joining the house, and a Wish
 * for it joins the shopping list.
 *
 * The same object as the sentence above it, and the same refusals — it is one form with the
 * acquisition swapped for the intention, which is the whole difference between having paid and
 * meaning to. The Wish's own refusals are `openWish`'s: a priority that is not one of the
 * three, a negative price, a blank shop.
 */
export async function wished(form: FormData): Promise<void> {
  return saying(form, "wished", (title, typeId) =>
    sayWhatHappened({
      title,
      typeId,
      said: "wished",
      object: {
        ...theObject(form),
        // A picker offers three values, so anything else is not a priority the owner chose;
        // `NaN` is not an integer and the verb refuses it in the picker's own three words.
        priority: Number(text(form, "priority")),
        targetPrice: text(form, "targetPrice"),
        priceFound: text(form, "priceFound"),
        shop: text(form, "shop"),
        // **No line, which is #48's doing.** An object nobody owns yet fills no position of a
        // Series, so there was never a placement here; the line was read for its *arrow*, and
        // the owner now hands over the answer to it in the list of what the object holds. The
        // picker still stands in the panel, deciding what that list says.
      },
    })
  );
}

/**
 * What the object is — the half the two sentences about an object share, read off the one form
 * both of them post. The line is not in here, because the two sentences ask for different
 * amounts of it: a position and a line where it came home, and the line alone where it has
 * only been wished for.
 *
 * It is a function for the reason `THE_FIELDS_A_REFUSAL_CARRIES` is a list: the fields are
 * spelled in `page.tsx` too, and a name read here that the page never renders is a fact
 * quietly dropped rather than a type error. One reader for both sentences is one place for it
 * to be wrong in.
 */
function theObject(form: FormData) {
  return {
    publisher: text(form, "publisher") ?? "",
    editionLine: text(form, "editionLine"),
    binding: text(form, "binding") ?? "",
    language: text(form, "language") ?? "",
    isbn: text(form, "isbn"),
    // **What is inside it, which is the half of an object that used to be guessed at.** It is
    // here rather than in each sentence for this function's own reason: both sentences ask it,
    // in the same words, off the same rows.
    holds: whatTheFormSaysIsInside(form),
  };
}

/** Which line the owner picked, where they picked one. */
function aLine(form: FormData): string | null {
  return text(form, "seriesId");
}

/**
 * Say *I read it*: a pass through the narrative by the medium the owner pressed, and no object
 * at all.
 *
 * **The medium is handed over as it arrives** (#50). The verb refuses one that is not one of
 * its two, in prose the owner reads, so nothing here filters the vocabulary — that would be a
 * second place the model lives, and the sentence a hand-made POST meets would be this door's
 * rather than the Reading's. It is the same reading `../stories/[id]/actions.ts` does of the
 * same field.
 *
 * **And no object, which is what this sentence means.** Nothing on the form names a Volume, so
 * there is nothing to read: a Reading knows the object if there was one, and here there was
 * not.
 */
export async function read(form: FormData): Promise<void> {
  return saying(form, "read", (title, typeId) =>
    sayWhatHappened({
      title,
      typeId,
      said: "read",
      medium: (text(form, "medium") ?? "") as Medium,
    })
  );
}

/** Say *I want to read it*: a Want, and nothing else follows from it. */
export async function wanted(form: FormData): Promise<void> {
  return saying(form, "wanted", (title, typeId) =>
    sayWhatHappened({ title, typeId, said: "wanted" })
  );
}

/**
 * The shared body of the four sentences: gate, read the two fields every one of them has,
 * say it, and land.
 *
 * The gate is called **here**, which is on the only path the four exports have — a Server
 * Function that delegated its authorisation to a caller would be a Server Function anybody
 * could POST to. `src/app/gated.test.ts` checks the file; this is the reason it passes.
 *
 * **Where it lands is the record the sentence was about**, and since #48 that is two rules
 * rather than one. A sentence about a *narrative* lands on the Story: everything that follows
 * saying you read something lives there — the pass that is open, the score, which Volumes
 * carry it — so landing there is the whole of the confirmation, and a banner announcing the
 * write would be the screen talking about itself. A sentence about an *object* lands on the
 * object, because an object may now hold three narratives and there is no one Story to land
 * on: the Volume's page is where the three of them are listed, under the same field that named
 * them, which is both the confirmation and the place the next correction is made.
 *
 * A refusal is the other direction. It is a sentence about what was typed, so it comes back to
 * the door with the panel standing open over it and the prose inside the panel, carrying
 * everything the door had heard so far.
 */
async function saying(
  form: FormData,
  said: WhatWasSaid,
  work: (title: string, typeId: string) => Promise<WhatWasRecorded>
): Promise<void> {
  await requireOwner();

  const title = text(form, "title") ?? "";
  let where: string;

  try {
    const recorded = await work(title, text(form, "type") ?? "");
    // The object where there was one, and the narrative otherwise. `storyIds` is never empty —
    // every one of the four sentences ends with a Story — and the verb says so rather than
    // this door assuming it.
    where = recorded.volumeId
      ? `/collection/${recorded.volumeId}`
      : `/stories/${recorded.storyIds[0]}`;

    // Saying all of them is cheaper than a rule about which, and none of them is wrong.
    // Four walls may have gained a tile, and which of them did depends on the sentence.
    revalidatePath("/stories");
    revalidatePath("/collection");
    revalidatePath("/reading-list");
    revalidatePath("/wishes");
  } catch (error) {
    // Anything that is not a refusal is a bug rather than an answer and stays unhandled: it
    // becomes a 500, and nobody dresses a broken query up as advice.
    if (!isRefusal(error)) throw error;
    where = `/add?${asItStood(form, said, error.message)}`;
  }

  redirect(where);
}

/**
 * The door as the owner had got it, plus the panel to reopen and what went wrong.
 *
 * Everything it carries comes off the form rather than off a URL, because a Server Function has
 * no URL to read — and without it a refused write would answer the owner by throwing away the
 * title, the barcode, the sentence and the whole object they had already given it. The fields
 * are `THE_FIELDS_A_REFUSAL_CARRIES`, named once and read back by the page (`./door.ts`).
 */
function asItStood(form: FormData, said: WhatWasSaid, refused: string): URLSearchParams {
  const asking = new URLSearchParams({ panel: said, refused });

  for (const carried of ["title", "from", "publishedBy", ...THE_FIELDS_A_REFUSAL_CARRIES]) {
    const value = text(form, carried);
    if (value) asking.set(carried, value);
  }

  // **And the narratives, which are the most expensive answer on the screen** (#48): three
  // tales of an omnibus, named one at a time. They are repeated fields rather than single ones,
  // so they are appended rather than set — the page reads every value under each name.
  for (const field of [
    THE_NARRATIVES_INSIDE.story,
    THE_NARRATIVES_INSIDE.storyTitle,
    THE_NARRATIVES_INSIDE.newStory,
  ]) {
    for (const value of form.getAll(field)) {
      if (typeof value === "string" && value.trim() !== "") asking.append(field, value.trim());
    }
  }

  return asking;
}
