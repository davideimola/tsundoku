"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal } from "@/core/refusal";
import {
  concludeSeries,
  declareSeries,
  declareSeriesCollected,
  placeVolumeInSeries,
  recordVolumesPublished,
  type SeriesStatus,
  stopCollectingSeries,
} from "@/core/verbs/series";
import { requireOwner } from "@/lib/auth/owner";

// The write side of the two Series screens, and a thin adapter like the pages beside it
// (ADR-0002): it reads a form, calls one verb, and says what the verb said. No SQL, no
// rule about what a Series may be, and — the rule this file exists to keep — no SQLSTATE
// and no constraint name. `refusing` in the core already turned the database's no into a
// `Refusal` carrying prose the verb wrote; here that prose is carried to the screen.
//
// The answer travels back in the URL rather than in React state, so every form works with
// no JavaScript running and the page after a write is a normal server render.

/** What a form's field held, or nothing where it was left empty. */
function text(form: FormData, field: string): string | null {
  const value = form.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * A whole number a form asked for, or `NaN` when the field held anything else — an empty
 * box included.
 *
 * `NaN` is deliberate and it reaches the verb, which refuses it as prose the owner reads.
 * `Number("")` is `0`, and zero is a *valid* count of published Volumes — an announced
 * Series with nothing out — so defaulting an empty box would silently empty the ledger
 * instead of saying that nothing was typed. The form's `required` is the browser's
 * courtesy, never the refusal.
 */
function count(form: FormData, field: string): number {
  const said = text(form, field);
  return said === null ? Number.NaN : Number(said);
}

/** Run one verb and come back to `where`, carrying either the news or the refusal. */
async function saying(
  where: string,
  news: URLSearchParams,
  work: () => Promise<void>
): Promise<never> {
  let said = news;

  try {
    await work();
  } catch (error) {
    // Anything that is not a refusal is a bug rather than an answer, and stays unhandled:
    // it becomes a 500 and nobody dresses it up as advice.
    if (!isRefusal(error)) throw error;
    said = new URLSearchParams({ refused: error.message });
  }

  revalidatePath(where);
  redirect(`${where}?${said}`);
}

/** Declare a Series, which starts no collecting project. */
export async function declare(form: FormData): Promise<void> {
  await requireOwner();

  const name = text(form, "name") ?? "";
  const status: SeriesStatus = text(form, "status") === "concluded" ? "concluded" : "ongoing";

  // The new Series' id is deliberately dropped: declaring lands back on the list, where
  // the owner can see it beside the others and decide whether they are collecting it.
  // That decision is the next screen's, and it is a separate act on purpose.
  await saying("/series", new URLSearchParams({ declared: name }), async () => {
    await declareSeries({
      name,
      publisher: text(form, "publisher") ?? "",
      editionLine: text(form, "editionLine"),
      publishedCount: count(form, "publishedCount"),
      status,
    });
  });
}

/** Decide that this Series is being completed. */
export async function collect(form: FormData): Promise<void> {
  await requireOwner();
  const id = text(form, "seriesId") ?? "";
  await saying(`/series/${id}`, new URLSearchParams({ collecting: "1" }), () =>
    declareSeriesCollected(id)
  );
}

/** Decide that it is not. Everything owned of it stays owned. */
export async function stopCollecting(form: FormData): Promise<void> {
  await requireOwner();
  const id = text(form, "seriesId") ?? "";
  await saying(`/series/${id}`, new URLSearchParams({ stopped: "1" }), () =>
    stopCollectingSeries(id)
  );
}

/** Record how many Volumes of the Series are out. */
export async function recordPublished(form: FormData): Promise<void> {
  await requireOwner();
  const id = text(form, "seriesId") ?? "";
  await saying(`/series/${id}`, new URLSearchParams({ recorded: "1" }), () =>
    recordVolumesPublished(id, count(form, "publishedCount"))
  );
}

/** Record that the publisher is done with the Series. */
export async function conclude(form: FormData): Promise<void> {
  await requireOwner();
  const id = text(form, "seriesId") ?? "";
  await saying(`/series/${id}`, new URLSearchParams({ concluded: "1" }), () => concludeSeries(id));
}

/** Record which position of the Series a Volume in the house is. */
export async function place(form: FormData): Promise<void> {
  await requireOwner();
  const id = text(form, "seriesId") ?? "";
  const number = count(form, "number");
  await saying(`/series/${id}`, new URLSearchParams({ placed: String(number) }), () =>
    placeVolumeInSeries({
      volumeId: text(form, "volumeId") ?? "",
      seriesId: id,
      number,
    })
  );
}
