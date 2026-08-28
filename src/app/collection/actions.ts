"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal } from "@/core/refusal";
import { acquireVolume, releaseVolume } from "@/core/verbs/collection";

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

/** Record a Volume as the owner's, and say so on the Collection. */
export async function acquire(form: FormData): Promise<void> {
  let said: URLSearchParams;

  try {
    await acquireVolume({
      title: text(form, "title") ?? "",
      publisher: text(form, "publisher") ?? "",
      editionLine: text(form, "editionLine"),
      binding: text(form, "binding") ?? "",
      language: text(form, "language") ?? "",
      pricePaid: text(form, "pricePaid"),
      purchaseDate: text(form, "purchaseDate"),
      isbn: text(form, "isbn"),
    });
    said = new URLSearchParams({ acquired: text(form, "title") ?? "" });
  } catch (error) {
    // Anything that is not a refusal is a bug rather than an answer, and stays
    // unhandled: it becomes a 500 and nobody dresses it up as advice.
    if (!isRefusal(error)) throw error;
    said = new URLSearchParams({ refused: error.message });
  }

  revalidatePath("/collection");
  redirect(`/collection?${said}`);
}

/** Record that a Volume left the house. The Collection stops claiming it. */
export async function release(form: FormData): Promise<void> {
  let said: URLSearchParams;

  try {
    await releaseVolume(text(form, "volumeId") ?? "");
    said = new URLSearchParams({ released: text(form, "title") ?? "" });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    said = new URLSearchParams({ refused: error.message });
  }

  revalidatePath("/collection");
  redirect(`/collection?${said}`);
}
