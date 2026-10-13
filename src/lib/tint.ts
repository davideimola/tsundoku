import type { CSSProperties } from "react";

// THE SHELF'S COLOUR, and the only colour this application computes.
//
// The palette is paper and ink and one restrained hue (`src/app/globals.css`), and it is
// deliberately empty of an accent so that **the only colour on screen belongs to the
// library**. This is that colour: a Series' own tint, worn by the tiles the walls are laid
// out as.
//
// Three decisions, and each one is held by `./tint.test.ts`:
//
//   1. **It is derived, never stored.** A tint is a pure function of the Series' identity,
//      the way a Story's state is a function of its Passes: there is no column to fill in,
//      nothing to pick by hand, and nothing that can drift out of step with the row.
//   2. **It is the same on every deploy.** A shelf that repainted itself between releases is
//      a shelf the owner can never learn, so the hash is written out here rather than taken
//      from a library that may reasonably change it, and a recorded pair in the test pins
//      the answer.
//   3. **It is constrained to a range that stays legible.** Lightness and chroma are fixed
//      per ground and only the hue turns, so every colour this file can produce is inside
//      sRGB and is deep enough that the light lettering stamped on it (`LETTERING`) clears
//      the reading threshold. The range is enumerated below precisely so a test can walk
//      all of it.
//
// This is the one file in `src/` allowed to name a colour, and the palette's wall names it
// as the exception. A screen still names none: it spends `tint()` the way it spends a token.

/**
 * A Series' colour, on each of the two grounds.
 *
 * Two values rather than one because the grounds are not a filter over each other: a cloth
 * that stands off newsprint by day would glow on the blue-black of a dark room. Both are
 * **deep** — bookcloth, not a sticky note — and both carry the same light lettering
 * (`LETTERING`), which is what a title stamped on a clothbound board looks like.
 */
export type Tint = {
  /** The cloth on paper, lettered in `LETTERING`. */
  readonly paper: string;
  /** The cloth in a dark room, lettered in `LETTERING`. */
  readonly dark: string;
};

/**
 * The lightness and chroma each ground holds a tint at.
 *
 * **Retuned to read as bookcloth** (ADR-0026, second tranche). The first range was a light
 * pastel printed in ink — `oklch(0.83 0.08 h)` — and on a wall of drawn covers it read as a
 * set of mint and lilac post-its rather than as the boards of a shelf. Cloth is deep and
 * dusty: a low chroma, a lightness under the middle, and the title stamped on it in light.
 * So the hue still turns with the Series and nothing else moves: every tint is a deep cloth
 * whose lettering clears the reading threshold (`./tint.test.ts`), and in a dark room it is a
 * step deeper again so that it sits in the night rather than glowing out of it.
 */
const ON_PAPER = { l: 0.42, c: 0.07 } as const;
const IN_THE_DARK = { l: 0.39, c: 0.06 } as const;

/** How many hues the wheel is cut into. One per degree: the whole wheel, and no favourites. */
const HUES = 360;

/**
 * Every tint there is, in hue order.
 *
 * A constant rather than a formula called at the point of use, for one reason: it is the
 * *range*, and a range that can be enumerated is a range a wall can walk end to end. The
 * alternative — computing a colour per Series and testing the handful a fixture happens to
 * produce — is how a palette ships with three unreadable hues nobody drew.
 */
export const TINTS: readonly Tint[] = Array.from({ length: HUES }, (_, hue) => ({
  paper: `oklch(${ON_PAPER.l} ${ON_PAPER.c} ${hue})`,
  dark: `oklch(${IN_THE_DARK.l} ${IN_THE_DARK.c} ${hue})`,
}));

/**
 * FNV-1a, 32 bits, written out.
 *
 * The requirement is not cryptographic and not even statistical — it is that this answer
 * survives a dependency upgrade, a Node version and a rebuild in three years, because the
 * owner has by then learned that Star Comics' Dragon Ball is the green one. A hash imported
 * from anywhere is a hash somebody else may improve.
 */
