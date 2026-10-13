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

import { OUTSIDE_THE_CASCADE } from "./outside-the-cascade";

// The second wall in this app, and it is a wall for the same reason the first one is
// (`src/app/gated.test.ts`): the failure it catches is silent. A screen that reaches for
// `text-red-600` because a refusal ought to look urgent still compiles, still renders and
// still reads correctly — it has simply put a colour on screen that nobody chose.
//
// The rule it holds changed with ADR-0026, which retired *the chrome carries no accent hue*
// (#18): the chrome now has an action colour and a second accent, so this wall no longer
// proves that no colour exists — it proves that the ones that do are **named, bounded and
// legible**. Stated here rather than in a paragraph nobody reads before adding a page:
//
//   1. **A colour is named once.** A fixed set of primitives, declared on both grounds, and
//      every other token in the sheet is `var()` pointing at one of them. A token that
//      carries a literal of its own is a colour with no name.
//   2. **Each colour has one job, and the neutrals stay neutral.** Paper, ink and the rules
//      carry a temperature and not a colour — a stated chroma ceiling. Cloth is the action
//      colour and is held to be one: indigo, and saturated enough to read as a colour. Gilt
//      is the second accent. Refusal is red, and is held *apart from cloth*, because an
//      action and a refusal are the two things on a screen the owner most needs to tell apart.
//   3. **Both grounds are legible.** The contrasts are computed here rather than eyeballed,
//      against WCAG's own thresholds, on paper and in a dark room alike — including cloth as
//      text, paper-coloured words on a cloth button, and gilt as a mark.
//   4. **No screen names a colour.** Not a hex, not an `oklch()`, not a Tailwind palette
//      class. The tokens are the vocabulary and there is no second one — with **one stated
//      exception**, `src/lib/tint.ts`, which is the library's own colour and is held by a wall
//      of its own. See the last block of this file.
//
// It is arithmetic over a stylesheet, so it needs no DOM, no renderer and no browser: the
// two seams the configuration names are untouched by it, exactly as the gate's predicate
// and the rate limit's are. The conversion itself is `src/test/palette.ts`, shared with the
// tint's wall so that the two measure against the same declared grounds.

/** The palette, as roles rather than as values. */
const PRIMITIVES = [
  "--paper",
  "--paper-raised",
  "--paper-quiet",
  "--ink",
  "--ink-quiet",
  "--rule",
  "--rule-field",
  "--cloth",
  "--cloth-fill",
  "--on-cloth",
  "--cloth-soft",
  "--gilt",
  "--refusal",
] as const;

type Primitive = (typeof PRIMITIVES)[number];

/**
 * The neutrals: paper, ink and the rules printed between them. They may lean — newsprint is a
 * little warm, printer's ink a little blue — and they may not become a colour.
 */
const NEUTRALS = [
  "--paper",
  "--paper-raised",
  "--paper-quiet",
  "--ink",
  "--ink-quiet",
  "--rule",
  "--rule-field",
  "--on-cloth",
] as const;
const NEUTRAL_CEILING = 0.03;

/** What it takes for a hue to read as a colour rather than as a tinted grey. */
const A_COLOUR = 0.07;

/** Indigo, as a range of hue angles: blue leaning towards violet, not sky and not purple. */
const INDIGO = { from: 255, to: 290 } as const;

/** How far apart, in degrees of hue, an action and a refusal have to stand. */
const APART = 90;

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

/** The shortest way round the hue circle between two angles. */
const hueDistance = (a: number, b: number) => {
  const apart = Math.abs(a - b) % 360;
  return apart > 180 ? 360 - apart : apart;
};

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

  // The action colour is what a button and a ring are drawn in, so the shadcn names those
  // components read have to point at it rather than at ink, which is what they did under #18.
  it("spends cloth on what shadcn calls primary and on the focus ring", () => {
    const aliases = new Map(
      [...STYLESHEET.matchAll(ANY_DECLARATION)].map(([, name, value]) => [name, value.trim()])
    );

    expect(aliases.get("--primary")).toBe("var(--cloth-fill)");
    expect(aliases.get("--primary-foreground")).toBe("var(--on-cloth)");
    expect(aliases.get("--ring")).toBe("var(--cloth)");
    expect(aliases.get("--destructive")).toBe("var(--refusal)");
  });
});

