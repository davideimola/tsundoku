"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { whatIsOnThisIsbn } from "@/core/queries/isbn";
import { isRefusal } from "@/core/refusal";
import { acquireVolume, catalogueVolume, strikeVolumes } from "@/core/verbs/collection";
import { type CoverLookupReport, type HowToLookUp, lookUpCovers } from "@/core/verbs/cover";
import { requireOwner } from "@/lib/auth/owner";
import { whereTheIsbnLeads } from "./identified";
import { THE_WALLS_FILTERS } from "./panels";

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

/**
 * Say what an ISBN is — the owner's own catalogue first, then the national one — and go
 * wherever the answer leads.
 *
 * **The second act on this screen that waits on somebody else's server, and the first one a
 * camera starts.** It is a plain form post for the same reason the cover run is (ADR-0010):
 * the field is typed into as often as it is scanned, the scanner writes into that same field
 * and submits this same form, and a lookup that only worked once a bundle had parsed would be
 * a lookup that is not there in a shop.
 *
 * It writes nothing. What it does is answer *do I already have this?* against Postgres before
 * anybody's network is involved, and then hand the ordinary catalogue form whatever the
 * catalogue of record could tell it. Where each of the five answers leads is `./identified.ts`
 * — a screen's own derivation, and the reason this function is four lines.
 */
export async function identify(form: FormData): Promise<void> {
  await requireOwner();

  const typed = text(form, "isbn") ?? "";

  // What the owner had narrowed the wall to, carried in the form because a Server Function has
  // no URL to read it off. It is threaded back into every destination on this screen: a lookup
  // is navigation over a shelf that is still narrowed underneath.
  const filters = new URLSearchParams();
  for (const name of THE_WALLS_FILTERS) {
    const value = text(form, name);
    if (value) filters.set(name, value);
  }

  const said = await whatIsOnThisIsbn(typed);

  // No `revalidatePath`: nothing was written, and the wall behind the panel is as true as it
  // was a moment ago.
  redirect(whereTheIsbnLeads(typed, said, filters));
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
  return reportingWhatWasFound({});
}

/**
 * Ask the sources again about objects that already carry a cover, instead of checking the
 * cover is still there.
 *
 * **A second button because it is a second act.** The run above is the cheap sweep: it spends
 * no request on a jacket that still loads, which is right nearly always and is exactly wrong
 * in the case that produced this app's worst bug — a cover fetched against an ISBN that was
 * later corrected is *live* and belongs to another book, and nothing that asks whether an
 * image loads can tell. This throws the recorded answers away and asks from the ISBNs that
 * are on the rows now.
 */
export async function findCoversAgain(): Promise<void> {
  return reportingWhatWasFound({ again: true });
}

/**
 * The shared body of the two buttons above.
 *
 * The wall is called **here**, which is on the only path either export has — a Server
 * Function that delegated its authorisation to a caller would be a Server Function anybody
 * could POST to. `src/app/gated.test.ts` checks the file; this is the reason the file passes.
 */
async function reportingWhatWasFound(how: HowToLookUp): Promise<void> {
  await requireOwner();

  let report: CoverLookupReport;
  try {
    report = await lookUpCovers(how);
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

/**
 * Strike the ticked Volumes from the catalogue: the library stops knowing them.
 *
 * **Not a release, and the difference is the whole of it.** Releasing says an object left the
 * house and keeps every record of it, because those are facts about the owner's past
 * (ADR-0007). Striking says the record was a mistake — a duplicate an assistant proposed and
 * the owner approved in a bulk of forty — and a row that never stood for anything has no past
 * to keep.
 *
 * **Bulk, because a mess arrives by the dozen**, and whole-or-nothing, because half a
 * clean-up leaves the owner working out which half. The verb refuses the gesture if any one
 * of the selection has the owner's own life on it and names the one that stands; that prose
 * is carried back here the way every refusal is.
 */
export async function strike(form: FormData): Promise<void> {
  await requireOwner();

  const ticked = form
    .getAll("strikeId")
    .filter((value): value is string => typeof value === "string");

  // **Back to the list, open, either way.** Clean-up is repeated — a mess arrives by the
  // dozen and the owner works through it — so closing the drawer on them after each pass
  // would cost a tap to reopen every time. A refusal has to come back here for a stronger
  // reason: it names the one object that stands, and that sentence is only useful next to
  // the tick it is about. (Acquiring, in the same drawer, does the opposite and closes: the
  // object joined the wall, and seeing it there is the answer.)
  let struck: number;
  try {
    struck = await strikeVolumes(ticked);
  } catch (error) {
    if (!isRefusal(error)) throw error;
    revalidatePath("/collection");
    redirect(`/collection?${new URLSearchParams({ panel: "elsewhere", refused: error.message })}`);
  }

  revalidatePath("/collection");
  redirect(`/collection?${new URLSearchParams({ panel: "elsewhere", struck: String(struck) })}`);
}

// **Releasing a Volume is not here, and that is the wall becoming a wall** (#23). It used to
// be a button on a row of this screen; the rows are tiles now, and a tile carries no
// controls. The act moved to the object's own page, which is where the owner is standing
// when they decide it has gone — and where the second tap it costs is deliberate, since
// nothing undoes it.
