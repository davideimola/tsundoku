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
  moveStoryOnPath,
  placeStoriesOnPath,
  removeStoryFromPath,
  renamePath,
  restatePathIntent,
  strikePath,
  withdrawConstraint,
} from "@/core/verbs/path";
import { requireOwner } from "@/lib/auth/owner";
import {
  DEFINING_A_PATH,
  NAMING_A_ROUTE,
  SAYING_WHAT_A_ROUTE_IS_FOR,
  STRIKING_A_ROUTE,
} from "./acts";

// The write side of the Paths screens, and a thin adapter like the pages beside it
// (ADR-0002): each function reads a form, calls one verb, and carries back what the verb
// said. No SQL, no rule about what a route may be, and — the rule this file exists to
// keep — no SQLSTATE and no constraint name.
//
// The answer travels in the URL rather than in React state, for the same reason as the
// Collection's: a plain form and a redirect work with no JavaScript running at all.
// **Re-ordering is what that buys here.** The arrows on a route are submit buttons, so
// putting *Musashi* before *Vagabond* is a POST and a server render, and the owner
// re-orders a route on a phone with no signal for a drag-and-drop bundle to arrive on. At a
// desk a stop can also be dragged into its gap, and that gesture reaches `moveAfter` below —
// a plain form the server rendered, pressed by a script instead of by a thumb. There is no
// second way to write an order: the drag fills in two fields and presses the form that was
// already there (ADR-0010, `[id]/rail.tsx`).

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
 * Run one verb and land back on the screen the owner was on.
 *
 * **Only a refusal is said in words.** Everything that worked is already visible on the
 * page that comes back — the Story has moved, the route is shorter, the sentence is in the
 * list — and a banner announcing what the owner can see would be the screen talking about
 * itself. `said` is for the one case where the result is not on screen.
 *
 * Anything that is not a refusal is a bug rather than an answer and stays unhandled: it
 * becomes a 500, and nobody dresses a broken query up as advice to the owner.
 *
 * `reopens` is the panel the form was standing in, and it is used **only on a refusal** (#31,
 * the shape `../series/actions.ts` already has). A write that worked is answered by the route
 * behind the panel, so the panel closes; a refusal is a sentence about what was typed, and it
 * is only useful beside the field it is about — a name and three lines of intent lost behind
 * a closed drawer is the owner typing them twice. An act with no panel behind it passes
 * nothing and comes back to the screen either way.
 */
async function saying(
  form: FormData,
  work: () => Promise<unknown>,
  { said, reopens }: { said?: URLSearchParams; reopens?: string } = {}
): Promise<never> {
  let answer = said;

  try {
    await work();
  } catch (error) {
    if (!isRefusal(error)) throw error;
    answer = new URLSearchParams({ refused: error.message });
    if (reopens) answer.set("panel", reopens);
  }

  const screen = back(form);
  revalidatePath(screen);
  redirect(answer ? `${screen}?${answer}` : screen);
}

/** Define a Path: a name, and the owner's own words about what it is for. */
export async function define(form: FormData): Promise<void> {
  await requireOwner();

  const name = text(form, "name") ?? "";
  await saying(form, () => definePath({ name, intent: text(form, "intent") }), {
    said: new URLSearchParams({ defined: name }),
    reopens: DEFINING_A_PATH,
  });
}

/** Call a Path something else. */
export async function rename(form: FormData): Promise<void> {
  await requireOwner();

  await saying(form, () => renamePath(text(form, "pathId") ?? "", text(form, "name") ?? ""), {
    reopens: NAMING_A_ROUTE,
  });
}

/** Say what a Path is for, replacing what it said before. */
export async function restateIntent(form: FormData): Promise<void> {
  await requireOwner();

  await saying(form, () => restatePathIntent(text(form, "pathId") ?? "", text(form, "intent")), {
    reopens: SAYING_WHAT_A_ROUTE_IS_FOR,
  });
}

/** Take a Path up again, or put it aside. The route survives either way. */
export async function setActive(form: FormData): Promise<void> {
  await requireOwner();

  const pathId = text(form, "pathId") ?? "";
  const wanted = text(form, "active") === "true";

  await saying(form, () => (wanted ? activatePath(pathId) : deactivatePath(pathId)));
}

/**
 * **Strike the route: the one act on that page that leaves nothing to come back to.**
 *
 * It cannot go through `saying` above, and the reason is the whole of this function: every
 * other act on this screen answers with the route, redrawn. This one unmakes the page it was
 * pressed on, so a redirect back to it would be the screen answering with a 404 instead of
 * saying what it just did. Struck, the owner lands on `/paths` with the name in the address —
 * the route is gone and the sentence naming it is the only place it still exists. Refused, they
 * come back to the route with the panel standing open over it, because the sentence is about
 * the thing on the screen behind it.
 *
 * Nothing refuses this today (`@/core/verbs/path`) beyond a route that is not there — but the
 * refusal path is written all the same, because a verb's prose is the adapter's to carry
 * whether or not it is currently reachable.
 */