describe("each colour has one job", () => {
  describe.each(Object.entries(GROUNDS))("on %s", (_, selector) => {
    const declared = ground(selector);
    const colour = (name: Primitive) => declared.get(name) as Colour;

    // A temperature and not a colour: the ground is newsprint and the ink is printer's ink,
    // and either one crossing this line would be a second accent nobody decided on.
    it("keeps paper, ink and the rules neutral", () => {
      const coloured = NEUTRALS.filter((name) => colour(name).c > NEUTRAL_CEILING);

      expect(coloured).toEqual([]);
    });

    // The action colour exists, and it is the indigo ADR-0026 chose — both as text and as a
    // surface. Holding the hue is what stops it drifting into a second, different blue.
    it.each(["--cloth", "--cloth-fill"] as const)("draws %s in indigo, as a colour", (name) => {
      expect(colour(name).c).toBeGreaterThanOrEqual(A_COLOUR);
      expect(colour(name).h).toBeGreaterThanOrEqual(INDIGO.from);
      expect(colour(name).h).toBeLessThanOrEqual(INDIGO.to);
    });

    it("has a second accent, and it is a colour", () => {
      expect(colour("--gilt").c).toBeGreaterThanOrEqual(A_COLOUR);
    });

    // A refusal must never be read as an action. The two are the colours a screen puts side
    // by side most often — a refused press beside the button that was pressed.
    it("keeps a refusal apart from the action colour", () => {
      expect(colour("--refusal").c).toBeGreaterThan(0);
      expect(hueDistance(colour("--refusal").h, colour("--cloth").h)).toBeGreaterThanOrEqual(APART);
      expect(hueDistance(colour("--refusal").h, colour("--cloth-fill").h)).toBeGreaterThanOrEqual(
        APART
      );
    });
  });
});

describe("both grounds are legible", () => {
  describe.each(Object.entries(GROUNDS))("on %s", (_, selector) => {
    const declared = ground(selector);
    const on = (name: Primitive, paper: Primitive) =>
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

    // Cloth as text is a link or a text button: it is read, so it is held to reading.
    it.each(PAPERS)("keeps cloth readable as text on %s", (paper) => {
      expect(on("--cloth", paper)).toBeGreaterThanOrEqual(4.5);
    });

    // The waiting block is cloth-soft with ink and a cloth action on it.
    it("keeps ink and cloth readable on the soft cloth a block sits on", () => {
      expect(on("--ink", "--cloth-soft")).toBeGreaterThanOrEqual(7);
      expect(on("--cloth", "--cloth-soft")).toBeGreaterThanOrEqual(4.5);
    });

    // The words on a filled button.
    it("prints the words on a cloth button where they can be read", () => {
      expect(on("--on-cloth", "--cloth-fill")).toBeGreaterThanOrEqual(4.5);
    });

    // Gilt is a mark rather than text — a progress bar, a sign of being finished — so it is
    // held to WCAG's 3:1 for a graphic, on every paper it can stand on.
    it.each(PAPERS)("draws gilt where it can be seen on %s", (paper) => {
      expect(on("--gilt", paper)).toBeGreaterThanOrEqual(3);
    });

    // Not text, but a boundary: the edge of a box the owner is meant to type in has to be
    // findable, which is WCAG's 3:1 for a user interface component.
    it("draws the edge of a field where it can be seen", () => {
      expect(on("--rule-field", "--paper")).toBeGreaterThanOrEqual(3);
    });

    // The hairline, held to the threshold a tinted tile clears against the page
    // (`src/lib/tint.test.ts`). It matters because of the tile that has **no** tint: a
    // Story standing in no line is drawn on quiet paper, which is barely off the ground it
    // sits on, and its edge is then the only thing saying an object is there.
    it("stands a hairline off the paper, which is what bounds an untinted tile", () => {
      expect(on("--rule", "--paper")).toBeGreaterThanOrEqual(1.2);
    });
  });
});

