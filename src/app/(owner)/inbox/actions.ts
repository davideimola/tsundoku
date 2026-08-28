"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal } from "@/core/refusal";
import { approveInboxEntry, type InboxCorrections, rejectInboxEntry } from "@/core/verbs/inbox";
import { requireOwner } from "@/lib/auth/owner";

// The two acts on an Inbox entry, and a thin adapter like every other `actions.ts` here
// (ADR-0002): it reads a form, calls one verb, and says what the verb said.
//
// **Two verbs and no third.** There is nothing on this screen that edits an entry, defers
// it, or files it away — an entry is approved, which creates the entity, or rejected, which
// creates nothing. What the owner corrects on the way through is not an edit of the
// proposal: it is the argument the approval is made with, and it reaches the creating verb
// rather than the entry.
//
// The answer travels back in the URL, like the Collection's and the shopping list's: a
// plain form and a redirect work with no JavaScript running at all.

/**
 * The fields an approval can carry, which are the fields the three creating verbs take.
 *
 * A fixed list rather than everything the form posted: the form also carries the entry's
 * id, and passing the whole of a `FormData` into a verb would be a door deciding what the
 * core's arguments are.
 */
const FIELDS = [
  "title",
  "typeId",
  "name",
  "publisher",
  "editionLine",
  "binding",
  "language",
  "isbn",
  "publishedCount",
  "status",
] as const;

/** What a form's field held, or nothing where the owner left it empty. */
function text(form: FormData, field: string): string | null {
  const value = form.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Approve an entry: create the Story, the Volume or the Series, as the owner confirmed it.
 *
 * The form is filled from what the assistant proposed, so what comes back is either that or
 * the owner's correction of it — and the correction is the point. An assistant guessing at a
 * Binding is the ordinary case, and the friction this screen exists to add is one look
 * before a permanent row.
 */
export async function approve(form: FormData): Promise<void> {
  await requireOwner();

  let said: URLSearchParams;

  // **A field the form posted counts even when it is empty**, because empty is a
  // correction: an assistant guessed an edition line the object does not have, and the
  // owner clearing that box means *there is no edition line* rather than *keep the guess*.
  // A field the form did not post at all is one this kind of entity does not have, and it
  // is left to the proposal.
  const corrections: InboxCorrections = {};
  for (const field of FIELDS) {
    if (!form.has(field)) continue;
    corrections[field] = text(form, field);
  }

  try {
    await approveInboxEntry(text(form, "entryId") ?? "", corrections);
    said = new URLSearchParams({ approved: text(form, "reference") ?? "" });
  } catch (error) {
    // Anything that is not a refusal is a bug rather than an answer, and stays unhandled:
    // it becomes a 500 and nobody dresses it up as advice.
    if (!isRefusal(error)) throw error;
    said = new URLSearchParams({ refused: error.message });
  }

  revalidatePath("/inbox");
  redirect(`/inbox?${said}`);
}

/**
 * Reject an entry: the owner does not want it, and nothing is created.
 *
 * There is nothing to undo and nothing to clean up — the proposal never wrote anything
 * outside the Inbox — so this is the cheap act of the two, and the screen says so.
 */
export async function reject(form: FormData): Promise<void> {
  await requireOwner();

  let said: URLSearchParams;

  try {
    await rejectInboxEntry(text(form, "entryId") ?? "");
    said = new URLSearchParams({ rejected: text(form, "reference") ?? "" });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    said = new URLSearchParams({ refused: error.message });
  }

  revalidatePath("/inbox");
  redirect(`/inbox?${said}`);
}