function fingerprint(identity: string): number {
  let hash = 0x811c9dc5;
  for (let at = 0; at < identity.length; at += 1) {
    hash ^= identity.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * The colour this Series wears, or `null` where there is no Series to take one from.
 *
 * `null` is an answer and not a gap: a Story read digitally, borrowed or known only from a
 * history has no object and therefore no publisher's line, which is the ordinary case here
 * (ADR-0001). What draws it falls back to the palette, which is legible by construction.
 */
export function tint(identity: string | null | undefined): Tint | null {
  if (!identity) return null;

  return TINTS[fingerprint(identity) % TINTS.length];
}

/**
 * **How a tile wears a tint**, written once: the two custom properties, and the classes that
 * spend them.
 *
 * It is here rather than in the components because three things wear one now — the cover the
 * walls are laid out as (`@/components/cover`), the spine the pile is stacked from
 * (`@/components/pile`) and the standing spine a Series is drawn as
 * (`src/app/(owner)/series/spines.tsx`) — and the *wiring* is the tint's own contract rather
 * than any tile's taste: both grounds travel, because they are not a filter over each other,
 * and the sheet's own dark variant picks one. A second copy of these three lines is how an
 * untinted spine and an untinted cover come to sit on two different grounds.
 */
export const WORN =
  "bg-[var(--tint)] dark:bg-[var(--tint-dark)] text-[color:oklch(0.955_0.012_88)]";

/**
 * **What is stamped on a cloth**: the light of a title blocked onto a clothbound board, the
 * same on both grounds because the cloth under it is deep on both. Written as the value
 * `WORN` spends rather than as a token, because it exists only on a tint and a tint is this
 * file's — the wall in `./tint.test.ts` holds it against every cloth there is.
 */
export const LETTERING = "oklch(0.955 0.012 88)";

/**
 * The ground a tile falls back to where there is no Series to take a colour from, which is the
 * ordinary case for a Story carried by no object. The palette's quiet paper, legible by
 * construction (`src/app/palette.test.ts`).
 */
export const UNWORN = "bg-muted";

/** The two properties `WORN` spends, or nothing at all where there is no tint to wear. */
export function worn(tint: Tint | null): CSSProperties | undefined {
  if (!tint) return undefined;

  // Cast because custom properties are not in `CSSProperties`, and this is the one place in
  // the repo that has to say so.
  return { "--tint": tint.paper, "--tint-dark": tint.dark } as CSSProperties;
}

/**
 * **How a cover is bound**: the marks every cover tile carries, whatever is on its face.
 *
 * They are here rather than in `@/components/cover` because each of them is a colour — a
 * shadow is a translucent ink, a crease is a light line beside a dark one — and this is the
 * one file in `src/` allowed to name one. They are not tokens in the sheet because none of
 * them is a role a screen spends: they are the physical facts of a book standing on a shelf,
 * and they are the same over a jacket and over a drawn cloth.
 *
 *   - `shadow`: the soft one a book throws on the shelf behind it, and `lifted` the deeper one
 *     it throws when the pointer takes it off the shelf.
 *   - `hero`: the shadow of the one large cover a detail page opens with, which stands further
 *     off the panel it is laid on.
 *   - `crease`: where the board meets the spine — a light line and a dark one, inset from the
 *     left edge, drawn over the face so a jacket and a drawn cloth fold in the same place.
 *   - `headband`: the darker band across the head of a drawn cloth, which is what makes a
 *     coloured rectangle read as a book seen from the front.
 */
export const BINDING = {
  shadow: "shadow-[0_1px_2px_rgba(20,24,40,.12),0_6px_14px_rgba(20,24,40,.14)]",
  lifted:
    "motion-safe:group-hover/cover:shadow-[0_2px_4px_rgba(20,24,40,.14),0_12px_24px_rgba(20,24,40,.2)]",
  hero: "shadow-[0_2px_4px_rgba(20,24,40,.14),0_18px_36px_rgba(20,24,40,.26)]",
  crease: "shadow-[inset_3px_0_0_rgba(255,255,255,.14),inset_4px_0_0_rgba(0,0,0,.12)]",
  headband: "bg-[rgba(0,0,0,.24)]",
} as const;
