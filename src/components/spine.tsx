import Link from "next/link";

import { BINDING, type Tint, UNWORN, WORN, worn } from "@/lib/tint";
import { cn } from "@/lib/utils";

// THE SPINE, STANDING: an object seen from the side, which is how a shelf is seen.
//
// It is one of the two drawings in this application that wear the library's own colour, and
// each is a different view of the same object. `@/components/cover` is faced outwards and
// shaped like the page an image fills, because a wall is faced outwards. This one stands up, and what it buys is **density with the sequence intact**: a Series of
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
  // **Bound like the cover is bound** (ADR-0026, second tranche): a held spine is the
  // Series' cloth with its title stamped up it in the light lettering, a darker headband at
  // its head and the crease beside it; a gap is a dashed outline over the shelf. The number
  // stands **under** the spine, on the shelf's edge, rather than printed on the cloth — the
  // way a shelf mark is read, and the way a missing position still carries one.
  const shape = cn(
    "relative flex h-28 w-7 items-center justify-center overflow-hidden rounded-t-[2px] sm:h-40 sm:w-[2.125rem]",
    held
      ? cn(tint ? WORN : cn(UNWORN, "text-foreground"), BINDING.crease)
      : // Dashed, quiet and empty: what is not there is drawn as not there.
        "border border-dashed border-foreground/35"
  );

  const body = (
    <span style={worn(held ? tint : null)} className={shape}>
      {held ? (
        <span
          aria-hidden="true"
          className={cn("absolute inset-x-0 top-0 h-[7%]", BINDING.headband)}
        />
      ) : null}
      {title && held ? (
        // Bottom to top, the way a spine printed in Europe is read, and clipped at the height
        // of the spine rather than wrapped, since a spine has one line.
        <span className="block max-h-[86%] rotate-180 overflow-hidden whitespace-nowrap font-heading text-xs font-semibold [writing-mode:vertical-rl]">
          {title}
        </span>
      ) : null}
    </span>
  );

  const inside = (
    <>
      {body}
      <span className="text-tab text-muted-foreground tabular-nums">{foot}</span>
    </>
  );

  /** The spine and the number under it, one column. */
  const column = "flex flex-col items-center gap-1";

  if (!href) {
    // `role="img"` because that is what this is — a drawing of an object or of the place one
    // would stand — and it is what lets the label sit on an element that leads nowhere.
    return (
      <span role="img" title={detail} aria-label={detail} className={column}>
        {inside}
      </span>
    );
  }

  return (
    <Link
      href={href}
      title={detail}
      aria-label={detail}
      className={cn(
        column,
        "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Coming up out of the row, the way a book is taken off a shelf — and only where the
        // owner has not asked things to stay still.
        "motion-safe:transition-transform motion-safe:hover:-translate-y-0.5"
      )}
    >
      {inside}
    </Link>
  );
}
