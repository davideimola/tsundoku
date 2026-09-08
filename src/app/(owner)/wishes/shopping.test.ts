import { describe, expect, it } from "vitest";

import type { OpenWish } from "@/core/queries/wish";

import {
  periodNamed,
  theMonthOf,
  thePanelStanding,
  thePeriodsOnOffer,
  theShoppingList,
  wishDetail,
} from "./shopping";

// A screen's own derivation, tested beside itself under the licence `vitest.config.ts`
// states: data in, data out. What it decides is how a shopping list is **read** — the months
// it is bought in, what each one comes to, and what an object is called when the tile beside
// it has no room to say so.
//
// The day is an argument everywhere it matters, which is what makes *this month* and *still
// waiting* assertable at all: a derivation that read the clock itself would be a test that
// passed in September and failed in October.
const SEPTEMBER = new Date(2026, 8, 8);

function wish(title: string, period: string | null, since = "2026-01-01"): OpenWish {
  return {
    id: `${title}-${period}`,
    period,
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

/** One priced Wish, since what a band comes to is the other half of this file. */
function priced(title: string, period: string | null, prices: Partial<OpenWish>): OpenWish {
  return { ...wish(title, period), ...prices };
}

describe("the months a shopping list is bought in", () => {
  it("bands the list earliest month first, with someday at the foot", () => {
    const bands = theShoppingList(
      [wish("Akira", null), wish("Blame!", "2026-09"), wish("Berserk", "2026-10")],
      SEPTEMBER
    );

    expect(bands.map((band) => [band.name, band.hint, band.wishes.length])).toEqual([
      ["September 2026", "this month", 1],
      ["October 2026", "next month", 1],
      ["Someday", "not yet", 1],
    ]);
  });

  // A heading over nothing says less than no heading. Built from the periods that are
  // *there* rather than from a fixed list of months filtered down to them, which is why an
  // empty band cannot arise — and why a list planned six months out has one heading rather
  // than six.
  it("heads no band over nothing", () => {
    const bands = theShoppingList([wish("Akira", "2026-09"), wish("Blame!", "2026-09")], SEPTEMBER);

    expect(bands.map((band) => band.name)).toEqual(["September 2026"]);
  });

  // **A month that has gone by keeps its own band** (ADR-0023). It is not folded into this
  // month, not marked late, and not moved: it says the month it was planned for, and it says
  // so at the head of the list because that month is the earliest one there.
  it("keeps a month that has gone by, and calls it still waiting", () => {
    const bands = theShoppingList(
      [wish("Pluto", "2026-07"), wish("Monster", "2026-09")],
      SEPTEMBER
    );

    expect(bands.map((band) => [band.name, band.hint])).toEqual([
      ["July 2026", "still waiting"],
      ["September 2026", "this month"],
    ]);
  });

  it("keeps the order the core answered in, inside a band", () => {
    const bands = theShoppingList(
      [wish("Waiting", "2026-09", "2024-01-01"), wish("Fresh", "2026-09", "2026-08-01")],
      SEPTEMBER
    );

    expect(bands[0]?.wishes.map((one) => one.volume.title)).toEqual(["Waiting", "Fresh"]);
  });

  it("is nothing at all for an empty list", () => {
    expect(theShoppingList([], SEPTEMBER)).toEqual([]);
  });
});

// **The figure a month made askable**, and it follows the application's rule about figures
// rather than a rule of its own: the total arrives with what it was computed over, because a
// heading cannot defend itself against a number that speaks for three rows out of eight.
describe("what a band comes to", () => {
  it("adds the price found, and the target where no price was found", () => {
    const bands = theShoppingList(
      [
        priced("Akira", "2026-09", { priceFound: "12.90", targetPrice: "15.00" }),
        priced("Blame!", "2026-09", { targetPrice: "9.10" }),
      ],
      SEPTEMBER
    );

    expect(bands[0]?.comesTo).toEqual({ figure: "22.00", from: 2, of: 2 });
  });

  it("says how many of the band it speaks for where it does not speak for all of it", () => {
    const bands = theShoppingList(
      [priced("Akira", "2026-09", { priceFound: "12.90" }), wish("Blame!", "2026-09")],
      SEPTEMBER
    );

    expect(bands[0]?.comesTo).toEqual({ figure: "12.90", from: 1, of: 2 });
  });

  // Records that exist and carry nothing is a gap rather than a nought — the same posture
  // every figure in this application takes. `from: 0` with rows above it is what the screen
  // reads to print *no prices yet* instead of `€ 0.00`, which would be a claim about money.
  it("counts nothing where no Wish in the band names a price", () => {
    const bands = theShoppingList([wish("Akira", "2026-09")], SEPTEMBER);

    expect(bands[0]?.comesTo).toEqual({ figure: "0.00", from: 0, of: 1 });
  });
});

describe("the months on offer", () => {
  it("offers the month the owner is standing in, the five after it, and someday", () => {
    expect(thePeriodsOnOffer(SEPTEMBER).map((period) => period.value)).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "",
    ]);
  });

  it("counts the year over, rather than offering a thirteenth month", () => {
    expect(thePeriodsOnOffer(new Date(2026, 10, 20))[2]?.name).toBe("January 2027");
  });

  // **A period further out than the six is a plan the picker did not think of, not one it
  // takes away.** A form that quietly dropped it would replan the Wish on the way onto the
  // screen.
  it("keeps a month the Wish already carries, wherever it is", () => {
    const offered = thePeriodsOnOffer(SEPTEMBER, "2028-04").map((period) => period.value);

    expect(offered).toContain("2028-04");
    expect(offered.indexOf("2028-04")).toBe(offered.length - 2);
  });

  it("offers a month already on the list exactly once", () => {
    const offered = thePeriodsOnOffer(SEPTEMBER, "2026-10").map((period) => period.value);

    expect(offered.filter((value) => value === "2026-10")).toHaveLength(1);
  });

  it("names a month the way the owner reads one, and no period at all", () => {
    expect(periodNamed("2026-09")).toBe("September 2026");
    expect(periodNamed(null)).toBe("Someday");
  });

  it("writes a month the way every door says one", () => {
    expect(theMonthOf(SEPTEMBER)).toBe("2026-09");
  });
});