export async function strike(form: FormData): Promise<void> {
  await requireOwner();

  const pathId = text(form, "pathId") ?? "";
  let name: string;

  try {
    // The name comes back from the verb rather than out of the form: the sentence on the
    // screen the owner lands on is about a row that no longer exists, so the row itself is the
    // only thing entitled to say what it was called.
    name = await strikePath(pathId);
  } catch (error) {
    // Anything that is not a refusal is a bug rather than an answer and stays unhandled.
    if (!isRefusal(error)) throw error;
    revalidatePath(`/paths/${pathId}`);
    redirect(
      `/paths/${pathId}?${new URLSearchParams({ panel: STRIKING_A_ROUTE, refused: error.message })}`
    );
  }

  revalidatePath("/paths");
  redirect(`/paths?${new URLSearchParams({ struck: name })}`);
}

/**
 * Put the ticked Stories at the end of the route, **in the order the picker stood them in**.
 *
 * `getAll` reads them in the order the browser sends them, which is the order the fields
 * appear on the page — and that order is the shelf's, because the picker bands the candidates
 * by the line they stand in and stands each band in its objects' order
 * (`core/queries/path.ts`). So ticking twenty tankōbon of *Slam Dunk* writes a route that reads
 * 1 to 20, and the owner corrects it with the arrows only where they actually disagree.
 *
 * One act, one verb, one transaction: twenty stops land together or not at all
 * (`core/verbs/path.ts`). The same function serves both presses on that panel — the ticked
 * selection, and a whole band put on at once — because they differ in what is in the form and
 * in nothing else.
 *
 * Only a refusal is said in words, as everywhere on this screen: what worked is the route,
 * twenty stops longer, on the page that comes back.
 */
export async function placeStories(form: FormData): Promise<void> {
  await requireOwner();

  const ticked = form
    .getAll("storyId")
    .filter((value): value is string => typeof value === "string");

  await saying(form, () => placeStoriesOnPath(text(form, "pathId") ?? "", ticked));
}

/** Take a Story off the route. The Story itself is untouched. */
export async function removeStory(form: FormData): Promise<void> {
  await requireOwner();

  await saying(form, () =>
    removeStoryFromPath(text(form, "pathId") ?? "", text(form, "storyId") ?? "")
  );
}

/** Move a Story one place earlier on the route. */
export async function moveEarlier(form: FormData): Promise<void> {
  await requireOwner();

  await saying(form, () =>
    moveStoryEarlier(text(form, "pathId") ?? "", text(form, "storyId") ?? "")
  );
}

/**
 * Move a Story to the front of the route: *this is what I read next*.
 *
 * The arrows are one place at a time, which is the wrong tool for a Story forty stops
 * down. One tap rather than thirty-nine, and it costs the same one row.
 */
export async function makeFirst(form: FormData): Promise<void> {
  await requireOwner();

  await saying(form, () =>
    moveStoryOnPath(text(form, "pathId") ?? "", text(form, "storyId") ?? "", null)
  );
}

/**
 * Move a Story so that it follows another one on the route — or to the front, where the
 * anchor is empty.
 *
 * **The verb behind the drag, and it is the verb behind *first*.** A stop dragged into a gap
 * at a desk and a stop pressed to the front on a phone are one sentence with two ways of
 * saying it — *this Story follows that one* — so they are one Server Function call and one
 * row written (ADR-0010). The drop fills the two fields in; nothing about how it was pointed
 * at reaches this file, and the form works pressed by hand.
 */
export async function moveAfter(form: FormData): Promise<void> {
  await requireOwner();

  await saying(form, () =>
    moveStoryOnPath(
      text(form, "pathId") ?? "",
      text(form, "storyId") ?? "",
      text(form, "afterStoryId")
    )
  );
}

/** Move a Story one place later on the route. */
export async function moveLater(form: FormData): Promise<void> {
  await requireOwner();

  await saying(form, () => moveStoryLater(text(form, "pathId") ?? "", text(form, "storyId") ?? ""));
}

/**
 * Record a constraint the owner has declared, on a Path or over the whole library.
 *
 * The same verb for both, because the scope is the presence of a Path and nothing else:
 * the form on a route sends its id, the one on the Paths screen sends none.
 */
export async function declare(form: FormData): Promise<void> {
  await requireOwner();

  await saying(form, () =>
    declareConstraint({ pathId: text(form, "pathId"), prose: text(form, "prose") ?? "" })
  );
}

/** Withdraw a declared constraint. The advisor stops being told it. */
export async function withdraw(form: FormData): Promise<void> {
  await requireOwner();

  await saying(form, () => withdrawConstraint(text(form, "constraintId") ?? ""));
}
