"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal } from "@/core/refusal";
import { acquireVolume, catalogueVolume } from "@/core/verbs/collection";
import { type CoverLookupReport, lookUpCovers } from "@/core/verbs/cover";
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

/**
 * Look up the covers of the objects that could have one, and come back saying what was found
 * **and what was not**.
 *
 * **The one action in this application that waits on somebody else's server**, and it is a
 * form post rather than anything running in the browser (ADR-0010): the owner presses it,
 * a few seconds pass, and the wall re-renders with the jackets on it. A run touches a batch
 * and the report says how many objects nobody has asked about yet, so the answer to "there
 * are more" is to press it again.
 *
 * Nothing on a page render calls a source (#32). This is the *only* path in the app that
 * does, which is what keeps the Collection wall answerable on a shop's signal.
 */
export async function findCovers(): Promise<void> {
  await requireOwner();

  let report: CoverLookupReport;
  try {
    report = await lookUpCovers();
  } catch (error) {
    if (!isRefusal(error)) throw error;
    revalidatePath("/collection");
    redirect(`/collection?${new URLSearchParams({ refused: error.message })}`);
  }

  // The whole report travels in the URL, because a page after a write is a plain server
  // render (ADR-0010) and there is no React state for it to live in. Every number the verb
  // answered with, named — a run that reported six of its seven would be a run whose sentence
  // could not add up — and the clauses they become are the screen's own, `./covers-found.ts`.
  revalidatePath("/collection");
  redirect(
    `/collection?${new URLSearchParams({
      found: String(report.found),
      refreshed: String(report.refreshed),
      absent: String(report.absent),
      unanswered: String(report.unanswered),
      checked: String(report.checked),
      skipped: String(report.skipped),
      stillDue: String(report.stillDue),
    })}`
  );
}

// **Releasing a Volume is not here, and that is the wall becoming a wall** (#23). It used to
// be a button on a row of this screen; the rows are tiles now, and a tile carries no
// controls. The act moved to the object's own page, which is where the owner is standing
// when they decide it has gone — and where the second tap it costs is deliberate, since
// nothing undoes it.