// The rule every panel in this application is held to: an address is read against the acts
// the screen has, and against the records it is standing over.
describe("which panel the address is asking for", () => {
  const list = [wish("Akira", "2026-09")];

  it("opens the act that needs no Wish", () => {
    expect(thePanelStanding("open", undefined, list)).toEqual({ act: "open" });
  });

  it("opens a per-card act over the Wish it names", () => {
    expect(thePanelStanding("bought", "Akira-2026-09", list)).toEqual({
      act: "bought",
      wish: list[0],
    });
  });

  it("opens nothing for an act this screen has not got", () => {
    expect(thePanelStanding("banana", undefined, list)).toBeNull();
  });

  // A Wish that has ended is not on the list, so a hand-typed address naming one stands no
  // form over it — which is the same honesty as `?panel=banana` and matters more: this one
  // would be a *Bought it* form over nothing at all.
  it("opens nothing for a Wish that is not on the list", () => {
    expect(thePanelStanding("bought", "gone", list)).toBeNull();
    expect(thePanelStanding("amend", undefined, list)).toBeNull();
  });
});

describe("what the tile beside a Wish cannot fit", () => {
  it("says the object the way a shop would: what it is, in which edition, bound how", () => {
    const wanted = wish("Vagabond 12", "2026-09");
    wanted.volume.editionLine = "Deluxe";

    expect(wishDetail(wanted)).toBe("Vagabond 12 — Deluxe — Planet Manga — Tankōbon");
  });

  it("leaves out what the object has not got rather than printing a gap", () => {
    expect(wishDetail(wish("Akira", "2026-09"))).toBe("Akira — Planet Manga — Tankōbon");
  });
});
