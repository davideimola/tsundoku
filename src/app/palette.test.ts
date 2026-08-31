import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  type Colour,
  contrast,
  GROUNDS,
  ground,
  hex,
  STYLESHEET_TEXT as STYLESHEET,
} from "@/test/palette";
import { SRC, sourceFiles } from "@/test/source-files";

// The second wall in this app, and it is a wall for the same reason the first one is
// (`src/app/gated.test.ts`): the failure it catches is silent. A screen that reaches for
// `text-red-600` because a refusal ought to look urgent still compiles, still renders and
// still reads correctly — it has simply put a colour on screen that nobody chose, and the
// redesign this belongs to (#18) has already spent the whole colour budget elsewhere.
//
// So the rule is stated here rather than in a paragraph nobody reads before adding a page:
//
//   1. **A colour is named once.** Eight primitives, declared on both grounds, and every
//      other token in the sheet is `var()` pointing at one of them. A token that carries a
//      literal of its own is a ninth colour with no name.
//   2. **The chrome carries no hue.** Every primitive but one is achromatic — chroma
//      exactly zero — which is what "paper and ink" means arithmetically. The exception is
//      `--refusal`, and it is bounded: it marks a refusal and it is never spent on chrome.
//   3. **Both grounds are legible.** The contrasts are computed here rather than eyeballed,
//      against WCAG's own thresholds, on paper and in a dark room alike.
//   4. **No screen names a colour.** Not a hex, not an `oklch()`, not a Tailwind palette
//      class. The tokens are the vocabulary and there is no second one — with **one stated
//      exception**, `src/lib/tint.ts`, which is the shelf's own colour and is held by a wall
//      of its own. See the last block of this file.
//
// It is arithmetic over a stylesheet, so it needs no DOM, no renderer and no browser: the
// two seams the configuration names are untouched by it, exactly as the gate's predicate
// and the rate limit's are. The conversion itself is `src/test/palette.ts`, shared with the
// tint's wall so that the two measure against the same declared grounds.

/**
 * The palette, as roles rather than as values. `--refusal` is the one that carries a hue;
 * the rest are paper, ink and the rules printed between them.
 */
const PRIMITIVES = [
  "--paper",
  "--paper-raised",
  "--paper-quiet",
  "--ink",
  "--ink-quiet",
  "--rule",
  "--rule-field",
  "--refusal",
] as const;

type Primitive = (typeof PRIMITIVES)[number];

/** The one primitive allowed a hue, and the chroma it may not exceed. */
const HUED: Primitive = "--refusal";
const CHROMA_CEILING = 0.1;

/**
 * Anything that would be a colour literal in a CSS *value*, whether or not this sheet uses
 * it. Safe to include the bare keywords because it is only ever matched against the right
 * hand side of a declaration, never against the prose around it.
 */
