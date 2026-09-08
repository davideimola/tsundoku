"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal } from "@/core/refusal";
import { boughtWhatWasWished } from "@/core/verbs/bought-what-was-wished";
import { amendWish, closeWish, openWish } from "@/core/verbs/wish";
import { requireOwner } from "@/lib/auth/owner";
import {
  BUYING_WHAT_WAS_WISHED,
  OPENING_A_WISH,
  REPLANNING_A_WISH,
  THE_WISH_A_PANEL_IS_ABOUT,
} from "./shopping";

// The write side of the shopping list, and a thin adapter like the page beside it
// (ADR-0002): it reads a form, calls one verb, and says what the verb said. No SQL, no
// rule about what a Wish may be, and no SQLSTATE and no constraint name — `refusing` in
// the core already turned the database's no into prose the verb wrote.
//
// Four verbs now, and the two that arrived are the two the screen was missing (ADR-0023).
// **Replanning is not a delete**: a Wish's month, prices and shop are rewritten on the record,
// because closing one and opening another would lose the day it was opened — the fact the list
// orders by. And **one press says why a Wish ended**: *Bought it* is `boughtWhatWasWished`, one
// verb over two areas, which records the acquisition and closes the Wish in one transaction.
//
// That last one is the only thing here that reaches the Collection, and it reaches it through
// a verb rather than by calling two: composing them in this file would invent a transaction
// that does not exist (`@/core/verbs/README.md`), and half of it landing is a Wish still on the
// list for a book already on the shelf. Acquiring a Volume from the Collection still ends
// nothing.
//
// The answer travels back in the URL, like the Collection's: a plain form and a redirect
// work with no JavaScript running at all, which is what a screen used in a shop on the
// shop's signal needs.
//
// **And a refused Wish comes back with its panel open** (#31, `@/components/drawer`): the
// form is in a drawer now, the sentence the verb wrote is about what was typed into it, and
// a banner printed on the page behind a panel is a refusal the owner cannot read. Closing a
// Wish is a press on the card and answers on the page, which is where the press was.

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
      // The picker submits a month or nothing at all, and nothing at all is *someday* rather
      // than a missing answer — which is why an empty box is not a refusal here.
      period: text(form, "period"),
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
    // Back into the panel it was typed in, with the prose beside the fields.
    said = new URLSearchParams({ panel: OPENING_A_WISH, refused: error.message });
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

/**
 * Replan an open Wish: a different month, different money, a different shop.
 *
 * **Every box is written, including the empty ones**, which is what `amendWish` reads a
 * present-and-empty field as: clearing the period is how a Wish moves to *someday*, and a
 * price that is no longer on the shelf is a number to take off. That is the whole difference
 * between this door and an Amendment an assistant proposes (ADR-0023).
 */
export async function replan(form: FormData): Promise<void> {
  await requireOwner();

  const wishId = text(form, "wishId") ?? "";
  let said: URLSearchParams;

  try {
    await amendWish(wishId, {
      period: text(form, "period"),
      targetPrice: text(form, "targetPrice"),
      priceFound: text(form, "priceFound"),
      shop: text(form, "shop"),
    });
    said = new URLSearchParams({ replanned: text(form, "title") ?? "" });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    said = new URLSearchParams({
      panel: REPLANNING_A_WISH,
      [THE_WISH_A_PANEL_IS_ABOUT]: wishId,
      refused: error.message,
    });
  }

  revalidatePath("/wishes");
  redirect(`/wishes?${said}`);
}

/**
 * The object came home: record the acquisition and end the Wish, in one press.
 *
 * The price is the owner's rather than the Wish's — the panel prefills it with the price the
 * Wish found, and what they press through is what is written, because *what it cost where I
 * saw it* and *what I paid* are two numbers that are usually equal and sometimes not.
 */
export async function bought(form: FormData): Promise<void> {
  await requireOwner();

  const wishId = text(form, "wishId") ?? "";
  let said: URLSearchParams;

  try {
    await boughtWhatWasWished(wishId, {
      acquiredOn: text(form, "acquiredOn"),
      pricePaid: text(form, "pricePaid"),
    });
    said = new URLSearchParams({ bought: text(form, "title") ?? "" });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    said = new URLSearchParams({
      panel: BUYING_WHAT_WAS_WISHED,
      [THE_WISH_A_PANEL_IS_ABOUT]: wishId,
      refused: error.message,
    });
  }

  revalidatePath("/wishes");
  redirect(`/wishes?${said}`);
}
