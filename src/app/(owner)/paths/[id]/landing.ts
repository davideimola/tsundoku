// WHERE A DRAGGED STOP LANDS, and the reason it is a module rather than four lines inside
// the handler that needs it.
//
// `./rail.tsx` is the one client component on this screen and it may hold no derivation
// (`vitest.config.ts`). What is genuinely the DOM's stays there — which row the pointer is
// over, which half of it, whether this browser has a mouse at all. What is left is
// arithmetic over an order: *given the route as it stands, the stop being carried, and the
// gap the pointer is in, which stop does it come to follow?* That is data in, data out, and
// it is what `moveStoryOnPath` is asked in (`src/core/verbs/path.ts`) — so it is tested
// beside itself and the handler above it holds a rectangle and an event.
//
// **The answer is an anchor, never an index.** A position on this route is `numeric` and
// sparse: a move writes one row, the midpoint between the two stops the moved one now sits
// between, and nothing else is re-numbered. So the question a drop answers is *after which
// Story*, with `null` for the front of the route — the same sentence the two arrows and
// *first* already speak, which is what makes the drag a shorter way to a write this screen
// already had rather than a second way to write it (ADR-0010).

/** Where a carried stop comes to rest: the stop it follows, or the front of the route. */
export type Landing = {
  /** The Story it comes to follow, or `null` for the front. */
  after: string | null;
};

/**
 * The stop the carried Story comes to follow, or `null` where the drop changes nothing.
 *
 * `order` is the route as it stands, `held` the Story being carried, `over` the row the
 * pointer is on and `above` whether it is in that row's upper half — a pointer high in a
 * row means the gap before it, low means the gap after it.
 *
 * **A drop that changes nothing answers nothing**, and that is the whole reason this returns
 * a `Landing | null` rather than an anchor: letting go a hair above the row below is where
 * the Story already is, and a POST for it would be a write that says *the route is what it
 * was*, plus a re-render the owner did not ask for. The screen reads the same `null` to
 * decide not to draw a line, so what is drawn and what is written cannot disagree.
 */
export function whereItLands(
  order: string[],
  held: string,
  over: number,
  above: boolean
): Landing | null {
  const from = order.indexOf(held);
  if (from === -1) return null;
  if (over < 0 || over >= order.length) return null;

  // The gap the pointer is in, named by the row on its upper side. A carried Story cannot
  // come to follow itself, so where that row *is* the carried one the gap is the one above
  // it — which is the gap the pointer is in, read from the other side.
  let anchor = above ? over - 1 : over;
  if (order[anchor] === held) anchor -= 1;

  const after = anchor < 0 ? null : (order[anchor] ?? null);
  const already = from === 0 ? null : (order[from - 1] ?? null);

  return after === already ? null : { after };
}
