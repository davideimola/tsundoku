import { CUT, VIEWBOX } from "./mark";

/**
 * THE DESTINATIONS, DRAWN.
 *
 * One glyph per line in the map (`src/app/(owner)/navigation.ts`), and they exist because
 * of the place they are read: a fifth of a phone, at eleven pixels, held one-handed. A word
 * that size is *read* — the eye spells it out, and five of them across a bar is five acts of
 * reading before the thumb knows where to go. A glyph at the same size is *recognised*, in
 * one glance, after the first time. The word stays underneath it, because recognition has to
 * be learned once and a bar of glyphs alone would make the owner guess on day one.
 *
 * **Still no icon library**, and that has not softened: this is fourteen rectangles, the
 * favicon's own geometry, and a dependency would bring three hundred glyphs to spend nine.
 * What is bought here is a *vocabulary*, not a set — every mark below is **a paper object
 * seen edge-on**, drawn in the technique `./mark` established: filled rects with a barely-cut
 * corner, in the same 24-unit square, set in whatever ink surrounds them.
 *
 * That is what makes them this application's. A generic set would hand the Collection a
 * folder and the Series a stack of squares; here the Collection is **spines standing on a
 * shelf**, the Series is **two volumes held by the band across their heads**, and Wishes is
 * **the empty slot between two full ones** — which is what a wish is, in a library that
 * catalogues objects. The glyph is the domain, at sixteen pixels.
 *
 * Two marks in the chrome are deliberately not in here: the door's plus
 * (`src/app/(owner)/door.tsx`) and the finder's magnifier (`src/app/(owner)/finder.tsx`).
 * They belong to the two screens that are *not* destinations, and keeping them beside their
 * own controls is what stops this file from quietly becoming the icon library it argues
 * against.
 */

