"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal } from "@/core/refusal";
import { createStory, strikeStories } from "@/core/verbs/story";
import { requireOwner } from "@/lib/auth/owner";
import { carriedAs, NOTHING_ON_IT, RECORD, THE_WALLS_FILTERS } from "./panels";

// The write side of the Story wall, and **the act the owner did not have** (#33).
//
// `createStory` has existed in the core since #3 and one caller reached it: the Inbox's
// approval. So the assistant could propose a Story from ChatGPT and the owner could not say
// one from their own screen — the seventy-seven in the library arrived from the sheets, and
// everything since had to be routed through a proposal the owner then approved to themselves.
// Volume and Series each had their door on their own wall (`../collection/actions.ts`,
// `../series/actions.ts`); this is the third, and the asymmetry was an accident of build
// order rather than a decision.
//
// A thin adapter like both of those (ADR-0002): read a form, call one verb, carry the verb's
// own prose back. No SQL, no SQLSTATE, no constraint name, and no rule here about what a
// Story may be — `refusing` in the core already turned the database's no into prose, and this
// file only decides where the owner lands with it.
//
// The answer travels in the URL rather than in React state, so the form works with nothing
// running in the browser and the page after the write is a plain server render (ADR-0010).

/** What a form's field held, or nothing where it was left empty. */
function text(form: FormData, field: string): string | null {
  const value = form.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Record a Story, and land on it.
 *
 * **The one screen in this group whose write does not come back to the list it was made
 * from**, and the Series beside it is the contrast worth reading: declaring a Series lands
 * back on the ledger, because the next decision — whether it is being collected — is taken
 * from there. A Story is the opposite. Everything that follows recording one is on the Story's
 * own page: the Reading that has started, the score, which Volumes carry it. Coming back to a
 * wall of a hundred tiles to find the one just typed would be the owner's next three taps,
 * every time.
 *
 * It is also the whole of the confirmation, and deliberately the only one: what worked is the
 * page that comes back, and a banner announcing it would be the screen talking about itself.
 *
 * A refusal is the other direction. It is a sentence about what was typed, so it goes back to
 * the wall **as the owner had narrowed it**, with the panel standing open over it and the
 * prose inside the panel — the fields are still there to correct, which is the whole reason
 * the drawer does not close (#30, #32).
 */
export async function record(form: FormData): Promise<void> {
  await requireOwner();

  let where: string;

  try {
    const storyId = await createStory({
      title: text(form, "title") ?? "",
      typeId: text(form, "type") ?? "",
    });
    where = `/stories/${storyId}`;

    // The wall gained a tile. Said only here, because nothing was written on the other path.
    revalidatePath("/stories");
  } catch (error) {
    // Anything that is not a refusal is a bug rather than an answer and stays unhandled: it
    // becomes a 500, and nobody dresses a broken query up as advice.
    if (!isRefusal(error)) throw error;
    where = `/stories?${asItWasNarrowed(form, RECORD, { refused: error.message })}`;
  }

  redirect(where);
}

/**
 * The wall the owner was actually looking at, plus whatever this press has to say about
 * itself.
 *
 * The filters come off the form rather than off a URL, because a Server Function has no URL
 * to read — `../collection/actions.ts` threads them the same way for the same reason. Dropping
 * them would answer a refused write by silently throwing away the search behind it.
 *
 * The panel is an argument because two acts come back through here and they come back to
 * different drawers: a refused Story reopens the form it was typed into, and a strike — refused
 * or done — reopens the list it was ticked from.
 */
function asItWasNarrowed(
  form: FormData,
  panel: string,
  said: Record<string, string>
): URLSearchParams {
  const asking = new URLSearchParams(said);
  asking.set("panel", panel);

  for (const name of THE_WALLS_FILTERS) {
    // Read under the prefix it travelled as, never under its own name: `type` is also the
    // name of a field on this form, and the collision is a silently wrong Type (`./panels.ts`).
    const value = text(form, carriedAs(name));
    if (value) asking.set(name, value);
  }

  return asking;
}

/**
 * Strike the ticked Stories from the library: it stops knowing these narratives.
 *
 * **The mirror of `../collection/actions.ts`' strike, over the other half of the model** — an
 * assistant proposes a Story, the owner approves forty at a time, and until this act existed a
 * hallucinated narrative was a permanent tile on the wall (ADR-0015, ADR-0014).
 *
 * **Back to the list, open, either way.** Clean-up is repeated, so closing the drawer after
 * each pass would cost a tap to reopen every time; and a refusal has to come back here because
 * it names the one Story that stands, which is a sentence only useful beside the tick it is
 * about. The wall's own narrowing rides along, so neither answer throws away the search behind
 * the panel.
 *
 * The count is carried rather than recomputed: what the owner reads afterwards is what this
 * press did, not what the list happens to hold now.
 */
export async function strike(form: FormData): Promise<void> {
  await requireOwner();

  const ticked = form
    .getAll("strikeId")
    .filter((value): value is string => typeof value === "string");

  let struck: number;
  try {
    struck = await strikeStories(ticked);
  } catch (error) {
    // Anything that is not a refusal is a bug rather than an answer and stays unhandled.
    if (!isRefusal(error)) throw error;
    revalidatePath("/stories");
    redirect(`/stories?${asItWasNarrowed(form, NOTHING_ON_IT, { refused: error.message })}`);
  }

  revalidatePath("/stories");
  redirect(`/stories?${asItWasNarrowed(form, NOTHING_ON_IT, { struck: String(struck) })}`);
}
