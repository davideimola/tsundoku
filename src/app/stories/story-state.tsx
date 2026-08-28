import type { StoryState } from "@/core/queries/story";

// The four states in the words the owner uses for them. The slug is what MCP reads;
// this is what the screen reads, and the mapping lives here because it is presentation
// and nothing else.
const WORDS: Record<StoryState, string> = {
  "to-read": "to read",
  reading: "reading",
  read: "read",
  abandoned: "abandoned",
};

// Weight rather than colour carries the distinction: the whole page is monochrome
// (shadcn's neutral tokens, unchanged), and what the owner scans for is which of these
// is *open* — reading — against everything settled.
const EMPHASIS: Record<StoryState, string> = {
  "to-read": "text-muted-foreground",
  reading: "text-foreground",
  read: "text-muted-foreground",
  abandoned: "text-muted-foreground line-through decoration-1",
};

/**
 * A Story's state, in the same mono-caps idiom the rest of the app labels things with.
 *
 * Printed with a leading dot rather than a pill, because it is a derived fact and not a
 * thing the owner set: nothing here is clickable and nothing pretends to be.
 */
export function StoryStateLabel({ state }: { state: StoryState }) {
  return (
    <span
      className={`font-mono text-[0.7rem] uppercase tracking-[0.18em] ${EMPHASIS[state]}`}
      // The derivation is the product, so the screen says so where there is room to.
      title="Derived from this Story's Readings, and stored nowhere"
    >
      {WORDS[state]}
    </span>
  );
}
