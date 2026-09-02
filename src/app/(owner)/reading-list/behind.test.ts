import { describe, expect, it } from "vitest";

import type { ReadingListEntry, ReadingListReason } from "@/core/queries/reading-list";

import { theAddressWith, theReserveAsRows, theReserveIsSaid, theRoutesAskedFor } from "./behind";

// A screen's own derivation, tested beside itself under the licence `vitest.config.ts`
// states: data in, data out, and a function this application would still have if React were
// replaced. What is in here is the **shape of the reserve** — which of its entries lead and
// which of them stand behind a route's first stop — and the address that shows one route's
// stops without putting another's away.
//
// It is worth testing rather than looking at because both failures it prevents are silent. The
// reserve carries every stop still ahead on every active route (#40), so shaping it wrongly
// does not look broken: it looks like a shorter list, and the stop that quietly went missing
// is exactly the one the owner was going to pin — or it looks like a longer one, with a Story
// drawn under two routes, which is the duplication the whole model refuses.

/** A reason with everything absent, which the four sources fill differently. */
function reason(said: Partial<ReadingListReason> = {}): ReadingListReason {
  return { because: "path", want: null, path: null, run: null, series: null, ...said };
}

/** A stop of a route, as a reason. */
function onRoute(id: string, name: string, place: number): ReadingListReason {
  return reason({ because: "path", path: { id, name, intent: null, place } });
}

/** The owner having said they want to read it. */
function wanted(): ReadingListReason {
  return reason({ because: "want", want: { id: "a-want", openedAt: "2026-09-01T00:00:00Z" } });
}

/** A narrative entry: a Story, and the reasons that put it on the list. */
function story(id: string, ...reasons: ReadingListReason[]): ReadingListEntry {
  return {
    subject: { kind: "story", id },
    reasons,
    story: { id, title: id, type: { id: "comic", name: "Comic" } },
    medium: "digital",
    atHand: true,
    object: null,
    proposedWish: null,
    wishAlreadyOpen: false,
  };
}

/** A position of a line: the shopping half, which names an object and no narrative. */
function position(id: string, at: number): ReadingListEntry {
  return {
    subject: { kind: "series", id, position: at },
    reasons: [
      reason({
        because: "series",
        series: {
          id,
          name: id,
          publisher: "Panini",
          editionLine: null,
          position: at,
          publishedCount: 12,
        },
      }),
    ],
    story: null,
    medium: "paper",
    atHand: false,
    object: null,
    proposedWish: null,
    wishAlreadyOpen: false,
  };
}

/** What the rows are about, in the order they are drawn. */
function leading(rows: ReturnType<typeof theReserveAsRows>): string[] {
  return rows.map((row) => row.entry.subject.id);
}