function Glyph({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Home: a book lying open. The evening's screen, and the only glyph in use rather than at rest. */
function OpenBook(props: { className?: string }) {
  return (
    <Glyph {...props}>
      <rect x={2.6} y={11.4} width={9.6} height={2.8} rx={CUT} transform="rotate(-19 7.4 12.8)" />
      <rect x={11.8} y={11.4} width={9.6} height={2.8} rx={CUT} transform="rotate(19 16.6 12.8)" />
      <rect x={3.4} y={17.6} width={17.2} height={2.2} rx={CUT} />
    </Glyph>
  );
}

/**
 * The Pile: three spines put down without care — the application's own mark, at one width.
 *
 * It is the mark and not a cousin of it, because the pile is the one thing in the library
 * that already has a picture, and drawing a second one would be inventing a synonym. The
 * three widths differ in `./mark` and are equal here: that is the whole distance between a
 * logo, which is looked at, and a tab, which is glanced at.
 */
function Pile(props: { className?: string }) {
  return (
    <Glyph {...props}>
      <rect x={4.6} y={4.6} width={14.8} height={3.6} rx={CUT} transform="rotate(-4.5 12 6.4)" />
      <rect x={4.6} y={10.2} width={14.8} height={3.6} rx={CUT} transform="rotate(2 12 12)" />
      <rect x={4.6} y={15.8} width={14.8} height={3.6} rx={CUT} transform="rotate(-1.5 12 17.6)" />
    </Glyph>
  );
}

/** Collection: spines standing on a shelf. What is in the house, and the shelf is the house. */
function Shelf(props: { className?: string }) {
  return (
    <Glyph {...props}>
      <rect x={4.4} y={6.4} width={2.8} height={11.2} rx={CUT} />
      <rect x={8.6} y={5.2} width={2.8} height={12.4} rx={CUT} />
      <rect x={12.8} y={6.4} width={2.8} height={11.2} rx={CUT} />
      <rect x={16.4} y={7.2} width={2.8} height={10.4} rx={CUT} transform="rotate(11 17.8 12.4)" />
      <rect x={3.2} y={18.6} width={17.6} height={2.2} rx={CUT} />
    </Glyph>
  );
}

/**
 * Stories: one spine, with the band its title is set on.
 *
 * The glossary says a Story **is** the spine — the thing a Volume attaches to and a Rating
 * judges — so the glyph is that sentence and not an illustration of it. One, because a Story
 * is what a score is given to; the band, because a spine with nothing written on it is a
 * plank.
 */
function Spine(props: { className?: string }) {
  return (
    <Glyph {...props}>
      <rect x={9.4} y={3.4} width={5.2} height={6.6} rx={CUT} />
      <rect x={9.4} y={12.4} width={5.2} height={8.2} rx={CUT} />
    </Glyph>
  );
}

/** Paths: blocks in a run that climbs. An order somebody meant, rather than a list. */
function Climb(props: { className?: string }) {
  return (
    <Glyph {...props}>
      <rect x={3.2} y={14.6} width={5} height={5} rx={CUT} />
      <rect x={9.5} y={9.5} width={5} height={5} rx={CUT} />
      <rect x={15.8} y={4.4} width={5} height={5} rx={CUT} />
    </Glyph>
  );
}

/** Series: two volumes held together by the band over their heads — the obi a run is sold in. */
function Band(props: { className?: string }) {
  return (
    <Glyph {...props}>
      <rect x={4.2} y={3.6} width={15.6} height={2.6} rx={CUT} />
      <rect x={6.2} y={8} width={3.6} height={12.4} rx={CUT} />
      <rect x={14.2} y={8} width={3.6} height={12.4} rx={CUT} />
    </Glyph>
  );
}

/**
 * Wishes: the gap in the run.
 *
 * The one glyph here drawn in outline, and the outline is the meaning: a wish is the volume
 * that is **not** on the shelf, standing between the two that are. Dashed rather than
 * hairlined so that it reads as absent at sixteen pixels instead of as a thinner spine.
 */
function Gap(props: { className?: string }) {
  return (
    <Glyph {...props}>
      <rect x={3.6} y={5.4} width={3.6} height={13.2} rx={CUT} />
      <rect
        x={10.2}
        y={5.4}
        width={3.6}
        height={13.2}
        rx={CUT}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeDasharray="2.4 2"
      />
      <rect x={16.8} y={5.4} width={3.6} height={13.2} rx={CUT} />
    </Glyph>
  );
}

/** Inbox: a tray, with what an assistant left in it. */
function Tray(props: { className?: string }) {
  return (
    <Glyph {...props}>
      <rect x={7.2} y={4.2} width={9.6} height={2.6} rx={CUT} />
      <rect x={7.2} y={8.6} width={9.6} height={2.6} rx={CUT} />
      <rect x={2.8} y={12.4} width={2.4} height={5.6} rx={CUT} />
      <rect x={18.8} y={12.4} width={2.4} height={5.6} rx={CUT} />
      <rect x={2.8} y={17.4} width={18.4} height={2.4} rx={CUT} />
    </Glyph>
  );
}

/** Credits: the person nobody has named yet. The one glyph that is not made of paper. */
function Person(props: { className?: string }) {
  return (
    <Glyph {...props}>
      <circle cx={12} cy={7.8} r={3.6} />
      <rect x={4.6} y={14} width={14.8} height={6} rx={3} />
    </Glyph>
  );
}

/**
 * More: three dots, and deliberately not three rules.
 *
 * A stack of three horizontal bars is the usual mark for a menu, and in this application it
 * is already taken: it is the Pile, two tabs to the left. Three dots say *there is more of
 * this* everywhere else, and they collide with nothing here.
 */
export function MoreGlyph(props: { className?: string }) {
  return (
    <Glyph {...props}>
      <circle cx={5.4} cy={12} r={1.9} />
      <circle cx={12} cy={12} r={1.9} />
      <circle cx={18.6} cy={12} r={1.9} />
    </Glyph>
  );
}

/**
 * Which mark stands for which destination, by the route it leads to.
 *
 * Keyed on `href` rather than held on the `Destination` itself, because `./navigation` is
 * data a node test reads and a React element is not: keeping the drawing on this side of
 * the line is what lets the map stay a module with no markup in it. `shell.test.ts` is what
 * says the two agree — a destination with no glyph is a tab that renders a hole.
 */
export const GLYPHS: Record<string, (props: { className?: string }) => React.ReactElement> = {
  "/": OpenBook,
  "/pile": Pile,
  "/collection": Shelf,
  "/stories": Spine,
  "/paths": Climb,
  "/series": Band,
  "/wishes": Gap,
  "/inbox": Tray,
  "/credits": Person,
};

/** The mark for a destination, as the chrome asks for it. */
export function GlyphFor({ href, className }: { href: string; className?: string }) {
  const Drawn = GLYPHS[href];
  return Drawn ? <Drawn className={className} /> : null;
}
