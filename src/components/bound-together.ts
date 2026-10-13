import type { FacedWith } from "@/core/queries/cover";
import type { LendingVolume } from "@/core/queries/story";

// **STORIES BOUND IN ONE VOLUME**, and why a wall stops drawing the same jacket four times.
//
// A Story has no cover of its own — it borrows one off the first Volume carrying it
// (`THE_COVER_IT_IS_FACED_OUT_WITH`) — and an omnibus lends one picture to every tale inside
// it. Drawn tile by tile, the Loeb/Sale omnibus stood on the wall as seven identical jackets,
// and since a clean cover carries no title there was nothing on any of them to tell one tale
// from the next. So a wall of Stories lays those out as **one tile**: the jacket, faced out of
// a small stack of paper, with *N stories inside* under it, opening onto the list.
//
// **The grouping is by the Volume that lends the jacket**, which the wall's query names
// (`lentBy`, off the same pick the picture comes from). It was by the image's address until
// the core said which Volume — an approximation that also lost the way onto the Volume
// wherever the house did not hold it. A Story wearing an image of its own lends from nobody
// (`lentBy` is `null`), so it is never grouped: that picture is its own by the owner's word.
//
// Pure, and tested beside itself (`./bound-together.test.ts`), because which tiles a wall
// draws is a derivation and not markup.

/** What a Story has to answer for the wall to know whether its jacket is shared. */
export type Faced = {
  id: string;
  cover: FacedWith | null;
  /** How many narratives wear this Story's jacket, off the query (`wornBy`). */
  wornBy: number;
  /** The Volume that jacket is lent by, off the query, or `null` where nothing is lent. */
  lentBy: LendingVolume | null;
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
      /** The Volume they are bound in, which lends the jacket — in the house or not. */
      volume: LendingVolume;
      stories: Story[];
    };

/** Whether this Story may wear its jacket as its own anywhere it is drawn alone. */
export function ownsItsCover(story: Pick<Faced, "cover" | "wornBy">): boolean {
  if (!story.cover) return false;
  return story.cover.from === "own" || story.wornBy <= 1;
}

/** The Volume a Story borrows a jacket from that it shares with others, or `null`. */
function sharedJacket(story: Faced): LendingVolume | null {
  if (!story.cover || !story.lentBy || story.wornBy <= 1) return null;
  return story.lentBy;
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
    byJacket.set(jacket.id, [...(byJacket.get(jacket.id) ?? []), story]);
  }

  const shelved: Shelved<Story>[] = [];
  const placed = new Set<string>();

  for (const story of stories) {
    const jacket = sharedJacket(story);
    const together = jacket === null ? [] : (byJacket.get(jacket.id) ?? []);

    if (jacket !== null && together.length > 1 && story.cover) {
      if (placed.has(jacket.id)) continue;
      placed.add(jacket.id);
      shelved.push({
        kind: "bound",
        key: story.id,
        cover: story.cover,
        volume: jacket,
        stories: together,
      });
      continue;
    }

    shelved.push({ kind: "one", story, ownsItsCover: ownsItsCover(story) });
  }

  return shelved;
}
