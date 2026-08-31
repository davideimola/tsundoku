import Link from "next/link";

import type { SeriesLedger, SeriesVolume } from "@/core/queries/series";
import { type Tint, tint, UNWORN, WORN, worn } from "@/lib/tint";
import { cn } from "@/lib/utils";

import { type Position, positionsOf, standingSaid, whatTheFillMeans } from "./positions";

// THE SPINES, which are a Series' whole question made into a picture (#30).
//
// A Series answers *what am I missing* and never *was it any good*: it is a ledger, and the
// ledger is a publisher's ordered sequence of objects. So it is drawn as one — **a row of
// spines standing side by side, filled in the Series' own tint where the object is on the
// shelf and hollow where it is not.** The gaps *are* the answer, readable at arm's length in
// a shop without reading a number, which is the whole difference between this and the four
// hand-written rows in a spreadsheet that said `#ERROR!`.
//
// **Spines here and covers on the walls, and the difference is not decoration.** A wall is
// faced outwards, so `@/components/cover` is shaped like the page an image will one day fill
// (#32). A Series is a sequence of objects seen from the outside, the way a shelf is seen: a
// seventy-two volume Series is one screen of spines and would be six screens of covers, and
// one stretch of colour with two notches taken out of it is the picture the owner came for.
// The pile draws its spines lying down (`@/components/pile`) because a pile is read from the
// side; these stand up because a shelf does.
//
// It names no colour: the tint is the library's own, a function of the Series' identity, and
// the wiring by which a tile wears one is `@/lib/tint`'s — shared with the cover and the
// pile, so an untinted spine here cannot come to sit on a different ground than one there.
//
// What each position **is** — held, missing, or merely empty — is `./positions.ts`, tested
// beside itself, because the difference between *missing* and *empty* is a claim about the
// owner's intentions and not a colour.

/**
 * A Series drawn as spines: one per position, and the sentence that says what the fill means.
 *
 * `volumes` is what the shelf holds of it, where the caller read them. The list of Series
 * reads ledgers without their objects, and the same drawing is made from those — filled
 * spines carrying a number, with nothing to lead to.
 */
export function Spines({
  ledger,
  volumes = [],
}: {
  ledger: SeriesLedger;
  volumes?: readonly SeriesVolume[];
}) {
  const positions = positionsOf(ledger, volumes);

  if (positions.length === 0) {
    return (
      <p className="text-pretty text-sm text-muted-foreground">
        Nothing published yet. Nothing to miss — record the count when the first one is out.
      </p>
    );
  }

  const colour = tint(ledger.id);
  const fill = whatTheFillMeans(ledger, positions);

  return (
    <div>
      {/* Wrapping rather than scrolling sideways: seventy-two spines grow down the page in
          as many rows as the window holds, which is how it stays legible on a phone and how
          it spends the width at a desk. A shelf does the same thing. */}
      <ol className="flex flex-wrap gap-1" aria-label="The positions of this Series">
        {positions.map((position) => (
          <li key={position.number}>
            <Spine position={position} tint={colour} />
          </li>
        ))}
      </ol>

      {/* The fill, said in words — for anyone who cannot see it, and because the numbers
          are what the owner types into a shop's search. Which sentence this is belongs to
          `./positions.ts`, with the standings it is about. */}
      <p className="mt-3 text-pretty text-sm">
        <span className="text-muted-foreground">
          {fill.said}
          {fill.missing.length > 0 ? ": " : null}
        </span>
        {fill.missing.length > 0 ? (
          <span className="font-mono tabular-nums">{fill.missing.join(", ")}</span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * One spine, standing.
 *
 * Narrow and tall, with the title read up the spine and the position at the foot, which is
 * where both are on the object itself. A position the house holds is a **link to the object**
 * — the drawing is a way onto the shelf as well as a picture of it — and a gap is not,
 * because there is nothing there to open.
 *
 * The two states are told apart by fill: a spine wears the Series' colour, a gap is a dashed
 * outline over the page's own ground. The sentence under the spines says which is which, and
 * every spine carries the same thing as a label, so the fill is never the only way to read
 * it.
 */
function Spine({ position, tint }: { position: Position; tint: Tint | null }) {
  const held = position.standing === "held";
  // The object standing here, where the caller read the objects at all: what makes this spine
  // a way onto the shelf rather than only a picture of it.
  const leadsTo = held ? position.volume : null;
  const said = [
    position.volume?.title,
    `${position.number} of the Series`,
    standingSaid(position.standing),
  ]
    .filter(Boolean)
    .join(" — ");

  const shape = cn(
    // A spine's proportions, and tall enough that a title read up it is a title rather than
    // a hint. 44px is not on offer at this width — a row of them would be a wall — and
    // what buys that is the same thing that buys the pile's 28px: the object is one tap
    // away as a cover on the Collection wall, at the size a thumb wants.
    "flex h-24 w-7 flex-col items-center justify-between overflow-hidden rounded-sm p-1 sm:h-28 sm:w-8",
    "font-mono text-eyebrow tabular-nums",
    held
      ? cn("border border-border text-foreground", tint ? WORN : UNWORN)
      : // Dashed, quiet and empty: a gap is the absence of an object and is drawn as one.
        "border border-dashed border-foreground/30 text-muted-foreground"
  );

  const inside = (
    <>
      <span className="min-h-0 flex-1">
        {position.volume ? (
          // Read up the spine, the way it is printed on the object: bottom to top, clipped
          // at the height of the spine rather than wrapped, since a spine has one line.
          <span className="block h-full rotate-180 overflow-hidden font-heading text-eyebrow font-medium [text-orientation:mixed] [writing-mode:vertical-rl]">
            {position.volume.title}
          </span>
        ) : null}
      </span>
      <span>{position.number}</span>
    </>
  );

  if (!leadsTo) {
    // `title` rather than a legend, as before: what a pointer gets. `role="img"` because
    // that is what this is — a drawing of a position, whose number is inside the label —
    // and it is what lets the label stand on an element that leads nowhere.
    return (
      <span
        role="img"
        title={said}
        aria-label={said}
        style={worn(held ? tint : null)}
        className={shape}
      >
        {inside}
      </span>
    );
  }

  return (
    <Link
      href={`/collection/${leadsTo.id}`}
      title={said}
      aria-label={said}
      style={worn(tint)}
      className={cn(
        shape,
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Coming up out of the row, the way a book is taken off a shelf — and only where
        // the owner has not asked things to stay still.
        "motion-safe:transition-transform motion-safe:hover:-translate-y-1"
      )}
    >
      {inside}
    </Link>
  );
}
