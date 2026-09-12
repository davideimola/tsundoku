import Link from "next/link";
import { CUT, VIEWBOX } from "@/components/mark";
import { cn } from "@/lib/utils";
import { THE_DOOR } from "./navigation";

/**
 * THE DOOR, as the chrome carries it: **the one act in a chrome otherwise made of
 * questions.**
 *
 * `./navigation` argues why `/add` is not a line in the map — the three sections are the
 * three questions the owner *asks*, and the door is the one place they make a *statement*.
 * This is the other half of that argument: what a non-destination looks like when it is
 * still the most-pressed thing in the application.
 *
 * **It is the pair to the finder, and the two are deliberately unalike.** Both are screens
 * reached from the chrome rather than from the map, and they are the only two — one asks the
 * library what it already holds, the other tells it something new. The finder is a quiet
 * glyph because it is passed *through*; the door is the single filled thing in the whole
 * chrome because it is the thing arrived *at*. Ink on paper, which is the one emphasis this
 * palette has: `src/app/globals.css` spends no accent colour, on the argument that the
 * library is the only colour in the application, so weight is the only way anything here is
 * allowed to be loud.
 *
 * **Two anatomies, for the two postures**, the way `Row` and `Tab` already are in the shell.
 * At the desk it is a named control across the top of the sidebar, above the sections and
 * under the mark: there is room for the sentence, and the owner meets it before the map. On
 * the phone it is a filled square in the top strip beside the finder, glyph alone — the
 * strip is sticky, so it is on every screen at a thumb's stretch, and it stays out of the
 * bottom bar, which is four *destinations* and would have to give one of them up.
 *
 * Why the top strip rather than the thumb: the door's phone moment is a fumetteria with an
 * object in one hand, and what it opens is a field to type in or a camera to point — both
 * two-handed, both above the fold. A bar of six would also take every tab below the width
 * its word already barely fits in.
 */

/** The words on it, everywhere it is named. A control keeps one name through the flow. */
const SAYS = THE_DOOR.label;

export function DoorAtTheDesk({ className }: { className?: string }) {
  return (
    <Link
      href={THE_DOOR.href}
      className={cn(
        "flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity",
        "outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
        className
      )}
    >
      <ThePlus className="size-3.5 shrink-0" />
      {SAYS}
    </Link>
  );
}

export function DoorOnThePhone({ className }: { className?: string }) {
  return (
    <Link
      href={THE_DOOR.href}
      aria-label={SAYS}
      className={cn(
        // Forty-four pixels on the phone and thirty-six at the desk, which is the same
        // number the rest of the application is drawn to: a fingertip is 44px wide and a
        // pointer is one pixel. It is the widest thing in a 48px strip on purpose — this
        // is the control the owner presses standing up, one-handed, holding a book.
        "flex size-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity sm:size-9",
        "outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      <ThePlus className="size-4" />
    </Link>
  );
}

/**
 * The glyph: **a plus, drawn in the house's own technique and nothing more.**
 *
 * Two shapes were tried before this one and both failed the only test that matters, which is
 * being looked at at sixteen pixels. A spine from `PILE` with the plus centred over it drew a
 * `±`, a symbol that already means something else. Moving the plus to the corner fixed that
 * and left the other half broken: one spine is a *pile* only when there are three of it, and
 * alone, at this size, it is a rule. The mark can carry the picture because it is three
 * spines and it is never asked to be smaller than twenty pixels; this is one glyph inside a
 * control, and it has to be recognised rather than read.
 *
 * So the picture is spent where it works — the mark, two inches up the same sidebar — and the
 * door says the plainest thing there is. What makes it this application's and not a library's
 * is the technique: filled rects with `CUT` corners, the same barely-cut edge every spine in
 * `src/components/mark.tsx` is drawn with, so it sits in the chrome as a member of the family
 * rather than as an import. Which is also why there is still no icon library: two glyphs, a
 * magnifier and this, and neither earns a dependency.
 */
function ThePlus({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect x={10.9} y={4.5} width={2.2} height={15} rx={CUT} />
      <rect x={4.5} y={10.9} width={15} height={2.2} rx={CUT} />
    </svg>
  );
}
