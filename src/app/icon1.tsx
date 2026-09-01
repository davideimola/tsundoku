import { ImageResponse } from "next/og";
import { PILE, VIEWBOX } from "@/components/mark";
import { OUTSIDE_THE_CASCADE } from "./outside-the-cascade";

// THE MARK, AS A TAB THAT WILL NOT READ A DRAWING PUTS IT — the favicon's raster twin.
//
// **`./icon.svg` is the favicon; this is the one Safari can see.** SVG favicons went
// unsupported in Safari from 3.1 all the way to 18.7 and only arrived in 26.0 (caniuse,
// `link-icon-svg`), so for every Safari before this year a `<link rel="icon"
// type="image/svg+xml">` is a tab with nothing in it — which is exactly what the owner
// reported, from the browser this application is used in. Chrome, Edge and Firefox keep taking
// the drawing: two `<link>`s are offered and each browser picks the type it understands.
//
// It is generated from `PILE` for the reason `./apple-icon.tsx` is, and the argument is that
// file's: an exported picture would be a *fifth* copy of a shape that already has four, and
// `mark.test.ts` can only pin the ones that are text. This imports the geometry, so there is
// nothing left to drift.
//
// **On paper, not transparent**, and here that costs something worth naming. `icon.svg` states
// both grounds and no background, so it sits on the tab's own ground either way; a PNG has no
// media query, so this is one ground and it has to be the legible one. Paper with ink on it
// reads on a light tab and on a dark one; transparent-with-ink would vanish into dark chrome,
// which is the failure this file exists to fix rather than a variation on it.

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * How much of the tile the pile is drawn across — fuller than the app icon's 0.72.
 *
 * An app icon is looked at; a favicon is *recognised*, at sixteen CSS pixels, next to eleven
 * other tabs. Nothing crops this one, so the margin the home screen needed would only be
 * pixels the mark does not get.
 */
const ACROSS = 0.88;

export default function Icon() {
  const scale = (size.width * ACROSS) / VIEWBOX;
  const margin = (size.width * (1 - ACROSS)) / 2;

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        position: "relative",
        width: "100%",
        height: "100%",
        background: OUTSIDE_THE_CASCADE.paper.light,
      }}
    >
      {PILE.map((spine) => (
        <div
          key={spine.y}
          style={{
            position: "absolute",
            left: margin + spine.x * scale,
            top: margin + spine.y * scale,
            width: spine.width * scale,
            height: spine.height * scale,
            // No rounding at this size: 0.6 of a 24-unit viewbox is under a pixel here, and a
            // sub-pixel radius is a blurred edge rather than a rounded one.
            background: OUTSIDE_THE_CASCADE.ink.light,
            transform: `rotate(${spine.tilt}deg)`,
          }}
        />
      ))}
    </div>,
    size
  );
}
