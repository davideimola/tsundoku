import { describe, expect, it } from "vitest";

import type { SeriesVolume } from "@/core/queries/series";

import { positionsOf, standingSaid, whatTheFillMeans } from "./positions";

// A screen's own derivation, tested beside itself under the licence `vitest.config.ts`
// states: data in, data out, and a function this application would still have if React were
// replaced. What it answers is *what the spines are drawn from* — the positions of a Series,
// and what each one of them is.
//
// It earns a file of its own because of the judgement in it, which is the one the Series
// screen exists to keep straight: **a position the house has nothing standing in is only
// *missing* where the owner decided to complete the Series.** Holding 42 of Naruto's 72
// opens no project (ADR-0007's posture, and the ledger's own rule), so the other thirty
// positions are empty and are not a shopping list. Drawn as gaps either way, said in two
// different words — and the difference between those two words is the whole ticket.

const volume = (number: number, title = `Volume ${number}`): SeriesVolume => ({
  id: `v${number}`,
  title,
  number,
  binding: { id: "tankobon", name: "Tankōbon" },
});

describe("the positions of a Series being collected", () => {
  const collected = { publishedCount: 6, missing: [2, 5] };

  it("runs one position per published Volume, in order", () => {
    expect(positionsOf(collected, []).map((position) => position.number)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it("calls the positions the house has nothing in missing", () => {
    const standings = positionsOf(collected, []).map((position) => position.standing);

    expect(standings).toEqual(["held", "missing", "held", "held", "missing", "held"]);
  });

  it("carries the object standing at a position, so the spine can lead to it", () => {
    const positions = positionsOf(collected, [volume(3, "Death Note 3")]);

    expect(positions[2]).toMatchObject({
      number: 3,
      volume: { id: "v3", title: "Death Note 3" },
    });
    expect(positions[1].volume).toBeNull();
  });

  it("says nothing is missing from a complete Series", () => {
    const positions = positionsOf({ publishedCount: 2, missing: [] }, [volume(1), volume(2)]);

    expect(positions.map((position) => position.standing)).toEqual(["held", "held"]);
  });
});

// The Naruto case, and the reason this file is not two comparisons inside a component.
describe("the positions of a Series the owner is not collecting", () => {
  const known = { publishedCount: 4, missing: null };

  it("calls no position missing, because nothing is missing from a project nobody opened", () => {
    const standings = positionsOf(known, [volume(1)]).map((position) => position.standing);

    expect(standings).not.toContain("missing");
    expect(standings).toEqual(["held", "empty", "empty", "empty"]);
  });

  it("still draws every position, because what the publisher has done is worth knowing", () => {
    expect(positionsOf(known, []).map((position) => position.number)).toEqual([1, 2, 3, 4]);
  });
});

describe("a Series that outgrew the count the owner recorded", () => {
  // The count of published Volumes is the owner's to keep true and nothing reads a
  // catalogue, so an object can stand at a position past it — a seventh bought before the
  // ledger was told there is a seventh. Dropping it would take a real object off the screen.
  it("runs to the object standing furthest along it", () => {
    const positions = positionsOf({ publishedCount: 6, missing: [2] }, [volume(7)]);

    expect(positions.map((position) => position.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(positions[6]).toMatchObject({ number: 7, standing: "held" });
  });
});

describe("a Series with nothing published yet", () => {
  it("has no positions at all, which is what the screen says in words instead", () => {
    expect(positionsOf({ publishedCount: 0, missing: null }, [])).toEqual([]);
  });
});

// The screen's words, here rather than in the markup, so that the two screens drawing these
// spines cannot come to call one standing two things.
describe("what each standing is called", () => {
  it("never says missing where nothing is", () => {
    expect(standingSaid("empty")).not.toContain("issing");
    expect(standingSaid("missing")).toContain("issing");
    expect(standingSaid("held")).toBe("in the house");
  });
});

// The legend under the spines, which is the same judgement said in prose: it may not tell an
// owner who opened no collecting project that anything is missing from it.
describe("what the fill means", () => {
  it("names the missing positions, which are what gets typed into a shop's search", () => {
    const ledger = { publishedCount: 6, missing: [2, 5] };

    expect(whatTheFillMeans(ledger, positionsOf(ledger, []))).toEqual({
      said: "Missing",
      missing: [2, 5],
    });
  });

  it("says a collected Series is complete when nothing is missing", () => {
    const ledger = { publishedCount: 2, missing: [] };
    const { said, missing } = whatTheFillMeans(ledger, positionsOf(ledger, []));

    expect(missing).toEqual([]);
    expect(said).toContain("in the house");
  });

  it("says only what the fill means for a Series nobody is collecting", () => {
    const ledger = { publishedCount: 4, missing: null };
    const { said, missing } = whatTheFillMeans(ledger, positionsOf(ledger, []));

    expect(missing).toEqual([]);
    expect(said.toLowerCase()).not.toContain("missing");
    // The *why* is the screen's own paragraph, said once, there.
    expect(said).not.toContain("decided");
  });
});
