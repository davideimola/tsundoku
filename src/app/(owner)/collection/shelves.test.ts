import { describe, expect, it } from "vitest";

import { inTheHouse, shelvesOf, theBindingItShares, viewAsked } from "./shelves";

const opm = { id: "opm", name: "One-Punch Man" };
const berserk = { id: "berserk", name: "Berserk" };

function volume(id: string, series: { id: string; name: string } | null, binding = "tankobon") {
  return { id, series, binding: { id: binding, name: binding } };
}

describe("the wall cut into shelves", () => {
  it("stands each Series' objects together, in the order they came", () => {
    const { runs, onTheirOwn } = shelvesOf([
      volume("b1", berserk),
      volume("b2", berserk),
      volume("lotr", null, "hardcover"),
      volume("o1", opm),
      volume("o2", opm),
    ]);

    expect(runs.map((run) => [run.series.id, run.volumes.map((one) => one.id)])).toEqual([
      ["berserk", ["b1", "b2"]],
      ["opm", ["o1", "o2"]],
    ]);
    expect(onTheirOwn.map((one) => one.id)).toEqual(["lotr"]);
  });

  it("puts the objects in no Series apart, after every shelf", () => {
    const { runs, onTheirOwn } = shelvesOf([
      volume("a", null),
      volume("o1", opm),
      volume("z", null),
    ]);

    expect(runs).toHaveLength(1);
    expect(onTheirOwn.map((one) => one.id)).toEqual(["a", "z"]);
  });
});

describe("the Binding a shelf shares", () => {
  it("is said once where every object shares it", () => {
    expect(theBindingItShares([volume("1", opm), volume("2", opm)])).toBe("tankobon");
  });

  it("is nothing where they are bound more than one way, or there is nothing", () => {
    expect(theBindingItShares([volume("1", opm), volume("2", opm, "deluxe")])).toBeNull();
    expect(theBindingItShares([])).toBeNull();
  });
});

describe("how much of a line is in the house", () => {
  it("is a fraction of what is out, with the share the bar is filled to", () => {
    expect(inTheHouse({ ownedCount: 22, publishedCount: 30 })).toEqual({
      said: "22 of 30 in the house",
      share: 22 / 30,
    });
  });

  it("never fills the bar past the end where the count is behind the shelf", () => {
    expect(inTheHouse({ ownedCount: 5, publishedCount: 3 }).share).toBe(1);
  });

  it("is the count alone where nobody recorded how many are out", () => {
    expect(inTheHouse({ ownedCount: 3, publishedCount: 0 })).toEqual({
      said: "3 in the house",
      share: null,
    });
  });
});

describe("the view the address asks for", () => {
  it("is covers unless spines are asked for", () => {
    expect(viewAsked(undefined)).toBe("covers");
    expect(viewAsked("banana")).toBe("covers");
    expect(viewAsked("spines")).toBe("spines");
  });
});
