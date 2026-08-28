"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal } from "@/core/refusal";
import {
  activatePath,
  deactivatePath,
  declareConstraint,
  definePath,
  moveStoryEarlier,
  moveStoryLater,
  placeStoryOnPath,
  removeStoryFromPath,
  restatePathIntent,
  withdrawConstraint,
} from "@/core/verbs/path";
import { requireOwner } from "@/lib/auth/owner";

// The write side of the Paths screens, and a thin adapter like the pages beside it
// (ADR-0002): each function reads a form, calls one verb, and carries back what the verb
// said. No SQL, no rule about what a route may be, and — the rule this file exists to
// keep — no SQLSTATE and no constraint name.
//
// The answer travels in the URL rather than in React state, for the same reason as the
// Collection's: a plain form and a redirect work with no JavaScript running at all.
// **Re-ordering is what that buys here.** The arrows on a route are submit buttons, so
// putting *Musashi* before *Vagabond* is a POST and a server render, and the owner
// re-orders a route on a phone with no signal for a drag-and-drop bundle to arrive on.

/** What a form's field held, or nothing where the owner left it empty. */
function text(form: FormData, field: string): string | null {
  const value = form.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// Where to land afterwards. Both screens declare constraints and both need to come back
// to themselves, so the screen says where it was; anything that is not one of these two
// screens is not a place this file will send a browser.
const SCREEN = /^\/paths(\/[0-9a-f-]{36})?$/;

function back(form: FormData): string {
  const asked = text(form, "back") ?? "/paths";
  return SCREEN.test(asked) ? asked : "/paths";
}

/**
 * Run one verb and land back on the screen, saying what happened.
 *
 * Anything that is not a refusal is a bug rather than an answer and stays unhandled: it
 * becomes a 500, and nobody dresses a broken query up as advice to the owner.
 */
async function saying(
  form: FormData,
  work: () => Promise<unknown>,
  said: URLSearchParams
): Promise<never> {
  let answer = said;

  try {
    await work();
  } catch (error) {
    if (!isRefusal(error)) throw error;
    answer = new URLSearchParams({ refused: error.message });
  }

  const screen = back(form);
  revalidatePath(screen);
  redirect(`${screen}?${answer}`);
}

/** Define a Path: a name, and the owner's own words about what it is for. */
export async function define(form: FormData): Promise<void> {
  await requireOwner();

  const name = text(form, "name") ?? "";
  await saying(
    form,
    () => definePath({ name, intent: text(form, "intent") }),
    new URLSearchParams({ defined: name })
  );
}

/** Say what a Path is for, replacing what it said before. */
export async function restateIntent(form: FormData): Promise<void> {
  await requireOwner();

  await saying(
    form,
    () => restatePathIntent(text(form, "pathId") ?? "", text(form, "intent")),
    new URLSearchParams({ restated: "1" })
  );
}

/** Take a Path up again, or put it aside. The route survives either way. */
export async function setActive(form: FormData): Promise<void> {
  await requireOwner();

  const pathId = text(form, "pathId") ?? "";
  const wanted = text(form, "active") === "true";

  await saying(
    form,
    () => (wanted ? activatePath(pathId) : deactivatePath(pathId)),
    new URLSearchParams({ [wanted ? "active" : "aside"]: "1" })
  );
}

/** Place a Story at the end of the route. */
export async function placeStory(form: FormData): Promise<void> {
  await requireOwner();

  await saying(
    form,
    () => placeStoryOnPath(text(form, "pathId") ?? "", text(form, "storyId") ?? ""),
    new URLSearchParams({ placed: text(form, "title") ?? "" })
  );
}

/** Take a Story off the route. The Story itself is untouched. */
export async function removeStory(form: FormData): Promise<void> {
  await requireOwner();

  await saying(
    form,
    () => removeStoryFromPath(text(form, "pathId") ?? "", text(form, "storyId") ?? ""),
    new URLSearchParams({ removed: text(form, "title") ?? "" })
  );
}

/** Move a Story one place earlier on the route. */
export async function moveEarlier(form: FormData): Promise<void> {
  await requireOwner();

  await saying(
    form,
    () => moveStoryEarlier(text(form, "pathId") ?? "", text(form, "storyId") ?? ""),
    new URLSearchParams({ moved: text(form, "title") ?? "" })
  );
}

/** Move a Story one place later on the route. */
export async function moveLater(form: FormData): Promise<void> {
  await requireOwner();

  await saying(
    form,
    () => moveStoryLater(text(form, "pathId") ?? "", text(form, "storyId") ?? ""),
    new URLSearchParams({ moved: text(form, "title") ?? "" })
  );
}

/**
 * Record a constraint the owner has declared, on a Path or over the whole library.
 *
 * The same verb for both, because the scope is the presence of a Path and nothing else:
 * the form on a route sends its id, the one on the Paths screen sends none.
 */
export async function declare(form: FormData): Promise<void> {
  await requireOwner();

  await saying(
    form,
    () => declareConstraint({ pathId: text(form, "pathId"), prose: text(form, "prose") ?? "" }),
    new URLSearchParams({ declared: "1" })
  );
}

/** Withdraw a declared constraint. The advisor stops being told it. */
export async function withdraw(form: FormData): Promise<void> {
  await requireOwner();

  await saying(
    form,
    () => withdrawConstraint(text(form, "constraintId") ?? ""),
    new URLSearchParams({ withdrawn: "1" })
  );
}
