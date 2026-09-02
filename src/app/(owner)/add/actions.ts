"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { whatIsOnThisIsbn } from "@/core/queries/isbn";
import { isRefusal } from "@/core/refusal";
import { sayWhatHappened, type WhatWasSaid } from "@/core/verbs/what-happened";
import { requireOwner } from "@/lib/auth/owner";
import {
  THE_FIELDS_A_REFUSAL_CARRIES,
  whatWasTyped,
  whereATitleLeads,
  whereTheBarcodeLeads,
} from "./door";
import { ASKED } from "./panels";

// The write side of the one door, and a thin adapter like the page beside it (ADR-0002): it
// reads a form, calls one verb, and says what the verb said. No SQL, no rule about what a
// Story or a Volume may be, and no SQLSTATE — `refusing` in the core already turned the
// database's no into a `Refusal` carrying prose the verb wrote, and this file only decides
// where the owner lands with it.
//
// **Four functions and three of them are one sentence each**, which is what a door with three
// verbs behind it should look like. The fourth is the lookup, and it writes nothing.
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
 * anybody's network is involved, and then hand the three sentences a title that arrived filled
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
 * Say *I bought it*: the object joins the catalogue and the house, and the narrative appears
 * with it.
 *
 * The one act on this screen that has fields, and therefore the one whose refusals are worth
 * anything — a Binding nobody knows, a blank publisher, a position of the line the house
 * already holds. Every one of those sentences is the core verb's own.
 */
export async function bought(form: FormData): Promise<void> {
  const seriesId = text(form, "seriesId");
  const number = text(form, "seriesNumber");

  return saying(form, "bought", (title, typeId) =>
    sayWhatHappened({
      title,
      typeId,
      said: "bought",
      object: {
        publisher: text(form, "publisher") ?? "",
        editionLine: text(form, "editionLine"),
        binding: text(form, "binding") ?? "",
        language: text(form, "language") ?? "",
        isbn: text(form, "isbn"),
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

/** Say *I read it*: a pass through the narrative, and no object at all. */
export async function read(form: FormData): Promise<void> {
  return saying(form, "read", (title, typeId) => sayWhatHappened({ title, typeId, said: "read" }));
}

/** Say *I want to read it*: a Want, and nothing else follows from it. */
export async function wanted(form: FormData): Promise<void> {
  return saying(form, "wanted", (title, typeId) =>
    sayWhatHappened({ title, typeId, said: "wanted" })
  );
}

/**
 * The shared body of the three sentences: gate, read the two fields every one of them has,
 * say it, and land.
 *
 * The gate is called **here**, which is on the only path the three exports have — a Server
 * Function that delegated its authorisation to a caller would be a Server Function anybody
 * could POST to. `src/app/gated.test.ts` checks the file; this is the reason it passes.
 *
 * **Where it lands is one rule for all three, and it is the Story.** Everything that follows
 * saying anything about a title lives on the Story's own page — the pass that is open, the
 * score, which Volumes carry it, what the line is still missing — so landing there is the
 * whole of the confirmation and a banner announcing the write would be the screen talking
 * about itself. It is also the answer to the thing this door exists to prove: the narrative
 * was recorded too, and here it is.
 *
 * A refusal is the other direction. It is a sentence about what was typed, so it comes back to
 * the door with the panel standing open over it and the prose inside the panel, carrying
 * everything the door had heard so far.
 */
async function saying(
  form: FormData,
  said: WhatWasSaid,
  work: (title: string, typeId: string) => Promise<{ storyId: string }>
): Promise<void> {
  await requireOwner();

  const title = text(form, "title") ?? "";
  let where: string;

  try {
    const { storyId } = await work(title, text(form, "type") ?? "");
    where = `/stories/${storyId}`;

    // Three walls may have gained a tile, and which of them did depends on the sentence.
    // Saying all three is cheaper than a rule about which, and none of them is wrong.
    revalidatePath("/stories");
    revalidatePath("/collection");
    revalidatePath("/reading-list");
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

  return asking;
}
