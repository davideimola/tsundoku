import { ImageResponse } from "next/og";
import { PILE, VIEWBOX } from "@/components/mark";
import { OUTSIDE_THE_CASCADE } from "./outside-the-cascade";

// THE MARK, AS A HOME SCREEN PUTS IT — the icon the owner taps on a phone.
//
// It is a **PNG generated from the same geometry the chrome draws**, and both halves of that
// are decisions:
//
//   - a PNG because iOS will not take an SVG for a touch icon, so the one drawn file this
//     project has cannot be the one it serves here;
//   - from `PILE` rather than from a picture somebody exported, because an exported picture
//     is a fourth copy of a shape that already has three (`src/components/mark.tsx`,
//     `src/app/icon.svg`, and the dashboard's hero). `mark.test.ts` pins the favicon to the
//     component; this needs no test at all, because it *imports* the geometry and there is
//     nothing left to drift.
//
// Drawn with three boxes rather than an `<svg>`: this renders through Satori, whose SVG
// support is partial and whose box model is not. A rotated, rounded `<div>` is exactly a
// spine, and `PILE`'s tilt is a turn about the spine's own centre — which is what a CSS
// `rotate` does by default, so the numbers transfer without a transform origin to keep in
// step.
//
// **On paper, not transparent.** A tab composites the favicon onto its own ground, which is
// why `icon.svg` states both grounds and no background; an operating system does not — it
// puts an app icon on a tile, and a transparent PNG becomes ink on whatever iOS feels like.
// So this one is the light ground, always, and says so in `./outside-the-cascade`.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * How much of the tile the pile is drawn across.
 *
 * Generous margin on purpose, and it does two jobs. It is what an app icon wants anyway —
 * a mark pushed to the edges reads as a screenshot rather than as a logo — and it is what
 * lets the manifest declare this icon `maskable`: Android crops an adaptive icon to a
 * circle 80% across, and the widest spine here lands at 57% of the tile.
 */
const ACROSS = 0.72;

export default function AppleIcon() {
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
            borderRadius: 0.6 * scale,
            background: OUTSIDE_THE_CASCADE.ink.light,
            transform: `rotate(${spine.tilt}deg)`,
          }}
        />
      ))}
    </div>,
    size
  );
}
