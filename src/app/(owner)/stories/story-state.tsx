import type { StoryState } from "@/core/queries/story";

// How each of the four derived states is printed. One map rather than two, so that a
// change to the derivation is one edit here and not a hunt through parallel tables.
//
// Weight rather than colour carries the distinction, and after the palette landed that is
// not a restraint but the only option: the chrome has no hue to spend. What the owner scans
// for is which of these
// is *open* — reading — against everything settled.
const SHOWN: Record<StoryState, { word: string; emphasis: string }> = {
  "to-read": { word: "to read", emphasis: "text-muted-foreground" },
  reading: { word: "reading", emphasis: "text-foreground" },
  read: { word: "read", emphasis: "text-muted-foreground" },
  abandoned: {
    word: "abandoned",
    emphasis: "text-muted-foreground line-through decoration-1",
  },
};

/**
 * A Story's state, in the same mono-caps idiom the rest of the app labels things with.
 *
 * Printed plainly rather than as a pill, because it is a derived fact and not a thing
 * the owner set: nothing here is clickable and nothing pretends to be.
 */
export function StoryStateLabel({ state }: { state: StoryState }) {
  const shown = SHOWN[state];

  return (
    <span
      className={`font-mono text-[0.7rem] uppercase tracking-[0.18em] ${shown.emphasis}`}
      // The derivation is the product, so the screen says so where there is room to.
      title="Derived from this Story's Readings, and stored nowhere"
    >
      {shown.word}
    </span>
  );
}
