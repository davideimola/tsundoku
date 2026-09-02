import { describe, expect, it } from "vitest";

import { whereItLands } from "./landing";

// A screen's own derivation, tested beside itself under the licence `vitest.config.ts`
// states: data in, data out, and a function this application would still have if React were
// replaced. It is **not** a test of the drag — `./rail.tsx` holds a rectangle, a media query
// and four listeners, and what a move writes is `moveStoryOnPath` in
// `src/core/verbs/path.test.ts`, which is Seam 1.
//
// What earns the file is that the order on a route is the one thing in this application
// nothing derives (`./page.tsx`): it is typed in by hand, and a drag that lands a stop one
// gap off is a judgement quietly recorded wrong. The two arrows cannot make that mistake —
// they are *one place earlier* and *one place later* — so this is the arithmetic the
// scripted half adds, and the twin it has to agree with.

/** A route of four, in order. */
const ROUTE = ["a", "b", "c", "d"];

const ABOVE = true;
const BELOW = false;

describe("where a dragged stop lands", () => {
  it("comes to follow the row it was dropped under", () => {
    expect(whereItLands(ROUTE, "a", 2, BELOW)).toEqual({ after: "c" });
  });

  it("reads the upper half of a row as the gap before it", () => {
    expect(whereItLands(ROUTE, "d", 1, ABOVE)).toEqual({ after: "a" });
  });

  it("reaches the front of the route with no anchor at all", () => {
    expect(whereItLands(ROUTE, "c", 0, ABOVE)).toEqual({ after: null });
  });

  // The two gaps either side of the carried stop are where it already is, and letting go in
  // one of them is a hand changing its mind. Neither is a write.
  it("answers nothing for the gap the stop is already in", () => {
    expect(whereItLands(ROUTE, "c", 1, BELOW)).toBeNull();
    expect(whereItLands(ROUTE, "c", 3, ABOVE)).toBeNull();
  });

  it("answers nothing when a stop is dropped on itself", () => {
    expect(whereItLands(ROUTE, "b", 1, ABOVE)).toBeNull();
    expect(whereItLands(ROUTE, "b", 1, BELOW)).toBeNull();
  });

  it("answers nothing for the front when the stop is already at the front", () => {
    expect(whereItLands(ROUTE, "a", 0, ABOVE)).toBeNull();
  });

  // A stop cannot come to follow itself, so the gap under the carried row is named by the
  // row above it — which is the same gap, read from the other side.
  it("names the gap under the carried stop by the row above it", () => {
    expect(whereItLands(ROUTE, "b", 2, BELOW)).toEqual({ after: "c" });
    expect(whereItLands(ROUTE, "a", 1, BELOW)).toEqual({ after: "b" });
  });

  it("moves a stop to the end of the route", () => {
    expect(whereItLands(ROUTE, "a", 3, BELOW)).toEqual({ after: "d" });
  });

  // The route the page renders and the row the pointer found are read a moment apart: a
  // route re-ordered in another tab, a row that has gone. Nothing is written from a
  // disagreement between the two.
  it("answers nothing for a stop or a row the route does not have", () => {
    expect(whereItLands(ROUTE, "z", 1, BELOW)).toBeNull();
    expect(whereItLands(ROUTE, "a", 9, BELOW)).toBeNull();
    expect(whereItLands(ROUTE, "a", -1, BELOW)).toBeNull();
  });

  it("has nowhere to put the only stop on a route", () => {
    expect(whereItLands(["a"], "a", 0, ABOVE)).toBeNull();
    expect(whereItLands(["a"], "a", 0, BELOW)).toBeNull();
  });
});
