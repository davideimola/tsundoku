/**
 * THE MARK: a pile of three spines, slightly askew.
 *
 * The application's name made into a picture. *Tsundoku* is the pile of unread books that
 * keeps growing, so the logo is not a metaphor reaching for something — it is the thing,
 * drawn. Three of them, which is the smallest number that still reads as a stack rather
 * than as a pair — the dashboard's hero will later draw the same pile at the height of the
 * library's actual unread count, and this is that shape at its smallest.
 *
 * Inline SVG and no icon library. One mark does not earn a dependency, a build step and a
 * tree-shaking argument — and the same numbers are what `src/app/icon.svg` draws, so the
 * favicon and the chrome cannot come apart. `src/components/mark.test.ts` is what says so,
 * along with the claim this shape has to earn: that it survives being 20px tall.
 *
 * It carries no colour. `currentColor` means the mark is set in whatever ink surrounds it,
 * on either ground, which is what keeps it out of the palette entirely.
 */

/** The square the pile is drawn in. Everything below is in its units. */
export const VIEWBOX = 24;

/** How much the corners are cut. Barely: a spine is a printed edge, not a pill. */
const CUT = 0.6;

export type Spine = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Degrees, turned about the spine's own centre. Never zero: a pile is not a stack. */
  readonly tilt: number;
};

/**
 * The three spines, each a different width and each lying at its own angle — the widest in
 * the middle, which is what a real stack does and what a drawn one never does. The tilts
 * are small on purpose: books put down without care, not a pile about to fall over. They
 * are all different because three spines at one angle is a pattern rather than a pile.
 */
export const PILE: readonly Spine[] = [
  { x: 4.4, y: 3.9, width: 14.6, height: 3.8, tilt: -4.5 },
  { x: 2.5, y: 10.3, width: 19.0, height: 3.8, tilt: 2 },
  { x: 3.9, y: 16.7, width: 16.2, height: 3.8, tilt: -1.5 },
];

/**
 * How a spine lies, as the attribute that says it: a turn about the spine's own centre, so
 * that tilting one moves nothing else in the pile.
 *
 * It is a function rather than three literals because the favicon has to write the same
 * string, character for character, and `4.4 + 14.6 / 2` is not `11.7` in binary floating
 * point. Rounding here is what makes one geometry produce one attribute in both files.
 */
export function turn(spine: Spine): string {
  const round = (measure: number) => Math.round(measure * 1000) / 1000;

  return `rotate(${spine.tilt} ${round(spine.x + spine.width / 2)} ${round(spine.y + spine.height / 2)})`;
}

/**
 * The mark, at whatever size the surrounding text is unless a size is given. `aria-hidden`
 * because it is never alone: it stands beside the word *tsundoku*, and a screen reader
 * announcing the name twice is worse than not announcing the picture.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      fill="currentColor"
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
          transform={turn(spine)}
        />
      ))}
    </svg>
  );
}
