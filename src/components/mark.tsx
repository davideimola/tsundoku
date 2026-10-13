import { cn } from "@/lib/utils";

/**
 * THE MARK: a pile of three spines, bound in cloth, gilt and ink.
 *
 * The application's name made into a picture. *Tsundoku* is the pile of unread books that
 * keeps growing, so the logo is not a metaphor reaching for something — it is the thing,
 * drawn. Three of them, which is the smallest number that still reads as a stack rather
 * than as a pair.
 *
 * **Each spine is bound in one of the palette's three inks** (ADR-0026): bookcloth indigo on
 * top, the gilded edge in the middle, printer's ink at the bottom. The mark used to carry no
 * colour at all, set in whatever ink surrounded it; now that the chrome has an action colour
 * and a second accent, the mark is where both are first seen together. The spines lie flat
 * and are staggered rather than tilted — a stack put down on a shelf, its edges not quite
 * squared — because three different widths offset from one another read as books at twenty
 * pixels, where a tilt of two degrees reads as a rendering fault.
 *
 * Inline SVG and no icon library. One mark does not earn a dependency, a build step and a
 * tree-shaking argument — and the same numbers are what `src/app/icon.svg` draws, so the
 * favicon and the chrome cannot come apart. `src/components/mark.test.ts` is what says so,
 * along with the claim this shape has to earn: that it survives being 20px tall.
 */

/** The square the pile is drawn in. Everything below is in its units. */
export const VIEWBOX = 32;

/** How much the corners are cut. A little: a spine is a bound edge, not a pill. */
export const CUT = 1.2;

/**
 * What a spine is bound in: one of the palette's three inks, by the name
 * `src/app/outside-the-cascade.ts` gives it for the surfaces that cannot read a token.
 */
export type Binding = "cloth" | "gilt" | "ink";

export type Spine = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly binding: Binding;
};

/**
 * The three spines, each a different width and each starting at a different place — the
 * widest in the middle, which is what a real stack does and what a drawn one never does.
 */
export const PILE: readonly Spine[] = [
  { x: 5, y: 6, width: 20, height: 5.5, binding: "cloth" },
  { x: 3, y: 13.5, width: 24, height: 5.5, binding: "gilt" },
  { x: 6, y: 21, width: 22, height: 5.5, binding: "ink" },
];

/**
 * Which token each binding is printed in inside the document. Cloth is its *fill* spelling,
 * because a spine is a surface: in a dark room the text spelling lightens and the mark should
 * not.
 */
const PRINTED_IN: Record<Binding, string> = {
  cloth: "fill-cloth-fill",
  gilt: "fill-gilt",
  ink: "fill-foreground",
};

/**
 * The mark, at whatever size it is given. `aria-hidden` because it is never alone: it stands
 * beside the word *tsundoku*, and a screen reader announcing the name twice is worse than
 * not announcing the picture.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PILE.map((spine) => (
        <rect
          key={spine.y}
          x={spine.x}
          y={spine.y}
          width={spine.width}
          height={spine.height}
          rx={CUT}
          className={PRINTED_IN[spine.binding]}
        />
      ))}
    </svg>
  );
}

/**
 * The mark and the name together, which is how the application signs itself: the pile, and
 * *tsundoku* in the serif — lowercase and set tight, a word rather than a logotype spelled out
 * in capitals.
 */
/** The three sizes the name is signed at: the phone's strip, the sidebar, the sign-in screen. */
const SIGNED_AT = {
  strip: { gap: "gap-2", mark: "size-6", word: "text-xl" },
  sidebar: { gap: "gap-2.5", mark: "size-7", word: "text-2xl" },
  door: { gap: "gap-3", mark: "size-10", word: "text-[2.5rem]" },
} as const;

export function Wordmark({
  at = "sidebar",
  className,
}: {
  at?: keyof typeof SIGNED_AT;
  className?: string;
}) {
  const size = SIGNED_AT[at];

  return (
    <span className={cn("flex items-center", size.gap, className)}>
      <Mark className={cn("shrink-0", size.mark)} />
      <span
        className={cn(
          "pb-0.5 font-heading font-semibold leading-none tracking-[-0.01em] text-foreground",
          size.word
        )}
      >
        tsundoku
      </span>
    </span>
  );
}