describe("the reserve, shaped into rows", () => {
  it("keeps a route's first stop leading and puts the rest behind it", () => {
    const rows = theReserveAsRows(
      [
        story("daredevil", onRoute("marvel", "Marvel", 1)),
        story("hawkeye", onRoute("marvel", "Marvel", 2)),
        story("vision", onRoute("marvel", "Marvel", 3)),
      ],
      []
    );

    expect(leading(rows)).toEqual(["daredevil"]);
    expect(rows[0].behind).toHaveLength(1);
    expect(rows[0].behind[0].route.name).toBe("Marvel");
    expect(rows[0].behind[0].stops.map((stop) => [stop.entry.subject.id, stop.place])).toEqual([
      ["hawkeye", 2],
      ["vision", 3],
    ]);
  });

  it("offers nothing to open on a route with nothing behind its first stop", () => {
    const rows = theReserveAsRows([story("daredevil", onRoute("marvel", "Marvel", 1))], []);

    expect(rows[0].behind).toEqual([]);
  });

  it("leaves a stop that is also wanted on a row of its own, and out from behind", () => {
    const rows = theReserveAsRows(
      [
        story("hawkeye", wanted(), onRoute("marvel", "Marvel", 2)),
        story("daredevil", onRoute("marvel", "Marvel", 1)),
        story("vision", onRoute("marvel", "Marvel", 3)),
      ],
      []
    );

    // The Want composed first, so the row it put there leads the reserve — and it is one row
    // carrying both reasons rather than a row and a stop saying the same thing twice.
    expect(leading(rows)).toEqual(["hawkeye", "daredevil"]);
    expect(rows[1].behind[0].stops.map((stop) => stop.entry.subject.id)).toEqual(["vision"]);
  });

  it("draws a Story standing behind two routes once, on a row of its own", () => {
    const rows = theReserveAsRows(
      [
        story("daredevil", onRoute("marvel", "Marvel", 1)),
        story("hawkeye", onRoute("marvel", "Marvel", 2), onRoute("dc", "DC", 2)),
        story("batman", onRoute("dc", "DC", 1)),
      ],
      []
    );

    // Behind two rows is behind neither: it leads its own, where both of its reasons are said.
    expect(leading(rows)).toEqual(["daredevil", "hawkeye", "batman"]);
    expect(rows.flatMap((row) => row.behind)).toEqual([]);
  });

  it("hosts what is behind on the frontmost stop the route still has when the first is pinned", () => {
    // A pinned entry is in the head and gone from the reserve, so *Marvel 1* never arrives
    // here. What is left has to lead, or the whole route disappears from this half.
    const rows = theReserveAsRows(
      [
        story("hawkeye", onRoute("marvel", "Marvel", 2)),
        story("vision", onRoute("marvel", "Marvel", 3)),
      ],
      []
    );

    expect(leading(rows)).toEqual(["hawkeye"]);
    expect(rows[0].behind[0].stops.map((stop) => stop.entry.subject.id)).toEqual(["vision"]);
  });

  it("keeps two routes apart, each on its own leading row", () => {
    const rows = theReserveAsRows(
      [
        story("daredevil", onRoute("marvel", "Marvel", 1)),
        story("hawkeye", onRoute("marvel", "Marvel", 2)),
        story("batman", onRoute("dc", "DC", 1)),
        story("swamp-thing", onRoute("dc", "DC", 2)),
      ],
      []
    );

    expect(leading(rows)).toEqual(["daredevil", "batman"]);
    expect(rows[0].behind[0].route.id).toBe("marvel");
    expect(rows[1].behind[0].route.id).toBe("dc");
  });

  it("lets one row lead two routes at once", () => {
    const rows = theReserveAsRows(
      [
        story("daredevil", onRoute("marvel", "Marvel", 1), onRoute("re-reads", "Re-reads", 1)),
        story("hawkeye", onRoute("marvel", "Marvel", 2)),
        story("watchmen", onRoute("re-reads", "Re-reads", 2)),
      ],
      []
    );

    expect(leading(rows)).toEqual(["daredevil"]);
    expect(rows[0].behind.map((behind) => behind.route.id)).toEqual(["marvel", "re-reads"]);
  });

  it("never puts anything behind a Series row: a line offers one position, not a run of them", () => {
    const rows = theReserveAsRows([position("death-note", 4), position("death-note", 5)], []);

    // Both positions arrive as their own rows because the core only ever composes the next
    // missing one; nothing here puts one under the other.
    expect(leading(rows)).toEqual(["death-note", "death-note"]);
    expect(rows.flatMap((row) => row.behind)).toEqual([]);
  });

  it("shows the route the owner asked for and no other", () => {
    const rows = theReserveAsRows(
      [
        story("daredevil", onRoute("marvel", "Marvel", 1)),
        story("hawkeye", onRoute("marvel", "Marvel", 2)),
        story("batman", onRoute("dc", "DC", 1)),
        story("swamp-thing", onRoute("dc", "DC", 2)),
      ],
      ["dc"]
    );

    expect(rows[0].behind[0].shown).toBe(false);
    expect(rows[1].behind[0].shown).toBe(true);
  });

  it("shows nothing for a route that is not on the list", () => {
    const rows = theReserveAsRows(
      [
        story("daredevil", onRoute("marvel", "Marvel", 1)),
        story("hawkeye", onRoute("marvel", "Marvel", 2)),
      ],
      ["banana"]
    );

    expect(rows[0].behind[0].shown).toBe(false);
  });
});

describe("the routes the owner asked for", () => {
  it("reads one asked for, and several", () => {
    expect(theRoutesAskedFor("marvel")).toEqual(["marvel"]);
    expect(theRoutesAskedFor(["marvel", "dc"])).toEqual(["marvel", "dc"]);
  });

  it("reads none out of an absent parameter and out of a blank one", () => {
    expect(theRoutesAskedFor(undefined)).toEqual([]);
    expect(theRoutesAskedFor("  ")).toEqual([]);
    expect(theRoutesAskedFor(["marvel", ""])).toEqual(["marvel"]);
  });

  it("drops anything that is not text, because a form and a URL can both carry one", () => {
    expect(theRoutesAskedFor([new File([], "a-file"), "marvel"])).toEqual(["marvel"]);
  });
});

describe("what the reserve's heading says", () => {
  it("says only what could be started tonight where nothing stands behind a row", () => {
    expect(theReserveIsSaid(6, 0)).toBe("In no order. 6 of the whole list I could start tonight.");
  });

  it("says how many stand behind a row, so the fold is never a quiet subtraction", () => {
    expect(theReserveIsSaid(6, 3)).toContain("3 of them stand behind a route's first stop");
  });

  it("agrees with its own count when there is one of them", () => {
    expect(theReserveIsSaid(6, 1)).toContain("1 of them stands behind a route's first stop");
  });
});

describe("the address one route's stops are shown at", () => {
  it("shows a route and keeps the ones already shown", () => {
    expect(theAddressWith(["dc"], { show: "marvel" })).toBe("/reading-list?route=dc&route=marvel");
  });

  it("puts one route away and leaves the rest standing", () => {
    expect(theAddressWith(["dc", "marvel"], { hide: "dc" })).toBe("/reading-list?route=marvel");
  });

  it("goes back to the plain address when the last one is put away", () => {
    expect(theAddressWith(["dc"], { hide: "dc" })).toBe("/reading-list");
  });

  it("shows a route that is already shown exactly once", () => {
    expect(theAddressWith(["dc"], { show: "dc" })).toBe("/reading-list?route=dc");
  });
});
