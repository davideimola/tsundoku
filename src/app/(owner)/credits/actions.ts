"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { suggestCreditedPeople } from "@/core/queries/credit";
import { isRefusal } from "@/core/refusal";
import { creditStory, uncreditStory } from "@/core/verbs/credit";
import { requireOwner } from "@/lib/auth/owner";
import { rolesSaid } from "./roles";
import type { SuggestedName } from "./suggestion";

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
//
// **The third function here is a read, which is unusual and deliberate** — `../find/actions.ts`
// is the precedent and the reasoning is the same. It is the question the picker under the name
// field asks, one keystroke at a time, so the field can answer without a navigation; and
// nothing depends on it, because the form it stands in is the plain `POST` above (ADR-0010).
// It is a Server Function rather than a route handler because the wall is the same call either
// way (`src/app/gated.test.ts` requires it of both), and it lives beside the write it feeds
// rather than in a file of its own: what the owner is being helped to type is exactly the name
// `credit` is about to be given.

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

/** A suggestion list's worth. Fewer than the finder's, because it stands inside a form. */
const SUGGESTIONS = 6;

/**
 * The people the library already credits whose name holds what has been typed so far.
 *
 * **This exists because of one irreversible thing** (ADR-0012): the name is unique on
 * `lower(name)`, there is no rename verb and no merge verb, so a second spelling of *Yusuke
 * Murata* is a second person for as long as the library stands and no query will ever join
 * the two back together. The library is about to be handed a few hundred proposed Credits;
 * the list this fills is how the owner reuses a spelling instead of inventing one.
 *
 * The wall first, like every entry point behind the gate: a layout does not run for a Server
 * Function, so this is one of the places the gate is enforced rather than assumed.
 */
export async function suggestPeople(term: string): Promise<SuggestedName[]> {
  await requireOwner();

  // Read as untrusted. A Server Function is a POST, so `term` arrives as whatever the caller
  // sent whatever the signature says.
  if (typeof term !== "string") return [];

  const people = await suggestCreditedPeople({ term, atMost: SUGGESTIONS });

  // Drawn on this side of the wire, so the list holds no derivation (#28) — and drawn by
  // `./roles.ts`, which is the one place the Credit screens say a set of roles, so the row
  // under the field cannot come to say it differently from the two screens it echoes.
  return people.map((who) => ({ name: who.name, qualifier: rolesSaid(who.roles) }));
}
