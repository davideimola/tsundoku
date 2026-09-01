import { describe, expect, it } from "vitest";
import {
  type CoverReport,
  howFarTheCoversHaveGot,
  readCoverReport,
  whatNoLookupReaches,
  whatTheLookupFound,
} from "./covers-found.ts";

// **A screen's own derivation, tested beside itself** — the licence `vitest.config.ts`
// states once and grants to `find/kinds.ts`, `inbox/decisions.ts` and `series/positions.ts`
// under the same rule: data in, data out, a function this application would still have if
// React were replaced. It is not a third seam and touches no database and no source; what
// the *lookup* does is Seam 1, in `src/core/verbs/cover.test.ts`.
//
// What it is worth testing is the one thing a cover report can get wrong and nobody would
// notice: folding the five outcomes into fewer. An owner who reads a rate limit as an
// absence stops pressing the button, and an owner who reads *43 still to ask about* over
// objects that have no ISBN presses it for ever.

function report(said: Partial<CoverReport> = {}): CoverReport {
  return {
    found: 0,
    refreshed: 0,
    absent: 0,
    unanswered: 0,
    checked: 0,
    skipped: 0,
    stillDue: 0,
    ...said,
  };
}

describe("reading the report off the URL", () => {
  it("reads every number a run came back with", () => {
    const asked = (name: string) =>
      ({
        found: "3",
        refreshed: "2",
        absent: "1",
        unanswered: "0",
        checked: "8",
        skipped: "40",
        stillDue: "50",
      })[name];

    expect(readCoverReport(asked)).toEqual({
      found: 3,
      refreshed: 2,
      absent: 1,
      unanswered: 0,
      checked: 8,
      skipped: 40,
      stillDue: 50,
    });
  });

  it("is nothing at all where the page was not arrived at from a run", () => {
    expect(readCoverReport(() => undefined)).toBeNull();
  });

  // Half a report reads as the reassuring half of one, which is the failure worth refusing:
  // a sentence with "12 covers found" in it and no "5 the sources could not answer for".
  it.each([
    ["one number missing altogether", { stillDue: undefined }],
    ["a number that is not one", { absent: "many" }],
    ["a negative", { found: "-1" }],
    ["a fraction", { skipped: "1.5" }],
  ])("is nothing at all for %s", (_, broken) => {
    const whole: Record<string, string | undefined> = {
      found: "3",
      refreshed: "2",
      absent: "1",
      unanswered: "0",
      checked: "8",
      skipped: "40",
      stillDue: "50",
      ...broken,
    };

    expect(readCoverReport((name) => whole[name])).toBeNull();
  });
});

describe("what the run did, said", () => {
  it("says each outcome that happened, in the order the owner cares about", () => {
    expect(
      whatTheLookupFound(report({ found: 12, refreshed: 2, absent: 3, checked: 8, stillDue: 40 }))
    ).toEqual([
      "12 covers found",
      "2 that had gone were replaced",
      "3 that the sources have none for",
      "8 checked and still there",
      "40 still to ask about",
    ]);
  });

  it("says nothing about the outcomes that did not happen", () => {
    expect(whatTheLookupFound(report({ found: 1 }))).toEqual(["1 cover found"]);
  });

  // The one that must never be folded away: nothing was written down about those objects,
  // so a second run will ask again — and the owner has to be able to tell that from an
  // absence, which is a permanent answer.
  it("keeps what could not be asked apart from what has no cover", () => {
    const said = whatTheLookupFound(report({ absent: 2, unanswered: 5 }));

    expect(said).toHaveLength(2);
    expect(said[1]).toContain("nothing was recorded");
  });

  // The verb counts every object it touched exactly once, and these clauses are read as a
  // sum: a repair printed as both *replaced* and *found* would describe one object twice and
  // make the run look like it did more than it did.
  it("says a repair once, and not also as a find", () => {
    expect(whatTheLookupFound(report({ refreshed: 2 }))).toEqual(["2 that had gone were replaced"]);
  });

  it("says nothing at all where a run did nothing at all", () => {
    expect(whatTheLookupFound(report())).toEqual([]);
  });
});

describe("what no lookup reaches", () => {
  // Every Bonelli monthly, always: an ISSN-derived periodical EAN is not an ISBN.
  it("is a sentence of its own, so it is never read as work still to do", () => {
    expect(whatNoLookupReaches(40)).toContain("no ISBN");
    expect(whatNoLookupReaches(40)).toContain("40 Volumes have");
  });

  it("says one Volume in the singular", () => {
    expect(whatNoLookupReaches(1)).toContain("1 Volume has");
  });

  it("is silent where every object carries an ISBN", () => {
    expect(whatNoLookupReaches(0)).toBeNull();
  });
});

describe("how far the covers have got", () => {
  it("is the figure with its denominator, because a count of covers alone says nothing", () => {
    expect(howFarTheCoversHaveGot({ volumes: 96, faced: 31, due: 25, withoutAnIsbn: 40 })).toBe(
      "31 of 96 Volumes are faced with an image."
    );
  });

  // The verb agrees with what is being said — one thing is faced — and the noun with what it
  // is being said out of. They are two different numbers, and *1 of 96 Volumes are faced*
  // reads as a typo on the one screen that is meant to look considered.
  it("agrees the verb with the figure and the noun with its denominator", () => {
    expect(howFarTheCoversHaveGot({ volumes: 96, faced: 1, due: 25, withoutAnIsbn: 40 })).toBe(
      "1 of 96 Volumes is faced with an image."
    );
    expect(howFarTheCoversHaveGot({ volumes: 1, faced: 0, due: 1, withoutAnIsbn: 0 })).toBe(
      "0 of 1 Volume are faced with an image."
    );
  });

  it("is silent where there is no catalogue to be a fraction of", () => {
    expect(howFarTheCoversHaveGot({ volumes: 0, faced: 0, due: 0, withoutAnIsbn: 0 })).toBeNull();
  });
});
