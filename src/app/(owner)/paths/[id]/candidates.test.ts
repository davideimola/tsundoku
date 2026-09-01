import { describe, expect, it } from "vitest";

import type { PathCandidate } from "@/core/queries/path";
import { STANDS_IN_NO_LINE, theRunsOnOffer, theWholeRunPress } from "./candidates";

// The bands the picker offers, tested beside themselves: data in, data out.
//
// What is worth pinning is the two things a band must not do. It must not re-order its rows,
// because this order is what the selection is *placed* in and not just how it is read; and it
// must not fold two editions of one name together, because those are two runs and two routes.

let minted = 0;

function aCandidate(of: Partial<PathCandidate> = {}): PathCandidate {
  minted += 1;

  return {
    id: `story-${minted}`,
    title: `Slam Dunk ${minted}`,
    type: { id: "manga", name: "Manga" },
    state: "to-read",
    series: null,
    standsAt: null,
    ...of,
  };
}

const SLAM_DUNK = { id: "slam-dunk", name: "Slam Dunk", editionLine: null };

describe("banding what could go on a route", () => {
  it("bands a run under the name the owner would call it", () => {
    const runs = theRunsOnOffer([
      aCandidate({ title: "Slam Dunk 1", series: SLAM_DUNK, standsAt: 1 }),
      aCandidate({ title: "Slam Dunk 2", series: SLAM_DUNK, standsAt: 2 }),
    ]);

    expect(runs).toMatchObject([
      { name: "Slam Dunk", seriesId: "slam-dunk", stories: [{ standsAt: 1 }, { standsAt: 2 }] },
    ]);
  });

  it("names the edition, because that is what tells two runs of one name apart", () => {
    const runs = theRunsOnOffer([
      aCandidate({
        series: { id: "fma-standard", name: "Fullmetal Alchemist", editionLine: null },
      }),
      aCandidate({
        series: {
          id: "fma-ultimate",
          name: "Fullmetal Alchemist",
          editionLine: "Ultimate Deluxe Edition",
        },
      }),
    ]);

    expect(runs.map((run) => run.name)).toEqual([
      "Fullmetal Alchemist",
      "Fullmetal Alchemist Ultimate Deluxe Edition",
    ]);
  });

  // The failure this keys on the id to avoid: thirty-four stops of a shelf that holds two runs
  // of seventeen.
  it("keeps two editions of one name apart even where the name is identical", () => {
    const runs = theRunsOnOffer([
      aCandidate({ series: { id: "one", name: "Death Note", editionLine: null } }),
      aCandidate({ series: { id: "two", name: "Death Note", editionLine: null } }),
    ]);

    expect(runs).toHaveLength(2);
  });

  it("bands what stands in no line as itself, wearing no colour", () => {
    const runs = theRunsOnOffer([aCandidate({ title: "Dune" })]);

    expect(runs).toMatchObject([{ name: STANDS_IN_NO_LINE, seriesId: null }]);
  });

  // **The order is the core's, and it is load-bearing**: it is the order the stops are placed
  // in, so nothing here may re-sort a band or the bands.
  it("keeps the order it was given, in the bands and between them", () => {
    const runs = theRunsOnOffer([
      aCandidate({ title: "Slam Dunk 10", series: SLAM_DUNK, standsAt: 10 }),
      aCandidate({ title: "Dune" }),
      aCandidate({ title: "Slam Dunk 1", series: SLAM_DUNK, standsAt: 1 }),
    ]);

    expect(runs.map((run) => run.name)).toEqual(["Slam Dunk", STANDS_IN_NO_LINE]);
    expect(runs[0].stories.map((story) => story.title)).toEqual(["Slam Dunk 10", "Slam Dunk 1"]);
  });

  it("has nothing to band when every Story is already on the route", () => {
    expect(theRunsOnOffer([])).toEqual([]);
  });
});

describe("the press over a whole band", () => {
  it("carries the number, so the gesture can be weighed before it is made", () => {
    const [run] = theRunsOnOffer([
      aCandidate({ series: SLAM_DUNK }),
      aCandidate({ series: SLAM_DUNK }),
    ]);

    expect(theWholeRunPress(run)).toBe("Put all 2 on");
  });

  it("says it plainly for a band of one, rather than printing *all 1*", () => {
    const [run] = theRunsOnOffer([aCandidate({ series: SLAM_DUNK })]);

    expect(theWholeRunPress(run)).toBe("Put it on");
  });
});
