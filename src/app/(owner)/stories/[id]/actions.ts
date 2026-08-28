"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal } from "@/core/refusal";
import { recordVolumeCarriesStory } from "@/core/verbs/story-to-volume";
import { requireOwner } from "@/lib/auth/owner";

// The one write on a Story's page, and it exists because of *Slam Dunk*: one Story carried by
// twenty objects. It is the same fact the Volume's page writes and the same verb — recorded
// from the end the owner happens to be standing at, because twenty visits to twenty Volume
// pages is not a thing anybody does.
//
// Taking the fact back stays on the Volume's page. A Volume carries Stories, so removing one
// from an object is a statement about that object, and one screen owning the correction is
// how the owner knows where to look for it.
//
// A thin adapter (ADR-0002): one form field, one verb, and the verb's own prose carried back
// in the URL. It calls `requireOwner()` itself, because a layout does not run for a Server
// Function (`src/app/gated.test.ts`).

/** Record that a Volume carries this Story. */
export async function carryFromStory(form: FormData): Promise<void> {
  await requireOwner();

  const storyId = String(form.get("storyId") ?? "").trim();
  const volumeId = String(form.get("volumeId") ?? "").trim();

  let said = new URLSearchParams({ carried: "1" });

  try {
    await recordVolumeCarriesStory(volumeId, storyId);
  } catch (error) {
    // Anything that is not a refusal is a bug rather than an answer, and stays unhandled.
    if (!isRefusal(error)) throw error;
    said = new URLSearchParams({ refused: error.message });
  }

  revalidatePath(`/stories/${storyId}`);
  redirect(`/stories/${storyId}?${said}`);
}
