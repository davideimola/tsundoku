import { describe, expect, it } from "vitest";

import { type PartBounds, thePartUnder, theSpanAsked } from "./span-of-the-work";

// Twelve parts drawn across 240 pixels, which is the All-Star Superman case at a desk.
const TWELVE: PartBounds[] = Array.from({ length: 12 }, (_, i) => ({
  part: i + 1,
  left: 100 + i * 20,
  right: 100 + i * 20 + 19,
}));

describe("which part of the work the pointer is over", () => {
  it("answers with the part whose tick it is inside", () => {
    expect(thePartUnder(TWELVE, 105)).toBe(1);
    expect(thePartUnder(TWELVE, 225)).toBe(7);
    expect(thePartUnder(TWELVE, 335)).toBe(12);
  });

  it("answers with the nearest part where the gesture has run off an end", () => {
    expect(thePartUnder(TWELVE, 20)).toBe(1);
    expect(thePartUnder(TWELVE, 900)).toBe(12);
  });

  // A gap of one pixel between two ticks is not a place the owner meant to stop.
  it("answers in a gap with the tick it is nearest, and keeps the earlier one on a tie", () => {
    expect(thePartUnder(TWELVE, 119.5)).toBe(1);
    expect(thePartUnder(TWELVE, 120)).toBe(2);
  });

  it("has nothing to answer where no part is drawn", () => {
    expect(thePartUnder([], 105)).toBe(null);
  });
});

describe("the range a gesture is asking for", () => {
  it("reads a sweep left to right", () => {
    expect(theSpanAsked(1, 12)).toEqual({ from: 1, to: 12 });
  });

  // The same sentence, said backwards. A range that inverts is refused by the database, so
  // it must never leave here inverted.
  it("reads a sweep right to left as the same range", () => {
    expect(theSpanAsked(12, 1)).toEqual({ from: 1, to: 12 });
  });

  it("reads a press that never moved as one part", () => {
    expect(theSpanAsked(1, 1)).toEqual({ from: 1, to: 1 });
  });
});
