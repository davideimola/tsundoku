import { describe, expect, it } from "vitest";

import { type Colour, contrast, inGamut, token } from "@/test/palette";
import { TINTS, type Tint, tint } from "./tint";

// The shelf's own colour, and the fourth wall in this app — a wall for the same reason the
// palette is one (`src/app/palette.test.ts`): the failure it catches is silent. A tint that
// came out too dark on paper still renders, still looks deliberate in a screenshot, and has
// simply made a Series' titles unreadable for the one person who will ever open this.
//
// It is tested beside itself, as the gate's predicate and the rate limit are, and for the
// same reason: it is a function the application would still have if React were replaced —
// an identity in, a pair of colours out — so it is arithmetic rather than a third seam. No
// DOM, no renderer, no database.
//
// Two properties, and they are the two the ticket asks for (#22):
//
//   1. **A Series keeps its tint.** The same identity yields the same colour on every run
//      and every deploy, because a shelf that changes colour under the owner is a shelf
//      they can never learn. The recorded pair below is what makes "every deploy" a test
//      rather than a hope.
//   2. **Every tint it can produce is legible.** Not the ones a fixture happens to hit —
//      *every* one, enumerated, on both grounds, against the same declared ink the palette
//      wall measures. The range is a constant precisely so that it can be walked.

/** `oklch(L C H)` read back as numbers, so a colour this module *wrote* can be measured. */
function parse(colour: string): Colour {
  const read = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(colour);
  if (!read) throw new Error(`${colour} is not the oklch form this module promises`);

  return { l: Number(read[1]), c: Number(read[2]), h: Number(read[3]) };
}

/** The two grounds, and what a tile is printed in on each: the palette's own ink. */
const ON = {
  paper: {
    ink: token(":root", "--ink"),
    paper: token(":root", "--paper"),
    of: (t: Tint) => t.paper,
  },
  "a dark room": {
    ink: token(".dark", "--ink"),
    paper: token(".dark", "--paper"),
    of: (t: Tint) => t.dark,
  },
} as const;

describe("a Series keeps its tint", () => {
  it("answers the same colour every time it is asked", () => {
    const series = "3f1a6b0e-2c4d-4a8f-9b7e-5d0c1a2b3c4d";

    expect(tint(series)).toEqual(tint(series));
  });

  // The pin. Determinism inside one run is a property of any pure function; what the owner
  // needs is that the shelf is the same colour *tomorrow*, on a build nobody thought about
  // this file in. A recorded pair is the only form of that assertion there is, and changing
  // it is the deliberate act of repainting somebody's shelf.
  it("answers what it answered when this test was written", () => {
    expect(tint("3f1a6b0e-2c4d-4a8f-9b7e-5d0c1a2b3c4d")).toEqual({
      paper: "oklch(0.83 0.08 188)",
      dark: "oklch(0.38 0.06 188)",
    });
  });

  it("gives two Series two colours, and spreads them across the range", () => {
    const shelf = Array.from({ length: 100 }, (_, n) => `series-${n}`).map((id) => tint(id)?.paper);

    // Not all 100 distinct — 100 draws from 360 hues collide, and two Series sharing a
    // colour is a shelf, not a bug. What would be a bug is a hash that lands them all in
    // one place, which is what this number is watching for.
    expect(new Set(shelf).size).toBeGreaterThan(75);
  });

  // The Story with no Series, which is the ordinary case rather than a gap: being read and
  // being owned are unrelated facts (ADR-0001), so a Story read digitally has no object and
  // therefore no line to take a colour from. It gets no tint, and the tile that draws it
  // falls back to the palette — which the wall above has already proven legible.
  it("has no colour for a Story that is in no Series", () => {
    expect(tint(null)).toBeNull();
    expect(tint(undefined)).toBeNull();
    expect(tint("")).toBeNull();
  });

  it("only ever answers with one of the tints it declares", () => {
    const range = new Set(TINTS.map((one) => one.paper));

    expect(
      Array.from({ length: 200 }, (_, n) => tint(`series-${n}`)?.paper).every((one) =>
        range.has(one as string)
      )
    ).toBe(true);
  });
});

describe("every tint it can produce", () => {
  it("declares a range worth walking", () => {
    expect(TINTS.length).toBeGreaterThanOrEqual(180);
  });

  describe.each(Object.entries(ON))("on %s", (_, on) => {
    // sRGB is what a browser can show. A colour outside it is clamped on the way to the
    // screen, which means the contrast measured below would be measured on a colour nobody
    // sees — the assertion would pass and the shelf would still be wrong.
    it("is a colour the screen can actually show", () => {
      const outside = TINTS.map(on.of).filter((colour) => !inGamut(parse(colour)));

      expect(outside).toEqual([]);
    });

    // The same threshold the palette holds ink to on paper: a tile's title is read, and
    // the tint is the ground it is read on. Full ink and nothing quieter is printed on a
    // tile for exactly this reason — quiet ink on a tint clears nothing.
    it("keeps a title legible, at the reading threshold", () => {
      const unreadable = TINTS.map(on.of)
        .map((colour) => ({ colour, ratio: contrast(parse(colour), on.ink) }))
        .filter(({ ratio }) => ratio < 7)
        .map(({ colour, ratio }) => `${colour} at ${ratio.toFixed(2)}:1`);

      expect(unreadable).toEqual([]);
    });

    // And the other direction: a tile has to read as an object standing on the page rather
    // than as a wash over it. Well under a text threshold — it is a boundary between two
    // large areas, and the hairline around the tile does the rest.
    it("stands off the ground it is laid on", () => {
      const invisible = TINTS.map(on.of).filter(
        (colour) => contrast(parse(colour), on.paper) < 1.2
      );

      expect(invisible).toEqual([]);
    });
  });
});
