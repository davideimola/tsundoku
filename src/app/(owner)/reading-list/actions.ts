"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal } from "@/core/refusal";
import {
  type PinnedSubject,
  pinToReadingList,
  unpinFromReadingList,
} from "@/core/verbs/reading-list";
import { strikeWant } from "@/core/verbs/want";
import { openWish } from "@/core/verbs/wish";
import { requireOwner } from "@/lib/auth/owner";
import { THE_ROUTE, theRoutesAskedFor } from "./behind";

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

/**
 * A pin is on a Story or on a position of a Series, and the row says which.
 *
 * The position arrives as text like everything else in a form, and `Number` is where it
 * stops being text: anything that is not a whole number from one is refused by the verb with
 * prose, exactly as a Volume that is not there is.
 */
function subject(form: FormData): PinnedSubject {
  const id = text(form, "id") ?? "";

  return text(form, "kind") === "series"
    ? { kind: "series", id, position: Number(text(form, "position")) }
    : { kind: "story", id };
}

/**
 * **The routes the row was pressed from**, so the owner lands back looking behind the same
 * ones.
 *
 * Which route is being looked behind lives in the URL rather than in the browser
 * (`./behind.ts`), and every act on this screen is a POST that redirects — so the address has
 * to be rebuilt on the way back, or the rail closes under the owner the moment they pin
 * anything out of it. Pinning the second stop and *then* the third is the whole point of the
 * affordance, and it is two presses.
 *
 * They travel as hidden fields rather than as an address to return to, which is the reason
 * this is a rebuild and not a `back` parameter: a form that carried its own redirect target
 * would be an open redirect wearing a Reading list's clothes. Reading them is `./behind.ts`'s,
 * because the page reads the same thing off the URL and two copies of that walk is how the two
 * come to disagree.
 */
function where(form: FormData): URLSearchParams {
  return new URLSearchParams(
    theRoutesAskedFor(form.getAll(THE_ROUTE)).map((id) => [THE_ROUTE, id])
  );
}

/**
 * Run one verb and land back on the Reading list, looking at what it was pressed from.
 *
 * **Only a refusal is said in words.** Everything that worked is already on the page that
 * comes back — the entry has moved, the pin is gone — and a banner announcing what the
 * owner can see would be the screen talking about itself. `said` is for the one case where
 * the result is somewhere else, which here is the Wish that went to the shopping list — and
 * it is appended only on the way out of a verb that worked, so a refusal cannot arrive
 * alongside a report of the act it refused.
 *
 * Anything that is not a refusal is a bug rather than an answer and stays unhandled: it
 * becomes a 500, and nobody dresses a broken query up as advice.
 */
async function saying(
  work: () => Promise<unknown>,
  where: URLSearchParams,
  said?: URLSearchParams
): Promise<never> {
  const answer = new URLSearchParams(where);

  try {
    await work();
    for (const [name, value] of said ?? []) answer.append(name, value);
  } catch (error) {
    if (!isRefusal(error)) throw error;
    answer.set("refused", error.message);
  }

  revalidatePath("/reading-list");

  const address = answer.toString();
  redirect(address === "" ? "/reading-list" : `/reading-list?${address}`);
}

/** Pin an entry: this is what I read next, and it leads the list until I unpin it. */
export async function pin(form: FormData): Promise<void> {
  await requireOwner();

  await saying(() => pinToReadingList(subject(form)), where(form));
}

/** Unpin it: the entry leaves the head and goes back to where the list composed it. */
export async function unpin(form: FormData): Promise<void> {
  await requireOwner();

  await saying(() => unpinFromReadingList(subject(form)), where(form));
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
    where(form),
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

  await saying(() => strikeWant(text(form, "wantId") ?? ""), where(form));
}
