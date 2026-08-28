"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal } from "@/core/refusal";
import { closeWish, openWish } from "@/core/verbs/wish";
import { requireOwner } from "@/lib/auth/owner";

// The write side of the shopping list, and a thin adapter like the page beside it
// (ADR-0002): it reads a form, calls one verb, and says what the verb said. No SQL, no
// rule about what a Wish may be, and no SQLSTATE and no constraint name — `refusing` in
// the core already turned the database's no into prose the verb wrote.
//
// Two verbs and nothing else, which is the slice's rule made visible: a Wish is opened
// deliberately and closed deliberately, and there is no third thing this screen can do to
// one. Nothing here reaches for the Collection, because acquiring a Volume is not an event
// in a Wish's life.
//
// The answer travels back in the URL, like the Collection's: a plain form and a redirect
// work with no JavaScript running at all, which is what a screen used in a shop on the
// shop's signal needs.

/** What a form's field held, or nothing where the owner left it empty. */
function text(form: FormData, field: string): string | null {
  const value = form.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Open a Wish on a Volume already in the library, and say so on the shopping list. */
export async function open(form: FormData): Promise<void> {
  await requireOwner();

  let said: URLSearchParams;

  try {
    await openWish({
      volumeId: text(form, "volumeId") ?? "",
      // A picker offers three values, so anything else is not a priority the owner chose;
      // `NaN` is not an integer and the verb refuses it with the prose the picker's labels
      // use.
      priority: Number(text(form, "priority")),
      targetPrice: text(form, "targetPrice"),
      priceFound: text(form, "priceFound"),
      shop: text(form, "shop"),
    });
    // No title to report: the picker submits the Volume's id, and reading the title back
    // to put it in a URL would be a second query for one word of prose.
    said = new URLSearchParams({ opened: "1" });
  } catch (error) {
    // Anything that is not a refusal is a bug rather than an answer, and stays unhandled:
    // it becomes a 500 and nobody dresses it up as advice.
    if (!isRefusal(error)) throw error;
    said = new URLSearchParams({ refused: error.message });
  }

  revalidatePath("/wishes");
  redirect(`/wishes?${said}`);
}

/**
 * End a Wish. This is the deliberate act, and the only thing on this screen that ends one.
 */
export async function close(form: FormData): Promise<void> {
  await requireOwner();

  let said: URLSearchParams;

  try {
    await closeWish(text(form, "wishId") ?? "");
    said = new URLSearchParams({ closed: text(form, "title") ?? "" });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    said = new URLSearchParams({ refused: error.message });
  }

  revalidatePath("/wishes");
  redirect(`/wishes?${said}`);
}
