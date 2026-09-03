// WHICH PART OF THE WORK THE POINTER IS ASKING FOR — the arithmetic behind the span on this
// screen, kept out of the component that attaches it.
//
// It is `paths/[id]/landing.ts` at a smaller size and for the same reason: the gesture is a
// media query, a rectangle and four listeners, and everything in it that could be *wrong*
// lives here instead, where it is data in, data out and tested beside itself
// (`vitest.config.ts`). A component that computed this would be a derivation nobody can run
// without a browser.

/** One part of the work as the browser measured its tick, in viewport pixels. */
export type PartBounds = {
  /** The Instalment this tick stands for, counted from one. */
  part: number;
  left: number;
  right: number;
};

/**
 * The part the pointer is over — or the nearest one, where it has run off an end.
 *
 * **Nearest rather than strictly under**, and that is the whole of the decision here. A drag
 * that overshoots the left edge means *from the beginning*, and a gesture that stopped dead
 * at the first tick would make the two ends of the work the two hardest parts to say. Off the
 * right edge is the same sentence about the last one.
 *
 * `null` only where there is nothing to be over: a work with no parts drawn, which is a
 * Story that declares no Instalments and therefore has no span on screen at all.
 */
export function thePartUnder(bounds: readonly PartBounds[], x: number): number | null {
  let nearest: number | null = null;
  let best = Number.POSITIVE_INFINITY;

  for (const tick of bounds) {
    const away = x < tick.left ? tick.left - x : x > tick.right ? x - tick.right : 0;
    // Strictly nearer, so a tie between two touching ticks keeps the earlier part rather
    // than sliding to the later one as the list is walked.
    if (away < best) {
      best = away;
      nearest = tick.part;
    }
  }

  return nearest;
}

/**
 * The range a gesture is asking for: where it started, and where the pointer is now.
 *
 * Ordered rather than taken as given, because a drag runs both ways — an owner sweeping from
 * the twelfth part back to the first is saying *one to twelve*, and a range that inverts is
 * refused by Postgres (`core/verbs/story-to-volume.ts`). A press with no movement asks for a
 * single part, which is the tap that says *this object holds Instalment 1 and nothing else*.
 */
export function theSpanAsked(anchor: number, at: number): { from: number; to: number } {
  return { from: Math.min(anchor, at), to: Math.max(anchor, at) };
}
