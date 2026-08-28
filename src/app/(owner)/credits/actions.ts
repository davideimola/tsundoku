"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal } from "@/core/refusal";
import { creditStory, uncreditStory } from "@/core/verbs/credit";
import { requireOwner } from "@/lib/auth/owner";

// The write side of the Credits, and a thin adapter like every page here (ADR-0002): it
// reads a form, calls one verb, and carries back the prose the verb wrote. No SQL, no
// rule about who may be credited, and — the rule this file exists to keep — no SQLSTATE
// and no constraint name.
//
// Both writes happen on a Story's page, because that is where a Credit lives: it is a
// contribution to a Story, and there is no screen on which one exists by itself. So both
// return there, with the answer in the query string rather than in React state, for the
// reason the Collection's writes do: a plain form and a redirect work with no JavaScript
// running at all.

/**
 * What a form's field held, trimmed, or the empty string.
 *
 * Not the `text` of `collection/actions.ts`, and named differently on purpose: that one
 * returns `null` for an empty optional field, and two functions with one name and two
 * contracts is how a caller comes to expect the wrong one. Nothing here is optional —
 * a Credit is a name and a role — so the empty string goes to the verb, which refuses it
 * with prose.
 */
function entered(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The Story every write here happens on.
 *
 * Carried in a hidden field by the page that rendered the form, so its absence is not
 * something the owner can do: it is a tampered post or our own bug, and it stays an
 * unhandled error rather than becoming a refusal nobody can read — a redirect to
 * `/stories/` would have thrown the verb's prose away.
 */
function storyFrom(form: FormData): string {
  const storyId = entered(form, "storyId");
  if (storyId === "") throw new Error("a Credit was submitted with no Story to put it on");
  return storyId;
}

/** Where the answer is read: the Story the Credit is on. */
function backToStory(storyId: string, said: URLSearchParams): never {
  revalidatePath(`/stories/${storyId}`);
  revalidatePath("/credits");
  redirect(`/stories/${storyId}?${said}`);
}

/** Credit a person on a Story in a named role. */
export async function credit(form: FormData): Promise<void> {
  await requireOwner();

  const storyId = storyFrom(form);
  let said: URLSearchParams;

  try {
    await creditStory({
      storyId,
      person: entered(form, "person"),
      roleId: entered(form, "role"),
    });
    said = new URLSearchParams({ credited: entered(form, "person") });
  } catch (error) {
    // Anything that is not a refusal is a bug rather than an answer, and stays
    // unhandled: it becomes a 500 and nobody dresses it up as advice.
    if (!isRefusal(error)) throw error;
    said = new URLSearchParams({ refused: error.message });
  }

  backToStory(storyId, said);
}

/** Remove a Credit. The person stays, credited wherever else they are. */
export async function uncredit(form: FormData): Promise<void> {
  await requireOwner();

  const storyId = storyFrom(form);
  let said: URLSearchParams;

  try {
    await uncreditStory(entered(form, "creditId"));
    said = new URLSearchParams({ uncredited: entered(form, "person") });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    said = new URLSearchParams({ refused: error.message });
  }

  backToStory(storyId, said);
}
