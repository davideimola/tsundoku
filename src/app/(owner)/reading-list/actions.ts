"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal } from "@/core/refusal";
import {
  type PinnedSource,
  pinToReadingList,
  unpinFromReadingList,
} from "@/core/verbs/reading-list";
import { strikeWant } from "@/core/verbs/want";
import { openWish } from "@/core/verbs/wish";
import { requireOwner } from "@/lib/auth/owner";

// The write side of the Reading list, and a thin adapter like the page beside it
// (ADR-0002): each function reads a form, calls one verb, and carries back what the verb
// said.
//
// **Four verbs, and the third one is the interesting one.** The list composes itself, so
// there is nothing on it to edit: pinning and unpinning are the owner's order over a list
// they do not maintain. `wishFor` is the one place this screen writes something that costs
// money, and it exists precisely so that the *list* does not: the entry carries a proposal
// built by the query, the screen renders it as a form, and a Wish is opened when the owner
// submits it and never before (user story 28). Rendering the whole list writes nothing.
//
// The fourth is `unwant`, and it is a *strike* rather than a close (`core/verbs/want.ts`). A
// Want the owner has not acted on is still true and nothing here retires it — it falls quiet
// on its own once a Reading begins after it. This is the row that was a slip, taken back.
//
// The answer travels back in the URL rather than in React state, like every screen here: a
// plain form and a redirect work with no JavaScript running at all.

/** What a form's field held, or nothing where it was left empty. */
function text(form: FormData, field: string): string | null {
  const value = form.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** A pin is on a Path or on a Series, and the row says which. */
function subject(form: FormData): PinnedSource {
  return {
    kind: text(form, "kind") === "series" ? "series" : "path",
    id: text(form, "id") ?? "",
  };
}

/**
 * Run one verb and land back on the Reading list.
 *
 * **Only a refusal is said in words.** Everything that worked is already on the page that
 * comes back — the entry has moved, the pin is gone — and a banner announcing what the
 * owner can see would be the screen talking about itself. `said` is for the one case where
 * the result is somewhere else, which here is the Wish that went to the shopping list.
 *
 * Anything that is not a refusal is a bug rather than an answer and stays unhandled: it
 * becomes a 500, and nobody dresses a broken query up as advice.
 */
async function saying(work: () => Promise<unknown>, said?: URLSearchParams): Promise<never> {
  let answer = said;

  try {
    await work();
  } catch (error) {
    if (!isRefusal(error)) throw error;
    answer = new URLSearchParams({ refused: error.message });
  }

  revalidatePath("/reading-list");
  redirect(answer ? `/reading-list?${answer}` : "/reading-list");
}

/** Pin an entry: whatever this route or this Series is offering, read it next. */
export async function pin(form: FormData): Promise<void> {
  await requireOwner();

  await saying(() => pinToReadingList(subject(form)));
}

/** Unpin it: the entry goes back to where the list composed it. */
export async function unpin(form: FormData): Promise<void> {
  await requireOwner();

  await saying(() => unpinFromReadingList(subject(form)));
}

/**
 * Open the Wish the entry proposed — **the owner's act, not the list's**.
 *
 * The entry carried a `proposedWish` and the row rendered it; this is the submit. So the
 * Volume and the priority arrive from the form rather than being read back out of the
 * list: what the owner saw is what is opened, and the picker is where they change the
 * priority the proposal suggested.
 */
export async function wishFor(form: FormData): Promise<void> {
  await requireOwner();

  await saying(
    () =>
      openWish({
        volumeId: text(form, "volumeId") ?? "",
        // The picker offers three values, so anything else is not a priority the owner
        // chose; `NaN` is not an integer and the verb refuses it with the picker's own
        // labels.
        priority: Number(text(form, "priority")),
      }),
    new URLSearchParams({ wished: text(form, "title") ?? "" })
  );
}

/**
 * Strike a Want: the owner did not mean to say it, and the row goes.
 *
 * **Not a way to tick one off**, which is why the press does not read like one. A Want ends by
 * itself when a Reading begins after it, so the only thing left for a button to do about one is
 * take back a sentence that was a slip — the wrong Story picked out of a list. The Story, its
 * Readings and its Rating are untouched by it.
 */
export async function unwant(form: FormData): Promise<void> {
  await requireOwner();

  await saying(() => strikeWant(text(form, "wantId") ?? ""));
}
