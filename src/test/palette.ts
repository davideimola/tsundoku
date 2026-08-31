import { readFileSync } from "node:fs";

// THE PALETTE AS NUMBERS, and WCAG's arithmetic over it.
//
// It lives here rather than inside `src/app/palette.test.ts` because two walls need it and
// they need it to agree: the palette's own (are the eight declared colours legible on both
// grounds?) and the shelf tint's (is every colour that function can produce legible on the
// same two grounds?). Two copies of this arithmetic would be two answers, and the second
// one would be the one nobody re-derived.
//
// It reads `globals.css` rather than restating it, so a palette edited in the sheet is a
// palette both walls measure. Nothing here asserts: it converts, and the walls judge.

const STYLESHEET = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

export type Colour = { readonly l: number; readonly c: number; readonly h: number };

/** `--name: oklch(L C H);` — the only literal form the sheet is allowed to use. */
const DECLARED = /^\s*(--[a-z0-9-]+)\s*:\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)\s*;/gim;

/** The two grounds, by the selector each one's palette is declared under. */
export const GROUNDS = { paper: ":root", "a dark room": ".dark" } as const;

/**
 * The declarations inside one selector's block, by brace matching rather than by a regex
 * over the whole file: `@theme` and `@layer` nest, and a pattern that stopped at the first
 * `}` would read half a ground and call it the whole one.
 */
function block(selector: string): string {
  const opened = STYLESHEET.indexOf(`${selector} {`);
  if (opened === -1) throw new Error(`${selector} is not declared in globals.css`);

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
export function ground(selector: string): Map<string, Colour> {
  const found = new Map<string, Colour>();
  for (const [, name, l, c, h] of block(selector).matchAll(DECLARED)) {
    found.set(name, { l: Number(l), c: Number(c), h: Number(h) });
  }
  return found;
}

/** One token's colour on one ground, or a failure naming what is missing. */
export function token(selector: string, name: string): Colour {
  const colour = ground(selector).get(name);
  if (!colour) throw new Error(`${name} is not declared under ${selector}`);
  return colour;
}

/** The whole stylesheet, for the walls that grep it rather than convert it. */
export const STYLESHEET_TEXT = STYLESHEET;

// ── The arithmetic ────────────────────────────────────────────────────────────
// OKLCH to sRGB (the Oklab matrices, as the CSS Color 4 specification gives them), and
// then WCAG's relative luminance. Written out because the point of the walls above it is
// that the contrasts are computed from the values in the sheet rather than trusted.

export function linearSrgb({ l, c, h }: Colour): [number, number, number] {
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

/**
 * Whether sRGB can actually show this colour.
 *
 * It matters for a colour that is *computed* rather than declared: a browser clamps one it
 * cannot display, and the colour on screen is then not the colour the contrast was measured
 * on. The tolerance is floating point's, not a licence to be slightly outside.
 */
export function inGamut(colour: Colour): boolean {
  return linearSrgb(colour).every((channel) => channel >= -0.0001 && channel <= 1.0001);
}

export function luminance(colour: Colour): number {
  const [r, g, b] = linearSrgb(colour).map((channel) => Math.min(1, Math.max(0, channel)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The same colour as a browser would write it: `#rrggbb`, gamma-encoded. */
export function hex(colour: Colour): string {
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
export function contrast(a: Colour, b: Colour): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}