const CSS_LITERAL =
  /(?:oklch|rgba?|hsla?|lab|lch|color)\s*\(|#[0-9a-fA-F]{3,8}\b|\b(?:white|black|red|blue|green|grey|gray)\b/;

/** Every `--name: value;` in the sheet, whatever the value is. */
const ANY_DECLARATION = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gim;

const PAPERS = ["--paper", "--paper-raised", "--paper-quiet"] as const;

describe("a colour is named once", () => {
  it.each(Object.entries(GROUNDS))("declares every primitive on %s", (_, selector) => {
    const declared = ground(selector);

    expect(PRIMITIVES.filter((name) => !declared.has(name))).toEqual([]);
  });

  it("is the only thing in the sheet carrying a literal", () => {
    const named = new Set<string>(PRIMITIVES);

    const inventing = [...STYLESHEET.matchAll(ANY_DECLARATION)]
      .filter(([, name, value]) => !named.has(name) && CSS_LITERAL.test(value))
      .map(([, name, value]) => `${name}: ${value.trim()}`);

    expect(inventing).toEqual([]);
  });
});

describe("the chrome carries no accent hue", () => {
  it.each(Object.entries(GROUNDS))("is achromatic on %s", (_, selector) => {
    const declared = ground(selector);

    const hued = PRIMITIVES.filter((name) => name !== HUED).filter(
      (name) => declared.get(name)?.c !== 0
    );

    expect(hued).toEqual([]);
  });

  // The one hue in the application, and it is bounded rather than merely permitted: it is
  // ink that has been bled into, spent on a refusal and on nothing else.
  //
  // Naming it a *deviation* rather than hiding it: #19 asked for no accent hue in the
  // chrome, and this is a hue. The argument for keeping it is that a refusal is not chrome —
  // an alert and a status message sit side by side on six screens and are otherwise the
  // same grey box, and the owner has to read one of them. The ceiling is what stops the
  // argument being used twice: at this chroma it cannot decorate anything.
  it.each(Object.entries(GROUNDS))("keeps its one hue restrained on %s", (_, selector) => {
    const refusal = ground(selector).get(HUED);

    expect(refusal?.c).toBeLessThanOrEqual(CHROMA_CEILING);
    expect(refusal?.c).toBeGreaterThan(0);
  });
});

describe("both grounds are legible", () => {
  describe.each(Object.entries(GROUNDS))("on %s", (_, selector) => {
    const declared = ground(selector);
    const on = (name: Primitive, paper: string) =>
      contrast(declared.get(name) as Colour, declared.get(paper) as Colour);

    // Body text, at AAA. This is what the owner reads a Rating in at midnight.
    it.each(PAPERS)("sets ink on %s well past the reading threshold", (paper) => {
      expect(on("--ink", paper)).toBeGreaterThanOrEqual(7);
    });

    // Everything the interface says quietly — a Provenance, a count, a hint under a field.
    // Quiet is not an excuse to be unreadable.
    it.each(PAPERS)("keeps quiet ink readable on %s", (paper) => {
      expect(on("--ink-quiet", paper)).toBeGreaterThanOrEqual(4.5);
    });

    // A refusal is prose the owner has to read to know what went wrong.
    it.each(PAPERS)("keeps a refusal readable on %s", (paper) => {
      expect(on("--refusal", paper)).toBeGreaterThanOrEqual(4.5);
    });

    // Not text, but a boundary: the edge of a box the owner is meant to type in has to be
    // findable, which is WCAG's 3:1 for a user interface component.
    it("draws the edge of a field where it can be seen", () => {
      expect(on("--rule-field", "--paper")).toBeGreaterThanOrEqual(3);
    });

    // The hairline, held to the threshold a tinted spine clears against the page
    // (`src/lib/tint.test.ts`). It matters because of the tile that has **no** tint: a
    // Story standing in no line is drawn on quiet paper, which is barely off the ground it
    // sits on, and its edge is then the only thing saying an object is there.
    it("stands a hairline off the paper, which is what bounds an untinted tile", () => {
      expect(on("--rule", "--paper")).toBeGreaterThanOrEqual(1.2);
    });
  });
});

// The one surface this stylesheet cannot reach. A browser tab is outside the application's
// cascade, so `src/app/icon.svg` has to state its two greys as literals — which makes them
// the only colour in the project that is not a `var()`, and therefore the only one free to
// drift. `src/components/mark.test.ts` pins the favicon's *geometry* to the mark; this pins
// its *ink* to the palette, and between them the tab cannot become a different logo in a
// different colour without something going red.
describe("the favicon's ink", () => {
  const ICON = readFileSync(new URL("./icon.svg", import.meta.url), "utf8");

  const fills = [...ICON.matchAll(/fill:\s*(#[0-9a-fA-F]{6})/g)].map(([, value]) =>
    value.toLowerCase()
  );

  it.each(Object.entries(GROUNDS))("is --ink converted to sRGB, on %s", (_, selector) => {
    const ink = ground(selector).get("--ink") as Colour;

    expect(fills).toContain(hex(ink));
  });

  // Two, and only two: light and dark. A third would be a colour nothing above accounts for.
  it("states both grounds and nothing else", () => {
    expect(fills).toHaveLength(2);
  });
});

describe("no screen names a colour", () => {
  // Two ways a screen can put an undeclared hue on the page, and both of them compile.
  //
  // The bare keywords are deliberately *not* here: a comment is allowed to say "a white
  // flash out of a dark room", and a wall that fired on English prose would be turned off
  // within the week. What is caught is a literal and a class — the two forms that actually
  // reach the browser.
  const NAMES_A_COLOUR = [
    /(?:oklch|rgba?|hsla?|lab|lch)\s*\(/,
    /#[0-9a-fA-F]{3,8}\b/,
    /\b(?:text|bg|border|ring|fill|stroke|from|via|to|decoration|outline|shadow|accent|caret|divide)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|grey|zinc|neutral|stone)-\d/,
    /\b(?:text|bg|border|ring|fill|stroke|divide)-(?:white|black)\b/,
  ];

  /**
   * The four files a colour may appear in, each for a stated reason, and **no fifth**.
   *
   * The one that is not a test is `lib/tint.ts`: the shelf's tint is a colour the
   * application *computes* rather than declares, so it cannot be a token in the sheet — a
   * Series' hue is not knowable until there is a Series. It is allowed here because it is
   * held somewhere else, by `lib/tint.test.ts`, which proves that every colour that
   * function can produce is inside sRGB and clears the same reading threshold as ink, on
   * both grounds. A screen still names none: it spends `tint()` the way it spends a token.
   *
   * Listing them rather than pattern-matching them is the point. A path that stops existing
   * fails the first test below, so a file renamed out of the list cannot quietly take its
   * licence with it.
   */
  const MAY_NAME_A_COLOUR = [
    // Quotes the forms it forbids, which is the one place they may appear.
    "app/palette.test.ts",
    // The conversion the walls are computed with, and the parser that reads the sheet.
    "test/palette.ts",
    // The one colour the application computes, and the wall that holds it.
    "lib/tint.ts",
    "lib/tint.test.ts",
  ];

  const sources = sourceFiles(SRC);

  it("finds the source it is about to check", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it("exempts four files that exist, and no others", () => {
    const files = new Set(sources.map((read) => read.file));

    expect(MAY_NAME_A_COLOUR.filter((file) => !files.has(file))).toEqual([]);
  });

  it("names no colour anywhere else in src/", () => {
    const naming = sources
      .filter((read) => !MAY_NAME_A_COLOUR.includes(read.file))
      .filter((read) => NAMES_A_COLOUR.some((form) => form.test(read.source)))
      .map((read) => read.file);

    expect(naming).toEqual([]);
  });
});
