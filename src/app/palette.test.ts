import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
//      class. The tokens are the vocabulary and there is no second one.
//
// It is arithmetic over a stylesheet, so it needs no DOM, no renderer and no browser: the
// two seams the configuration names are untouched by it, exactly as the gate's predicate
// and the rate limit's are.

const STYLESHEET = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

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

type Colour = { readonly l: number; readonly c: number; readonly h: number };

/**
 * Anything that would be a colour literal in a CSS *value*, whether or not this sheet uses
 * it. Safe to include the bare keywords because it is only ever matched against the right
 * hand side of a declaration, never against the prose around it.
 */
const CSS_LITERAL =
  /(?:oklch|rgba?|hsla?|lab|lch|color)\s*\(|#[0-9a-fA-F]{3,8}\b|\b(?:white|black|red|blue|green|grey|gray)\b/;

/** `--name: oklch(L C H);` — the only literal form this sheet is allowed to use. */
const DECLARED = /^\s*(--[a-z0-9-]+)\s*:\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)\s*;/gim;

/** Every `--name: value;` in the sheet, whatever the value is. */
const ANY_DECLARATION = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gim;

/**
 * The declarations inside one selector's block, by brace matching rather than by a regex
 * over the whole file: `@theme` and `@layer` nest, and a pattern that stopped at the first
 * `}` would read half a ground and call it the whole one.
 */
function block(selector: string): string {
  const opened = STYLESHEET.indexOf(`${selector} {`);
  expect(opened, `${selector} is declared`).toBeGreaterThan(-1);

  let depth = 0;
  for (let at = STYLESHEET.indexOf("{", opened); at < STYLESHEET.length; at += 1) {
    if (STYLESHEET[at] === "{") depth += 1;
    if (STYLESHEET[at] === "}") {
      depth -= 1;
      if (depth === 0) return STYLESHEET.slice(opened, at);
    }
  }
  throw new Error(`${selector} is never closed`);
}

/** The palette one ground declares, as colours rather than as text. */
function ground(selector: string): Map<string, Colour> {
  const found = new Map<string, Colour>();
  for (const [, name, l, c, h] of block(selector).matchAll(DECLARED)) {
    found.set(name, { l: Number(l), c: Number(c), h: Number(h) });
  }
  return found;
}

// ── The arithmetic ────────────────────────────────────────────────────────────
// OKLCH to sRGB (the Oklab matrices, as the CSS Color 4 specification gives them), and
// then WCAG's relative luminance. Written out because the point of this file is that the
// contrasts are computed from the values in the sheet rather than trusted.

function linearSrgb({ l, c, h }: Colour): [number, number, number] {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
}

function luminance(colour: Colour): number {
  const [r, g, b] = linearSrgb(colour).map((channel) => Math.min(1, Math.max(0, channel)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The same colour as a browser would write it: `#rrggbb`, gamma-encoded. */
function hex(colour: Colour): string {
  return `#${linearSrgb(colour)
    .map((channel) => {
      const clamped = Math.min(1, Math.max(0, channel));
      const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
      return Math.round(encoded * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

/** WCAG's contrast ratio, from 1 (the same colour twice) to 21 (black on white). */
function contrast(a: Colour, b: Colour): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

const GROUNDS = { paper: ":root", "a dark room": ".dark" } as const;
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

  const sources = sourceFiles(SRC);

  it("finds the source it is about to check", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it("names no colour anywhere in src/", () => {
    const naming = sources
      // This file quotes the forms it forbids, which is the one place they may appear.
      .filter((read) => read.file !== "app/palette.test.ts")
      .filter((read) => NAMES_A_COLOUR.some((form) => form.test(read.source)))
      .map((read) => read.file);

    expect(naming).toEqual([]);
  });
});
