import { describe, expect, it } from "vitest";

import type { OpenWish } from "@/core/queries/wish";

import { priorityNamed, theShoppingList, wishDetail } from "./shopping";

// A screen's own derivation, tested beside itself under the licence `vitest.config.ts`
// states: data in, data out. What it decides is how a shopping list is **read** — the three
// steps it is bought in, and what an object is called when the tile beside it has no room to
// say so.

function wish(title: string, priority: number, since = "2026-01-01"): OpenWish {
  return {
    id: `${title}-${priority}`,
    priority,
    targetPrice: null,
    priceFound: null,
    withinTarget: null,
    shop: null,
    openedOn: since,
    volume: {
      id: title,
      title,
      publisher: "Planet Manga",
      editionLine: null,
      binding: { id: "tankobon", name: "Tankōbon" },
      language: "it",
      isbn: null,
      seriesId: null,
      seriesNumber: null,
      cover: null,
    },
    inCollection: false,
  };
}

describe("the three steps a shopping list is bought in", () => {
  it("bands the list in the order the owner buys in", () => {
    const bands = theShoppingList([wish("Akira", 3), wish("Blame!", 1), wish("Berserk", 2)]);

    expect(bands.map((band) => [band.name, band.wishes.length])).toEqual([
      ["Next", 1],
      ["Soon", 1],
      ["Someday", 1],
    ]);
  });

  // A heading over nothing says less than no heading: this library has a shopping list of
  // four, and three headings with two of them empty is the Story wall's mistake at a
  // smaller size. Built from the priorities that are *there* rather than filtered down to
  // them, which is why an empty band cannot arise.
  it("heads no band over nothing", () => {
    const bands = theShoppingList([wish("Akira", 1), wish("Blame!", 1)]);

    expect(bands.map((band) => band.name)).toEqual(["Next"]);
  });

  // **Nothing silently disappears from what the owner meant to buy** — the Wish's own rule
  // (`@/core/verbs/wish`), and the one thing banding could quietly break. The database
  // constrains a priority to the three, so this is a Wish that cannot exist; a band named
  // after the number it carries is what keeps *cannot exist* from meaning *is not shown*.
  it("shows a Wish whose priority the vocabulary does not name", () => {
    const bands = theShoppingList([wish("Akira", 7)]);

    expect(bands.map((band) => [band.name, band.hint, band.wishes.length])).toEqual([
      ["Priority 7", null, 1],
    ]);
  });

  it("keeps the order the core answered in, inside a band", () => {
    const bands = theShoppingList([
      wish("Waiting", 1, "2024-01-01"),
      wish("Fresh", 1, "2026-08-01"),
    ]);

    expect(bands[0]?.wishes.map((one) => one.volume.title)).toEqual(["Waiting", "Fresh"]);
  });

  it("is nothing at all for an empty list", () => {
    expect(theShoppingList([])).toEqual([]);
  });

  // The picker on the Pile offers the same three words, which is the whole reason
  // they are written down once.
  it("names a priority where the vocabulary has a word for it", () => {
    expect(priorityNamed(1)).toBe("Next");
    expect(priorityNamed(7)).toBe("Priority 7");
  });
});

describe("what the tile beside a Wish cannot fit", () => {
  it("says the object the way a shop would: what it is, in which edition, bound how", () => {
    const wanted = wish("Vagabond 12", 1);
    wanted.volume.editionLine = "Deluxe";

    expect(wishDetail(wanted)).toBe("Vagabond 12 — Deluxe — Planet Manga — Tankōbon");
  });

  it("leaves out what the object has not got rather than printing a gap", () => {
    expect(wishDetail(wish("Akira", 1))).toBe("Akira — Planet Manga — Tankōbon");
  });
});
