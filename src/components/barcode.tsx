// A BARCODE, DRAWN — the glyph on the second door into cataloguing an object.
//
// **The one icon in this application, and it is here because it is not decoration**: it is a
// picture of the thing the owner is about to point a camera at. Everything else in this chrome
// is a word, deliberately (`AGENTS.md`), and a word is what this would be too if the control
// it sits on had room for one — it does not, because it is a 48-pixel segment flush against
// *Catalogue a Volume* and the whole point of it is to cost no line of its own.
//
// Drawn rather than installed. There is no icon package in this project and this is not the
// reason to add one: a barcode is seven rectangles, and the repository already draws its mark
// from rectangles (`./mark.tsx`), a pile from them lying down (`./pile.tsx`) and a shelf from
// them standing up (`./spine.tsx`). This is the same vocabulary at 18 pixels — **a row of
// standing spines of different thicknesses**, which is what a barcode is and, not by accident,
// what a shelf read end-on looks like.
//
// It names no colour: the bars are `currentColor`, so the glyph is ink wherever it is put and
// the control it sits on decides which ink that is (`src/app/palette.test.ts`).

/** The bars: two thicknesses, an even height, and the thin ones outnumbering the thick. */
const BARS = [
  { x: 1.2, width: 1 },
  { x: 3, width: 2 },
  { x: 5.8, width: 1 },
  { x: 7.6, width: 1 },
  { x: 9.4, width: 2.4 },
  { x: 12.6, width: 1 },
  { x: 14.4, width: 2.4 },
];

/**
 * The glyph, at the size of the text beside it.
 *
 * `aria-hidden` and no title of its own: the link it sits inside carries the accessible name,
 * because what a screen reader needs to hear is *where this goes*, not that there is a picture
 * of a barcode on it.
 */
export function Barcode({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 18 18"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden
      focusable="false"
      className={className}
    >
      {BARS.map((bar) => (
        <rect key={bar.x} x={bar.x} y={2} width={bar.width} height={14} rx={0.4} />
      ))}
    </svg>
  );
}
