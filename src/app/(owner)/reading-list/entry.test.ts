import { describe, expect, it } from "vitest";

import type { ReadingListEntry, ReadingListReason } from "@/core/queries/reading-list";

import {
  entryDetail,
  entryFoot,
  entryLeadsTo,
  entryLine,
  entryStanding,
  entryTitle,
  reasonSaid,
  theRoutesOf,
  theWantOn,
} from "./entry";

// A screen's own derivation, tested beside itself under the licence `vitest.config.ts`
// states: data in, data out, and a function this application would still have if React were
// replaced. What is in here is the **judgement over a composed entry** — an entry has no title
// of its own, no record of its own to open, no colour, no number and no description, because
// it is not a row anywhere. Every one of them is read off whichever reasons put it there.
//
// It is worth testing rather than looking at because the two halves lead different ways: a
// narrative entry is about a Story and a Series entry is about an object the owner does not
// have (ADR-0001), and a tile that opened the wrong one would be the list sending them to the
// shelf for something they meant to read.

/** A reason with everything absent, which the four sources fill differently. */
function reason(said: Partial<ReadingListReason> = {}): ReadingListReason {
  return { because: "path", want: null, path: null, run: null, series: null, ...said };
}

/** An entry with everything absent. A real one always carries at least one reason. */
function entry(said: Partial<ReadingListEntry> = {}): ReadingListEntry {
  return {
    subject: { kind: "story", id: "a-story" },
    reasons: [],
    story: null,
    medium: "paper",
    atHand: true,
    object: null,
    proposedWish: null,
    wishAlreadyOpen: false,
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

const A_ROUTE = { id: "a-path", name: "Angolo Giappone", intent: null, place: 1 };

/** The shape a Series entry has: a position of a line, and no narrative at all. */
function seriesEntry(said: Partial<ReadingListEntry> = {}): ReadingListEntry {
  return entry({
    subject: { kind: "series", id: A_LINE.id, position: A_LINE.position },
    reasons: [reason({ because: "series", series: A_LINE })],
    ...said,
  });
}

/** The shape a narrative entry has: a Story, and one route or Want that named it. */
function storyEntry(said: Partial<ReadingListEntry> = {}): ReadingListEntry {
  return entry({
    story: A_STORY,
    reasons: [reason({ because: "path", path: A_ROUTE })],
    ...said,
  });
}

describe("what an entry is called", () => {
  it("is the Story on a route, and the object where a Series names one", () => {
    expect(entryTitle(storyEntry())).toBe("Vagabond");
    expect(entryTitle(seriesEntry({ object: object() }))).toBe("Vagabond 1");
  });

  // The honest name for a position nobody has catalogued: it is what the owner would look
  // for in a shop, and the library has no object to name instead.
  it("is the line and the number where nothing has been catalogued at that position", () => {
    expect(entryTitle(seriesEntry())).toBe("Death Note 4");
  });
});

// **One row says every reason it is there** (#40), so each reason is worded on its own and
// the row is the list of them. A route's stop says where it stands in what is left of that
// route, because what stands behind the next stop is what the owner pins out of.
describe("why a row is on the list", () => {
  it("says the Want in the owner's own words, naming nothing to open", () => {
    expect(reasonSaid(reason({ because: "want", want: { id: "a-want", openedAt: "" } }))).toEqual({
      said: "I said I want to read it",
      names: null,
    });
  });

  it("says a route's stop by where it stands in what is left of the route", () => {
    expect(reasonSaid(reason({ path: A_ROUTE }))).toEqual({
      said: "Next on ",
      names: { label: "Angolo Giappone", href: "/paths/a-path" },
    });
    expect(reasonSaid(reason({ path: { ...A_ROUTE, place: 3 } })).said).toBe("3rd in line on ");
    expect(reasonSaid(reason({ path: { ...A_ROUTE, place: 11 } })).said).toBe("11th in line on ");
    expect(reasonSaid(reason({ path: { ...A_ROUTE, place: 22 } })).said).toBe("22nd in line on ");
  });

  it("says a run in progress as how far it got and what comes next", () => {
    // *Seven of twenty*, in the work's own words — the same wording the Story's own page
    // says it in, because there is one of it (#43).
    expect(
      reasonSaid(
        reason({
          because: "run",
          run: { howFarItGot: { atInstalment: 7, instalments: 20 }, nextInstalment: 8 },
        })
      )
    ).toEqual({ said: "7 of 20 read — carry on at 8", names: null });
  });

  it("says a run nothing has been read of yet as a start rather than a continuation", () => {
    // Nothing read is *0 of 20* — a work owned whole and never opened, or a pass that has
    // finished none of it — and the act it asks for is starting rather than carrying on.
    expect(
      reasonSaid(
        reason({
          because: "run",
          run: { howFarItGot: { atInstalment: 0, instalments: 20 }, nextInstalment: 1 },
        })
      ).said
    ).toBe("0 of 20 read — start at 1");
  });

  it("counts a Series position against what the publisher has printed", () => {
    expect(reasonSaid(reason({ because: "series", series: A_LINE }))).toEqual({
      said: "Volume 4 of 12 of ",
      names: { label: "Death Note", href: "/series/a-series" },
    });
  });

  it("reads the Want and the routes off a row that carries several reasons", () => {
    const wanted = storyEntry({
      reasons: [
        reason({ because: "want", want: { id: "a-want", openedAt: "2026-01-01" } }),
        reason({ path: A_ROUTE }),
        reason({ path: { id: "dc", name: "DC", intent: null, place: 2 } }),
      ],
    });

    expect(theWantOn(wanted)?.id).toBe("a-want");
    expect(theRoutesOf(wanted).map((route) => route.name)).toEqual(["Angolo Giappone", "DC"]);
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
    expect(entryLeadsTo(storyEntry({ object: object() }))).toBe("/stories/a-story");
  });

  it("is the object where a Series entry has one to open", () => {
    expect(entryLeadsTo(seriesEntry({ object: object() }))).toBe("/collection/an-object");
  });

  // Nothing has been catalogued at that position, so the ledger — the screen that says what
  // is missing — is the honest place to land.
  it("is the line's own ledger where nothing stands at the position", () => {
    expect(entryLeadsTo(seriesEntry())).toBe("/series/a-series");
  });
});

describe("the line the tile takes its colour from", () => {
  // A Series entry is about a line and names it; a narrative entry is about a Story, which
  // has none of its own, so its colour is the carrying object's — the same borrowing the
  // Story wall makes.
  it("is the Series a Series entry is about", () => {
    expect(entryLine(seriesEntry())).toBe("a-series");
  });

  it("is the line the object stands in, on a route", () => {
    expect(entryLine(storyEntry({ object: object({ seriesId: "a-line" }) }))).toBe("a-line");
  });

  // The palette's own paper, which is what something read digitally is drawn on.
  it("is nothing where the entry stands in no line", () => {
    expect(entryLine(storyEntry())).toBeNull();
  });
});

// One description for the pointer and the screen reader, so a tile cannot say one thing and
// the row beside it another.
describe("what the tile is described as", () => {
  it("is what it is called and whether it can be started tonight", () => {
    expect(entryDetail(storyEntry({ medium: "digital" }))).toBe("Vagabond — digital · tonight");
  });
});

describe("the number at the tile's foot", () => {
  it("is the position the Series entry is about", () => {
    expect(entryFoot(seriesEntry())).toBe(4);
  });

  it("is the position of the object carrying the Story, where it stands in a line", () => {
    expect(entryFoot(storyEntry({ object: object({ seriesNumber: 12 }) }))).toBe(12);
  });

  // No line, so no number — and the Type is what is left worth reading at that size, which
  // is the fallback an object's own page makes for the same reason.
  it("is the Type where the entry stands in no line at all", () => {
    expect(entryFoot(storyEntry())).toBe("Manga");
  });
});
