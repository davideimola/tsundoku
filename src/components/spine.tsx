import Link from "next/link";

import { type Tint, UNWORN, WORN, worn } from "@/lib/tint";
import { cn } from "@/lib/utils";

// THE SPINE, STANDING: an object seen from the side, which is how a shelf is seen.
//
// It is the third of the three drawings in this application that wear the library's own
// colour, and each is a different view of the same object. `@/components/cover` is faced
// outwards and shaped like the page an image fills, because a wall is faced outwards.
// `@/components/pile` lies its spines down, because a pile is read from the side. This one
// stands up, and what it buys is **density with the sequence intact**: a Series of
// seventy-two positions is one screen of spines and six of covers, and a Story carried by
// twenty tankōbon is one row rather than twenty rows of text (#29, #30).
//
// It came out of `(owner)/series/spines.tsx`, where it was drawn first, when the Story's page
// needed the same picture of the objects carrying it. Extracted rather than copied for the
// reason the tint is one function: two spines drawn from two files would drift, and the
// second one to drift would be the one nobody was looking at.
//
// **Fill is the whole of the vocabulary.** A spine wearing the tint is a thing that is
// *there* — the Volume is on the shelf, the position is held — and a dashed outline over the
// page's own ground is a thing that is not. What "there" means is the caller's, because it
// differs: a Series' gap is a Volume the owner does not have, and a Story's is an object the
// house has let go of but which still carried the narrative. Both screens say which is which
// in words beside the row, so the fill is never the only way to read it.
//
// It names no colour. The tint is `@/lib/tint`'s, and how a tile wears one is `worn()`/`WORN`
// there rather than three lines here.

export function Spine({
  href,
  title,
  foot,
  tint,
  held,
  detail,
}: {
  /**
   * Where it leads, or nothing at all.
   *
   * A gap in a Series leads nowhere because there is no object at it; everything else is a
   * way onto the shelf, which is what makes the drawing a way in rather than only a picture.
   */
  href?: string;
  /** Read up the spine, the way it is printed on the object. Absent where there is no object. */
  title?: string | null;
  /** The one number the foot carries: a position in a line, most often. */
  foot: React.ReactNode;
  /** The Series' colour, or `null` for an object that stands in no line — see `@/lib/tint`. */
  tint: Tint | null;
  /** Whether the thing is there: filled in the tint if it is, a dashed outline if it is not. */
  held: boolean;
  /**
   * Everything the spine cannot fit, said once for the pointer and for the screen reader —
   * the title, what the number means, and what the fill is saying.
   */
  detail: string;
}) {
  const shape = cn(
    // A spine's proportions, and tall enough that a title read up it is a title rather than
    // a hint. 44px is not on offer at this width — a row of them would be a wall — and what
    // buys that is the same thing that buys the pile's 28px: the object is one tap away as a
    // cover on the Collection wall, at the size a thumb wants.
    "flex h-24 w-7 flex-col items-center justify-between overflow-hidden rounded-sm p-1 sm:h-28 sm:w-8",
    "font-mono text-eyebrow tabular-nums",
    held
      ? cn("border border-border text-foreground", tint ? WORN : UNWORN)
      : // Dashed, quiet and empty: what is not there is drawn as not there.
        "border border-dashed border-foreground/30 text-muted-foreground"
  );

  const inside = (
    <>
      <span className="min-h-0 flex-1">
        {title ? (
          // Bottom to top, and clipped at the height of the spine rather than wrapped, since
          // a spine has one line.
          <span className="block h-full rotate-180 overflow-hidden font-heading text-eyebrow font-medium [text-orientation:mixed] [writing-mode:vertical-rl]">
            {title}
          </span>
        ) : null}
      </span>
      <span>{foot}</span>
    </>
  );

  if (!href) {
    // `role="img"` because that is what this is — a drawing of an object or of the place one
    // would stand — and it is what lets the label sit on an element that leads nowhere.
    return (
      <span
        role="img"
        title={detail}
        aria-label={detail}
        style={worn(held ? tint : null)}
        className={shape}
      >
        {inside}
      </span>
    );
  }

  return (
    <Link
      href={href}
      title={detail}
      aria-label={detail}
      style={worn(held ? tint : null)}
      className={cn(
        shape,
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Coming up out of the row, the way a book is taken off a shelf — and only where the
        // owner has not asked things to stay still.
        "motion-safe:transition-transform motion-safe:hover:-translate-y-1"
      )}
    >
      {inside}
    </Link>
  );
}
