"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal } from "@/core/refusal";
import { releaseVolume } from "@/core/verbs/collection";
import { eraseEditionNote, writeEditionNote } from "@/core/verbs/edition-note";
import {
  recordVolumeCarriesStory,
  recordVolumeNoLongerCarriesStory,
} from "@/core/verbs/story-to-volume";
import { requireOwner } from "@/lib/auth/owner";

// The write side of one Volume's page: what it carries, and what the owner thinks of it as
// an object. A thin adapter like every other one (ADR-0002) — it reads a form, calls one
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

/** Do the work, and say what it said. One shape for all five verbs on this page. */
async function saying(
  volumeId: string,
  said: URLSearchParams,
  work: () => Promise<void>
): Promise<never> {
  let answer = said;

  try {
    await work();
  } catch (error) {
    // Anything that is not a refusal is a bug rather than an answer, and stays unhandled:
    // it becomes a 500 and nobody dresses it up as advice.
    if (!isRefusal(error)) throw error;
    answer = new URLSearchParams({ refused: error.message });
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

  return saying(volumeId, new URLSearchParams({ released: "1" }), () => releaseVolume(volumeId));
}

/** Write what the owner thinks of the object. Replaces what they thought before. */
export async function writeNote(form: FormData): Promise<void> {
  await requireOwner();

  const volumeId = text(form, "volumeId") ?? "";
  const note = text(form, "note");

  // An empty box is the owner clearing the note rather than writing a blank one, which the
  // verb would refuse — so the two intentions arrive at the two verbs from one control.
  if (note === null) {
    return saying(volumeId, new URLSearchParams({ erased: "1" }), () => eraseEditionNote(volumeId));
  }

  return saying(volumeId, new URLSearchParams({ noted: "1" }), () =>
    writeEditionNote(volumeId, note)
  );
}
