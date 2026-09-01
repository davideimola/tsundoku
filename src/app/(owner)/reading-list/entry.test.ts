import { describe, expect, it } from "vitest";

import type { ReadingListEntry } from "@/core/queries/reading-list";

import {
  entryDetail,
  entryFoot,
  entryLeadsTo,
  entryLine,
  entryStanding,
  entryTitle,
} from "./entry";

// A screen's own derivation, tested beside itself under the licence `vitest.config.ts`
// states: data in, data out, and a function this application would still have if React were
// replaced. What is in here is the **judgement over a composed entry** — an entry has no title
// of its own, no record of its own to open, no colour, no number and no description, because
// it is not a row anywhere. Every one of them is read off whichever half of it is filled.
//
// It is worth testing rather than looking at because the two halves lead different ways: a
// Path entry is about a narrative and a Series entry is about an object the owner does not
// have (ADR-0001), and a tile that opened the wrong one would be the list sending them to the
// shelf for something they meant to read.

/** An entry with everything absent, which is the shape the two sources fill differently. */
function entry(said: Partial<ReadingListEntry> = {}): ReadingListEntry {
  return {
    because: "path",
    path: null,
    series: null,
    story: null,
    medium: "paper",
    atHand: true,
    object: null,
    proposedWish: null,
    wishAlreadyOpen: false,
    pinned: false,
    ...said,
  };
}

/** An object the library knows, placed in a line or not. */
function object(said: Partial<NonNullable<ReadingListEntry["object"]>> = {}) {
  return {
    id: "an-object",
    title: "Vagabond 1",
    publisher: "Planet Manga",
    editionLine: null,
    binding: { id: "tankobon", name: "Tankōbon" },
    inTheHouse: true,
    seriesId: null,
    seriesNumber: null,
    cover: null,
    ...said,
  };
}

const A_STORY = { id: "a-story", title: "Vagabond", type: { id: "manga", name: "Manga" } };

const A_LINE = {
  id: "a-series",
  name: "Death Note",
  publisher: "Planet Manga",
  editionLine: null,
  position: 4,
  publishedCount: 12,
};

describe("what an entry is called", () => {
  it("is the Story on a route, and the object where a Series names one", () => {
    expect(entryTitle(entry({ story: A_STORY }))).toBe("Vagabond");
    expect(entryTitle(entry({ because: "series", series: A_LINE, object: object() }))).toBe(
      "Vagabond 1"
    );
  });

  // The honest name for a position nobody has catalogued: it is what the owner would look
  // for in a shop, and the library has no object to name instead.
  it("is the line and the number where nothing has been catalogued at that position", () => {
    expect(entryTitle(entry({ because: "series", series: A_LINE }))).toBe("Death Note 4");
  });
});

describe("the line that decides whether it can be started tonight", () => {
  it("is the medium, and then what stands between the owner and it", () => {
    expect(entryStanding(entry({ medium: "digital" }))).toBe("digital · tonight");
    expect(entryStanding(entry({ atHand: true }))).toBe("paper · on the shelf");
    expect(entryStanding(entry({ atHand: false }))).toBe("paper · buy it first");
    expect(entryStanding(entry({ atHand: false, wishAlreadyOpen: true }))).toBe(
      "paper · already on the shopping list"
    );
  });
});

describe("where the tile leads", () => {
  // The narrative, because that is what a route is a route through — never the object it
  // happens to be carried by.
  it("is the Story on a route", () => {
    expect(entryLeadsTo(entry({ story: A_STORY, object: object() }))).toBe("/stories/a-story");
  });

  it("is the object where a Series entry has one to open", () => {
    expect(entryLeadsTo(entry({ because: "series", series: A_LINE, object: object() }))).toBe(
      "/collection/an-object"
    );
  });

  // Nothing has been catalogued at that position, so the ledger — the screen that says what
  // is missing — is the honest place to land.
  it("is the line's own ledger where nothing stands at the position", () => {
    expect(entryLeadsTo(entry({ because: "series", series: A_LINE }))).toBe("/series/a-series");
  });
});

describe("the line the tile takes its colour from", () => {
  // A Series entry is about a line and names it; a Path entry is about a narrative, which has
  // none of its own, so its colour is the carrying object's — the same borrowing the Story
  // wall makes.
  it("is the Series a Series entry is about", () => {
    expect(entryLine(entry({ because: "series", series: A_LINE }))).toBe("a-series");
  });

  it("is the line the object stands in, on a route", () => {
    expect(entryLine(entry({ story: A_STORY, object: object({ seriesId: "a-line" }) }))).toBe(
      "a-line"
    );
  });

  // The palette's own paper, which is what something read digitally is drawn on.
  it("is nothing where the entry stands in no line", () => {
    expect(entryLine(entry({ story: A_STORY }))).toBeNull();
  });
});

// One description for the pointer and the screen reader, so a tile cannot say one thing and
// the row beside it another.
describe("what the tile is described as", () => {
  it("is what it is called and whether it can be started tonight", () => {
    expect(entryDetail(entry({ story: A_STORY, medium: "digital" }))).toBe(
      "Vagabond — digital · tonight"
    );
  });
});

describe("the number at the tile's foot", () => {
  it("is the position the Series entry is about", () => {
    expect(entryFoot(entry({ because: "series", series: A_LINE }))).toBe(4);
  });

  it("is the position of the object carrying the Story, where it stands in a line", () => {
    expect(entryFoot(entry({ story: A_STORY, object: object({ seriesNumber: 12 }) }))).toBe(12);
  });

  // No line, so no number — and the Type is what is left worth reading at that size, which
  // is the fallback an object's own page makes for the same reason.
  it("is the Type where the entry stands in no line at all", () => {
    expect(entryFoot(entry({ story: A_STORY }))).toBe("Manga");
  });
});
