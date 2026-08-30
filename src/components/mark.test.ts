import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PILE, type Spine, turn, VIEWBOX } from "@/components/mark";

// The mark is drawn twice — once as inline SVG for the chrome, once as the file a browser
// puts in a tab — and only one of those two is ever looked at while working. So the pile's
// geometry is a value, and this file is what keeps the favicon from quietly becoming a
// different logo.
//
// The rest of it is the claim the mark has to earn: **it works at 20px**. That is not a
// matter of taste, it is arithmetic on the numbers below — three spines that do not merge
// into a smudge and do not fall off the edge of the box — and arithmetic is testable
// without a renderer, a DOM or an eye. It is the same rule that lets the gate's predicate
// and the rate limit be tested beside themselves: a function the application would still
// have if React were replaced.

const ICON = readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8");

/** The size the chrome sets it at, and the size a favicon is actually looked at. */
const SMALL = 20;

/** One CSS pixel per this many viewBox units, once the mark is drawn at 20px. */
const SCALE = SMALL / VIEWBOX;

const degrees = (angle: number) => (angle * Math.PI) / 180;

/**
 * What a tilted spine actually occupies, which is not what its `x`/`y` say: rotating a
 * rectangle grows its bounding box by the width it swings through. Everything below is
 * measured on this rather than on the untilted numbers, because the ends of a tilted
 * spine are exactly where two of them would touch.
 */
function occupies(spine: Spine) {
  const sin = Math.abs(Math.sin(degrees(spine.tilt)));
  const cos = Math.abs(Math.cos(degrees(spine.tilt)));

  const width = spine.width * cos + spine.height * sin;
  const height = spine.width * sin + spine.height * cos;
  const centre = { x: spine.x + spine.width / 2, y: spine.y + spine.height / 2 };

  return {
    left: centre.x - width / 2,
    right: centre.x + width / 2,
    top: centre.y - height / 2,
    bottom: centre.y + height / 2,
    height,
  };
}

/** Every `<rect>` in the favicon, as the numbers it was drawn with. */
function rects(svg: string) {
  return [...svg.matchAll(/<rect\b([^>]*)\/>/g)].map(([, attributes]) => {
    const attribute = (name: string) =>
      attributes.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "";

    return {
      x: Number(attribute("x")),
      y: Number(attribute("y")),
      width: Number(attribute("width")),
      height: Number(attribute("height")),
      transform: attribute("transform"),
    };
  });
}

describe("the pile", () => {
  // Three, because the name is a pile and two is a pair. It is also what makes the mark
  // read as a stack rather than as an equals sign at the size it is mostly seen at.
  it("is three spines", () => {
    expect(PILE).toHaveLength(3);
  });

  it("is askew, and no two spines lie the same way", () => {
    const tilts = PILE.map((spine) => spine.tilt);

    expect(tilts.every((tilt) => tilt !== 0)).toBe(true);
    expect(new Set(tilts).size).toBe(tilts.length);
  });

  it("stays inside its own box, so nothing is clipped at any size", () => {
    const outside = PILE.map(occupies).filter(
      (box) => box.left < 0 || box.top < 0 || box.right > VIEWBOX || box.bottom > VIEWBOX
    );

    expect(outside).toEqual([]);
  });
});

describe("at 20px", () => {
  // A spine thinner than this is a hairline that a tab renders as grey fuzz.
  it("draws every spine thick enough to be a spine", () => {
    const thin = PILE.map(occupies).filter((box) => box.height * SCALE < 3);

    expect(thin).toEqual([]);
  });

  // And the gaps are the mark: three bars that touch are one bar. Measured between
  // bounding boxes, which is the worst case — where the tilted ends come closest.
  it("keeps daylight between them", () => {
    const stacked = PILE.map(occupies).sort((a, b) => a.top - b.top);

    const gaps = stacked.slice(1).map((box, above) => (box.top - stacked[above].bottom) * SCALE);

    expect(gaps.every((gap) => gap >= 1.2)).toBe(true);
  });
});

describe("the favicon", () => {
  // The one that matters: two files, one pile. A logo that drifts from its own favicon is
  // a mistake nobody sees, because nobody looks at a tab and a masthead at the same time.
  it("is the same pile the chrome draws", () => {
    const drawn = rects(ICON).map((rect) => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      transform: rect.transform,
    }));

    expect(drawn).toEqual(
      PILE.map((spine) => ({
        x: spine.x,
        y: spine.y,
        width: spine.width,
        height: spine.height,
        transform: turn(spine),
      }))
    );
  });

  it("is drawn in the same box", () => {
    expect(ICON).toContain(`viewBox="0 0 ${VIEWBOX} ${VIEWBOX}"`);
  });

  // A tab is outside this application's cascade: `currentColor` resolves to whatever the
  // browser chrome happens to be, so the file has to state ink and paper itself — and
  // therefore has to state both grounds, or it is invisible in one of them.
  it("says what it is in a dark room", () => {
    expect(ICON).toContain("prefers-color-scheme: dark");
  });
});
