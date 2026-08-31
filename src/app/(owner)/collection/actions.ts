"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal } from "@/core/refusal";
import { acquireVolume, catalogueVolume } from "@/core/verbs/collection";
import { requireOwner } from "@/lib/auth/owner";

// The write side of the Collection screen, and a thin adapter like the page beside it
// (ADR-0002): it reads a form, calls one verb, and says what the verb said. No SQL, no
// rule about what a Volume may be, and — the rule this file exists to keep — no SQLSTATE
// and no constraint name. `refusing` in the core already turned the database's no into a
// `Refusal` carrying prose the verb wrote; here that prose is simply carried to the
// screen.
//
// The answer travels back in the URL rather than in React state, because this screen is
// used one-handed in a shop on whatever signal the shop has: a plain form and a redirect
// work with no JavaScript running at all, and the page after the write is a normal
// server render of the Collection. The query string is disposable — a refresh shows the
// list without it.

/** What a form's field held, or nothing where the owner left it empty. */
function text(form: FormData, field: string): string | null {
  const value = form.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Do the work, and say what it said. One shape for the screen's two verbs. */
async function saying(said: URLSearchParams, work: () => Promise<unknown>): Promise<never> {
  let answer = said;

  try {
    await work();
  } catch (error) {
    // Anything that is not a refusal is a bug rather than an answer, and stays
    // unhandled: it becomes a 500 and nobody dresses it up as advice.
    if (!isRefusal(error)) throw error;
    answer = new URLSearchParams({ refused: error.message });
  }

  revalidatePath("/collection");
  redirect(`/collection?${answer}`);
}

/**
 * Record what an object is. It joins the catalogue and **not** the Collection (ADR-0007).
 *
 * One form, one verb: the price and the day it came home belong to an acquisition, so this
 * form does not ask for them and this action does not write them. A caller wanting both
 * acts says both, because they are two facts and one of them is often not true yet.
 */
export async function catalogue(form: FormData): Promise<void> {
  await requireOwner();

  const title = text(form, "title") ?? "";

  return saying(new URLSearchParams({ catalogued: title }), () =>
    catalogueVolume({
      title,
      publisher: text(form, "publisher") ?? "",
      editionLine: text(form, "editionLine"),
      binding: text(form, "binding") ?? "",
      language: text(form, "language") ?? "",
      isbn: text(form, "isbn"),
    })
  );
}

/** Record that a catalogued Volume is in the house. The Collection starts claiming it. */
export async function acquire(form: FormData): Promise<void> {
  await requireOwner();

  return saying(new URLSearchParams({ acquired: text(form, "title") ?? "" }), () =>
    acquireVolume({
      volumeId: text(form, "volumeId") ?? "",
      pricePaid: text(form, "pricePaid"),
      acquiredOn: text(form, "acquiredOn"),
    })
  );
}

// **Releasing a Volume is not here, and that is the wall becoming a wall** (#23). It used to
// be a button on a row of this screen; the rows are tiles now, and a tile carries no
// controls. The act moved to the object's own page, which is where the owner is standing
// when they decide it has gone — and where the second tap it costs is deliberate, since
// nothing undoes it.