// The surfaces this stylesheet cannot reach, and the two files that therefore state their
// colours as literals: `src/app/icon.svg`, which a browser tab draws in its own chrome, and
// `src/app/outside-the-cascade.ts`, which an operating system reads for a home-screen tile, a
// splash screen and a status bar. None of them can resolve a `var()`, so these are the only
// colours in the project that are not one — and therefore the only ones free to drift.
//
// `src/components/mark.test.ts` pins the favicon's *geometry* to the mark and the home-screen
// icon imports it outright; the two blocks below pin the *colours* of both to the palette.
// Between them the tab and the phone cannot become a different logo in a different colour
// without something going red.
describe("the favicon's colours", () => {
  const ICON = readFileSync(new URL("./icon.svg", import.meta.url), "utf8");

  /** The light rules, then the ones inside the dark media query. */
  const [light, dark] = ICON.split("@media");
  const fills = (css: string) =>
    [...css.matchAll(/fill:\s*(#[0-9a-fA-F]{6})/g)].map(([, value]) => value.toLowerCase());

  // The mark is three bindings — cloth, gilt and ink — so a ground states exactly those
  // three, converted from the primitives it is drawn with in the chrome.
  it.each([
    ["paper", light],
    ["a dark room", dark],
  ] as const)("is cloth, gilt and ink converted to sRGB, on %s", (name, css) => {
    const declared = ground(GROUNDS[name]);
    const as = (token: string) => hex(declared.get(token) as Colour);

    expect(fills(css)).toEqual([as("--cloth-fill"), as("--gilt"), as("--ink")]);
  });
});

// The other side of that: what a phone is handed. It is a home-screen tile, a splash screen
// and a status bar, and each is painted by an operating system out of a value it was given
// once — so a drift here is a logo that stops matching the application it opens, discovered
// by nobody, because nothing on screen changes.
describe("the colours an operating system is handed", () => {
  it.each(Object.entries(GROUNDS))("are the palette's own primitives, on %s", (name, selector) => {
    const declared = ground(selector);
    const said = name === "paper" ? "light" : "dark";
    const as = (token: string) => hex(declared.get(token) as Colour);

    expect(OUTSIDE_THE_CASCADE.paper[said]).toBe(as("--paper"));
    expect(OUTSIDE_THE_CASCADE.ink[said]).toBe(as("--ink"));
    expect(OUTSIDE_THE_CASCADE.cloth[said]).toBe(as("--cloth-fill"));
    expect(OUTSIDE_THE_CASCADE.gilt[said]).toBe(as("--gilt"));
  });

  // Both grounds and nothing else, for the reason the favicon states both: anything more
  // would be a colour the palette does not account for, arriving on the one surface nobody
  // reviews. Four roles — the ground, and the three bindings the mark is drawn in.
  it("state both grounds and nothing else", () => {
    expect(Object.keys(OUTSIDE_THE_CASCADE)).toEqual(["paper", "ink", "cloth", "gilt"]);
    for (const role of Object.values(OUTSIDE_THE_CASCADE)) {
      expect(Object.keys(role)).toEqual(["light", "dark"]);
    }
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
   * The five files a colour may appear in, each for a stated reason, and **no sixth**.
   *
   * The one that is not a test is `lib/tint.ts`: the shelf's tint is a colour the
   * application *computes* rather than declares, so it cannot be a token in the sheet — a
   * Series' hue is not knowable until there is a Series. It is allowed here because it is
   * held somewhere else, by `lib/tint.test.ts`, which proves that every colour that
   * function can produce is inside sRGB and clears the same reading threshold as ink, on
   * both grounds. A screen still names none: it spends `tint()` the way it spends a token.
   *
   * The other is `app/outside-the-cascade.ts`, and it earns its place the same way: a tab, a
   * home screen and a status bar are outside this document, so they cannot be handed a
   * `var()` — and the block above reads the stylesheet and asserts those literals *are*
   * the primitives, on both grounds. Naming them once in one module is what makes that one
   * assertion enough to cover the manifest, the app icon and the `<meta>` together.
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
    // The colours an operating system is handed, held by the block above.
    "app/outside-the-cascade.ts",
  ];

  const sources = sourceFiles(SRC);

  it("finds the source it is about to check", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it("exempts five files that exist, and no others", () => {
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
