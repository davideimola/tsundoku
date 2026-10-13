import { ownsItsCover } from "@/components/bound-together";
import type { FacedWith } from "@/core/queries/cover";
import type { PileEntry } from "@/core/queries/pile";

// WHICH JACKET A ROW OF THE PILE WEARS, and when it wears none.
//
// A row is faced with `entry.cover` — the Story's own image, or whatever the Volume lending it
// a jacket is faced with (`composePile`, by the walls' own rule). An omnibus lends one picture
// to every tale inside it, and a row faced with it would claim *this is that book* about one
// tale. So where a borrowed jacket is worn by more than one narrative (`wornBy`), the row is
// drawn as the Story's own cloth with its title, and says under its name which Volume it is
// bound in (`lentBy`) — the same judgement a wall makes of a tile standing without the others
// (`ownsItsCover`, `@/components/bound-together`).

/** What a row is faced with, and the Volume it is bound in where the jacket is shared. */
export function entryWears(entry: PileEntry): { image: FacedWith | null; boundIn: string | null } {
  if (!entry.cover || ownsItsCover(entry)) return { image: entry.cover, boundIn: null };

  return { image: null, boundIn: entry.lentBy?.title ?? null };
}
