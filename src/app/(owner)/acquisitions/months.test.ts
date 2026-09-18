import { describe, expect, it } from "vitest";
import type { AcquisitionMade } from "@/core/queries/acquisition";
import { acquisitionDetail, monthNamed, standingOf, whenItWas } from "./months";

// A screen's own derivation, under the licence `vitest.config.ts` states: data in, data out,
// and no renderer anywhere near it. What is worth holding is the two places this screen can
// tell a lie about a fact the library knows — a band with no month called by the shopping
// list's word for a plan, and an object that has left the house read as one that is on the
// shelf.

/** One acquisition, with only what these functions read filled in. */
function made(acquisition: Partial<AcquisitionMade> = {}): AcquisitionMade {
  return {
    id: "a1",
    acquiredOn: "2026-09-04",
    pricePaid: "6.50",
    releasedOn: null,
    volume: {
      id: "v1",
      title: "Slam Dunk 1",
      publisher: "Planet Manga",
      editionLine: null,
      binding: { id: "tankobon", name: "Tankōbon" },
      series: null,
      seriesNumber: 1,
      cover: null,
    },
    ...acquisition,
  };
}

describe("what a band is called", () => {
  it("names a month by its month and its year", () => {
    expect(monthNamed("2026-09")).toBe("September 2026");
  });

  // Not *Someday*, which is the shopping list's word for a plan the owner never made. Here
  // the day is simply not written down, and the band says so.
  it("names the band with no month after what is missing from it", () => {
    expect(monthNamed(null)).toBe("No day recorded");
  });

  it("calls a month it cannot read by what it says", () => {
    expect(monthNamed("banana")).toBe("banana");
  });
});

describe("what a month means from here", () => {
  const september = new Date(2026, 8, 18);

  it.each([
    ["2026-09", "this month"],
    ["2026-08", "last month"],
    ["2026-07", null],
    // Ahead of today, which the ledger can hold: a day typed wrong is still a record, and
    // nothing here calls it an error.
    ["2026-10", null],
  ])("reads %s as %s", (month, expected) => {
    expect(whenItWas(month, september)).toBe(expected);
  });

  // Across the turn of the year, which is the one the month arithmetic gets wrong when it is
  // written as a comparison of two strings.
  it("crosses the year", () => {
    expect(whenItWas("2025-12", new Date(2026, 0, 9))).toBe("last month");
    expect(whenItWas("2026-01", new Date(2026, 0, 9))).toBe("this month");
  });

  it("says nothing about a band with no month", () => {
    expect(whenItWas(null, september)).toBeNull();
  });
});

describe("where the object stands", () => {
  it("is in the house while the acquisition is open", () => {
    expect(standingOf(made())).toBe("In the house");
  });

  // The money was still spent, and the row is still in its month: the standing is about
  // this evening and the band is about what happened.
  it("says when it was let go", () => {
    expect(standingOf(made({ releasedOn: "2026-09-30" }))).toBe("Let go on 2026-09-30");
  });
});

describe("what the tile says", () => {
  it("leaves out what the object has not got", () => {
    expect(acquisitionDetail(made())).toBe("Slam Dunk 1 — Planet Manga — Tankōbon");
  });

  it("says the edition line where there is one", () => {
    const withLine = made({
      volume: { ...made().volume, editionLine: "Deluxe" },
    });

    expect(acquisitionDetail(withLine)).toBe("Slam Dunk 1 — Deluxe — Planet Manga — Tankōbon");
  });
});
