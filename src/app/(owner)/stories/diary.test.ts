import { describe, expect, it } from "vitest";

import { lastThroughInAMonth, lastThroughInAYear, latestFirst, viewAsked } from "./diary";

describe("the year under a settled tile", () => {
  it("is said in the Type's own past where it was finished", () => {
    expect(lastThroughInAYear({ outcome: "finished", endedOn: "2023-08-30" }, "read")).toBe(
      "Read in 2023"
    );
    expect(lastThroughInAYear({ outcome: "finished", endedOn: "2024-12-22" }, "played")).toBe(
      "Played in 2024"
    );
  });

  it("says abandoned where it was given up on, whatever the Type", () => {
    expect(lastThroughInAYear({ outcome: "abandoned", endedOn: "2026-01-06" }, "played")).toBe(
      "Abandoned in 2026"
    );
  });
});

describe("the month on a diary's row", () => {
  it("names the month and the year", () => {
    expect(lastThroughInAMonth({ endedOn: "2023-08-30" })).toBe("August 2023");
    expect(lastThroughInAMonth({ endedOn: "2021-01-01" })).toBe("January 2021");
  });
});

describe("the order a settled band is read in", () => {
  const story = (id: string) => ({ id });

  it("puts the most recent first and the undated after, in the order they came", () => {
    const endings = new Map([
      ["lotr", { endedOn: "2023-08-30" }],
      ["hades", { endedOn: "2026-07-05" }],
      ["tetris", { endedOn: "2021-07-31" }],
    ]);

    expect(
      latestFirst(
        [story("dark-souls"), story("hades"), story("lotr"), story("neuromancer"), story("tetris")],
        endings
      ).map((one) => one.id)
    ).toEqual(["hades", "lotr", "tetris", "dark-souls", "neuromancer"]);
  });

  it("keeps the wall's own order for two ended on one day", () => {
    const endings = new Map([
      ["b", { endedOn: "2024-01-01" }],
      ["a", { endedOn: "2024-01-01" }],
    ]);

    expect(latestFirst([story("b"), story("a")], endings).map((one) => one.id)).toEqual(["b", "a"]);
  });
});

describe("the view the address asks for", () => {
  it("is the diary's rows unless a known one is asked for", () => {
    expect(viewAsked(undefined)).toBe("list");
    expect(viewAsked("banana")).toBe("list");
    expect(viewAsked("covers")).toBe("covers");
  });
});
