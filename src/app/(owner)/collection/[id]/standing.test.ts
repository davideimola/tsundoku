import { describe, expect, it } from "vitest";

import type { RecordedVolume } from "@/core/queries/collection";

import { timesSaid, whatTheHouseSays } from "./standing";

// A screen's own derivation, tested beside itself under the licence `vitest.config.ts` states.
// What it answers is *where the owner stands with one object*, in words.
//
// The case that earns the file is the third one. Being catalogued is not being owned
// (ADR-0007), and **an object that left the house is not an object nobody ever had** — the
// two are told apart by `releasedOn`, and a screen that blurred them would tell the owner
// they never owned the thing they sold. The other half is the vocabulary: *in the house*, not
// *on the shelf*, because `CONTEXT.md` takes that word off the table for the Collection and
// the spine a Series is drawn as already says *in the house*.

const volume = (standing: Partial<RecordedVolume>): RecordedVolume =>
  ({
    id: "9f2c",
    title: "Death Note Black Edition III",
    publisher: "Planet Manga",
    editionLine: "Black Edition",
    binding: { id: "tankobon", name: "Tankōbon" },
    language: "it",
    pricePaid: null,
    acquiredOn: null,
    isbn: null,
    inTheHouse: false,
    releasedOn: null,
    series: null,
    seriesNumber: null,
    ...standing,
  }) as RecordedVolume;

describe("where the owner stands with an object", () => {
  it("says it is in the house, from the day it came home", () => {
    expect(whatTheHouseSays(volume({ inTheHouse: true, acquiredOn: "2019-04-02" }))).toBe(
      "In the house, since 2019-04-02."
    );
  });

  it("says so with no day, rather than leaving a blank where a day would be", () => {
    const said = whatTheHouseSays(volume({ inTheHouse: true }));

    expect(said).toContain("In the house");
    expect(said).toContain("nobody wrote down");
  });

  it("tells one that left the house apart from one that was never in it", () => {
    const letGo = whatTheHouseSays(volume({ releasedOn: "2024-01-05" }));
    const neverHere = whatTheHouseSays(volume({}));

    expect(letGo).toContain("Left the house on 2024-01-05");
    expect(neverHere).toContain("Catalogued");
    expect(neverHere).not.toContain("Left the house");
  });

  it("says nothing was erased by the release, because nothing was", () => {
    expect(whatTheHouseSays(volume({ releasedOn: "2024-01-05" }))).toContain("record is kept");
  });

  // The word `CONTEXT.md` takes off the table for the Collection: *shelf*.
  it("never calls the Collection the shelf", () => {
    const everyState = [
      whatTheHouseSays(volume({ inTheHouse: true, acquiredOn: "2019-04-02" })),
      whatTheHouseSays(volume({ inTheHouse: true })),
      whatTheHouseSays(volume({ releasedOn: "2024-01-05" })),
      whatTheHouseSays(volume({})),
    ];

    for (const said of everyState) {
      expect(said.toLowerCase()).not.toContain("shelf");
    }
  });
});

describe("how many times one object was acquired", () => {
  it("uses the word where English has one", () => {
    expect(timesSaid(2)).toBe("twice");
    expect(timesSaid(3)).toBe("three times");
  });

  it("counts past that, because nobody has a word for the seventh time", () => {
    expect(timesSaid(7)).toBe("7 times");
  });
});
