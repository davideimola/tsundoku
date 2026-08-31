import { describe, expect, it } from "vitest";

import type { RecordedVolume } from "@/core/queries/collection";

import { facedWith, timesSaid, whatTheHouseSays, whatTheLookupSaid } from "./standing";

// A screen's own derivation, tested beside itself under the licence `vitest.config.ts` states.
// What it answers is *where the owner stands with one object*, in words.
//
// The case that earns the file is the third one. Being catalogued is not being owned
// (ADR-0007), and **an object that left the house is not an object nobody ever had** — the
// two are told apart by `releasedOn`, and a screen that blurred them would tell the owner
// they never owned the thing they sold. The other half is the vocabulary: *in the house*, not
// *on the shelf*, because `CONTEXT.md` takes that word off the table for the Collection and
// the spine a Series is drawn as already says *in the house*.
//
// **The cover's sentences are the same kind of case** (#32): five states the tile itself
// cannot tell apart, two of which look identical to an owner staring at a blank tile — the
// sources were asked and have none, and nobody has asked. And a source that could not be
// reached is a third thing again, which is the distinction the research this rests on got
// wrong once and produced a false 0% from.

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
    cover: null,
    lookedUp: { source: null, reference: null, infoUrl: null, at: null },
    ...standing,
  }) as RecordedVolume;

/** A record a lookup has reached, and found nothing on. */
const lookedOn = (at: string) => ({ source: null, reference: null, infoUrl: null, at });

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

describe("what the tile is faced with", () => {
  it("names the source, so an image is never anonymous", () => {
    expect(facedWith(volume({ cover: { url: "https://x/y", from: "google-books" } }))).toContain(
      "Google Books"
    );
    expect(facedWith(volume({ cover: { url: "https://x/y", from: "open-library" } }))).toContain(
      "Open Library"
    );
    expect(facedWith(volume({ cover: { url: "https://x/y", from: "own" } }))).toContain(
      "of your own"
    );
  });

  // The three blank tiles, which look identical on the wall and are three different facts.
  it("tells an established absence from a question nobody asked", () => {
    const asked = facedWith(volume({ isbn: "9788828765431", lookedUp: lookedOn("2026-08-31") }));
    const never = facedWith(volume({ isbn: "9788828765431" }));

    expect(asked).toContain("No source has a cover");
    expect(never).toContain("Nobody has looked");
    expect(asked).not.toBe(never);
  });

  it("says a Volume with no ISBN cannot be asked about at all, rather than that it has none", () => {
    const said = facedWith(volume({ isbn: null }));

    // Every Bonelli monthly is in this state for ever, and the button that would move the
    // other two states can never move this one.
    expect(said).toContain("No ISBN");
    expect(said).not.toContain("Nobody has looked");
  });
});

describe("what one lookup answered", () => {
  it("says a cover arrived, and says an absence is recorded", () => {
    expect(whatTheLookupSaid("found", undefined)).toContain("cover was found");
    expect(whatTheLookupSaid("none", undefined)).toContain("No source has a cover");
    expect(whatTheLookupSaid("unchanged", undefined)).toContain("still where it was");
  });

  // The one this exists for: nothing was written down, so it is not an answer about the book
  // and the owner must not read it as one.
  it("never reads a source that could not be reached as an absence", () => {
    const said = whatTheLookupSaid("unanswered", "Open Library is rate-limiting this address.");

    expect(said).toContain("rate-limiting");
    expect(said).toContain("Nothing was recorded");
    expect(said).not.toContain("No source has a cover");
  });

  it("still says something where the source gave no reason", () => {
    expect(whatTheLookupSaid("unanswered", undefined)).toContain("could not be reached");
  });
});
