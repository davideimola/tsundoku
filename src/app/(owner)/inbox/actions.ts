"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal } from "@/core/refusal";
import {
  approveInboxEntries,
  type InboxCorrections,
  PROPOSAL_FIELDS,
  rejectInboxEntry,
} from "@/core/verbs/inbox";
import { requireOwner } from "@/lib/auth/owner";
import { receiptFor } from "./decisions";

// The decision on an Inbox entry, and a thin adapter like every other `actions.ts` here
// (ADR-0002): it reads a form, calls one verb, and says what the verb said.
//
// **One Server Function rather than two, and that is HTML's doing rather than a design.** A
// group of 43 amendments is one form, because approving a selection is one submission; and a
// form cannot contain another form, so the *Reject it* on each of the 43 rows cannot be a
// form of its own. What it is instead is a second submit button in the same form, carrying
// the entry it is about as its own value — which is how HTML has always done a per-row act,
// works with nothing running in the browser (ADR-0010), and needs no `formaction` whose
// unscripted behaviour would be the specification's twin rather than the specification.
//
// So the shape of a submission is the whole contract:
//
//   entryId              one per ticked entry — the selection being approved
//   <entryId>:<field>    what the owner confirmed on that entry, where they were asked
//   reject               present only when a *Reject it* was the button pressed
//
// **Two verbs still, and no third.** Nothing here edits an entry, defers it or files it
// away: an entry is approved, which is the act that writes, or rejected, which writes
// nothing anywhere. What the owner corrects on the way through is not an edit of the
// proposal — it is the argument the approval is made with, and it reaches the creating verb
// rather than the entry.
//
// The answer travels back in the URL, like the Collection's and the shopping list's: a plain
// form and a redirect work with no JavaScript running at all.

/** What a form's field held, or nothing where the owner left it empty. */
function text(form: FormData, field: string): string | null {
  const value = form.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Decide: approve the ticked entries, or reject the one whose button was pressed.
 *
 * Which of the two it is, is the button, and the button is a field like any other. A
 * submission carrying no `reject` is an approval — including one where the owner unticked
 * everything, and the verb refuses that in its own words rather than this door inventing a
 * quieter answer for it.
 */
export async function decide(form: FormData): Promise<void> {
  await requireOwner();

  const rejecting = text(form, "reject");
  const said = rejecting === null ? await approveTheTicked(form) : await rejectOne(rejecting);

  revalidatePath("/inbox");
  redirect(`/inbox?${said}`);
}

/**
 * Approve the selection, in one transaction, with what the owner confirmed on each entry.
 *
 * A backfill arrives by the hundred (ADR-0011), so the gesture is the selection and the
 * verb applies all of it or none. The corrections travel **keyed by entry**, which is what
 * lets the one Story the owner chose a Type for ride along with the forty-two ISBNs it was
 * ticked beside.
 */
async function approveTheTicked(form: FormData): Promise<URLSearchParams> {
  const ticked = form
    .getAll("entryId")
    .filter((value): value is string => typeof value === "string");

  // What an approval may correct is the creating verbs' business, so the list of fields
  // comes from the core: reading the whole of a `FormData` into a verb would be this door
  // deciding what the core takes.
  //
  // **A field the form posted counts even when it is empty**, because empty is a
  // correction: an assistant guessed an edition line the object does not have, and the
  // owner clearing that box means *there is no edition line* rather than *keep the guess*.
  // A field the form did not post at all is one this entry was never asked about — every
  // field of an amendment, which proposes what it proposes and is judged rather than typed.
  const corrections: Record<string, InboxCorrections> = {};
  for (const entryId of ticked) {
    const confirmed: InboxCorrections = {};
    for (const field of PROPOSAL_FIELDS) {
      const box = `${entryId}:${field}`;
      if (!form.has(box)) continue;
      confirmed[field] = text(form, box);
    }
    corrections[entryId] = confirmed;
  }

  try {
    const approvals = await approveInboxEntries(ticked, corrections);
    return new URLSearchParams({ done: receiptFor(approvals) });
  } catch (error) {
    // Anything that is not a refusal is a bug rather than an answer, and stays unhandled:
    // it becomes a 500 and nobody dresses it up as advice.
    if (!isRefusal(error)) throw error;
    return new URLSearchParams({ refused: error.message });
  }
}

/**
 * Reject one entry: the owner does not want it, and nothing is created.
 *
 * There is nothing to undo and nothing to clean up — the proposal never wrote anything
 * outside the Inbox — so this is the cheap act of the two, and the screen says so. One at a
 * time deliberately: a selection is approved because a backfill is *accepted* wholesale,
 * where turning something down is a judgement about that one thing.
 */
async function rejectOne(entryId: string): Promise<URLSearchParams> {
  try {
    await rejectInboxEntry(entryId);
    return new URLSearchParams({
      done: "Rejected. Nothing was created, nothing changed, and the entry is below as the only trace of it.",
    });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    return new URLSearchParams({ refused: error.message });
  }
}
