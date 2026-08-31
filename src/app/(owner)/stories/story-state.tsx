import type { StoryState } from "@/core/queries/story";

// The four derived states, in one map — **and it is one map because the state became the
// axis of the application** (#22). It is printed beside a Story on a Path, it names each
// shelf of the wall, and it is one of the two filters in the URL, so three screens say the
// same four words and none of them may invent a fifth wording.
//
// Weight rather than colour carries the distinction, and after the palette landed that is
// not a restraint but the only option: the chrome has no hue to spend. What the owner scans
// for is which of these is *open* — reading — against everything settled.
const SHOWN: Record<StoryState, { word: string; band: string; emphasis: string }> = {
  "to-read": { word: "to read", band: "The pile", emphasis: "text-muted-foreground" },
  reading: { word: "reading", band: "Reading now", emphasis: "text-foreground" },
  read: { word: "read", band: "Read", emphasis: "text-muted-foreground" },
  abandoned: {
    word: "abandoned",
    band: "Abandoned",
    emphasis: "text-muted-foreground line-through decoration-1",
  },
};

/**
 * The order the wall puts the four states in, and the order the filters offer them.
 *
 * **Open first**: what the owner is in the middle of, then what they have not started, then
 * what is settled. It is not the order the type declares them in and it is not alphabetical
 * — it is the order of the question *"what am I reading?"*, which is the one the owner opens
 * this screen with.
 */
export const WALL_STATES = [
  "reading",
  "to-read",
  "read",
  "abandoned",
] as const satisfies readonly StoryState[];

/** How a state is said in a sentence or on a control: *to read*, *reading*. */
export function stateWord(state: StoryState): string {
  return SHOWN[state].word;
}

/**
 * What a band of them is called on the wall: *The pile*, the thing this application is
 * named after.
 *
 * A **band** rather than a shelf, though #22 says shelf and the picture is a shelf: in this
 * repo *the shelf* is what the house physically holds — `CONTEXT.md` spends the word on the
 * Collection, and `queries/series.ts` measures its ledger against it — so a group of
 * abandoned Stories is not one. *Band* is the word the redesign already uses for a
 * horizontal section of a screen.
 */
export function bandName(state: StoryState): string {
  return SHOWN[state].band;
}

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
