import type { FacedWith } from "@/core/queries/cover";

// **STORIES BOUND IN ONE VOLUME**, and why a wall stops drawing the same jacket four times.
//
// A Story has no cover of its own — it borrows one off the first Volume carrying it
// (`THE_COVER_IT_IS_FACED_OUT_WITH`) — and an omnibus lends one picture to every tale inside
// it. Drawn tile by tile, the Loeb/Sale omnibus stood on the wall as seven identical jackets,
// and since a clean cover carries no title there was nothing on any of them to tell one tale
// from the next. So a wall of Stories lays those out as **one tile**: the jacket, faced out of
// a small stack of paper, with *N stories inside* under it, opening onto the list.
//
// **Which Volume lends a jacket is not something the Story wall is told.** Its query answers
// the picture (`cover`) and how many narratives wear it (`wornBy`), and not the lending
// Volume's id. So the grouping is by **the jacket itself — the image's address** — which is
// the same thing in every case the wall can produce: one Volume lends one URL. The
// approximation fails only where two different Volumes are faced with byte-for-byte the same
// URL, and then they would also look identical on the wall, which is the problem this solves.
// A Story wearing an image of its own (`from: "own"`) is never grouped: that picture is its
// own by the owner's word.
//
// Pure, and tested beside itself (`./bound-together.test.ts`), because which tiles a wall
// draws is a derivation and not markup.

/** What a Story has to answer for the wall to know whether its jacket is shared. */
export type Faced = {
  id: string;
  cover: FacedWith | null;
  /** How many narratives wear this Story's jacket, off the query (`wornBy`). */
  wornBy: number;
};

/** One tile of a wall of Stories: a Story on its own, or several bound in one Volume. */
export type Shelved<Story extends Faced> =
  | {
      kind: "one";
      story: Story;
      /**
       * Whether the jacket it would wear is its own to wear. A Story that borrows a jacket
       * several narratives share, standing on this wall without the others, is drawn as its
       * own cloth with its title — the jacket would claim *this is that book*.
       */
      ownsItsCover: boolean;
    }
  | {
      kind: "bound";
      /** The first Story's id: stable, and short enough to stand in a URL. */
      key: string;
      cover: FacedWith;
      stories: Story[];
    };

/** Whether this Story may wear its jacket as its own anywhere it is drawn alone. */
export function ownsItsCover(story: Faced): boolean {
  if (!story.cover) return false;
  return story.cover.from === "own" || story.wornBy <= 1;
}

/** The jacket a Story borrows from a Volume it shares with others, or `null`. */
function sharedJacket(story: Faced): string | null {
  if (!story.cover || story.cover.from === "own" || story.wornBy <= 1) return null;
  return story.cover.url;
}

/**
 * The tiles a wall of these Stories is drawn as, in the order the Stories came — a bound
 * tile standing where its first Story stood.
 */
export function boundTogether<Story extends Faced>(stories: Story[]): Shelved<Story>[] {
  const byJacket = new Map<string, Story[]>();
  for (const story of stories) {
    const jacket = sharedJacket(story);
    if (jacket === null) continue;
    byJacket.set(jacket, [...(byJacket.get(jacket) ?? []), story]);
  }

  const shelved: Shelved<Story>[] = [];
  const placed = new Set<string>();

  for (const story of stories) {
    const jacket = sharedJacket(story);
    const together = jacket === null ? [] : (byJacket.get(jacket) ?? []);

    if (together.length > 1 && story.cover) {
      if (placed.has(jacket as string)) continue;
      placed.add(jacket as string);
      shelved.push({ kind: "bound", key: story.id, cover: story.cover, stories: together });
      continue;
    }

    shelved.push({ kind: "one", story, ownsItsCover: ownsItsCover(story) });
  }

  return shelved;
}
