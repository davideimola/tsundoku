import { ownsItsCover } from "@/components/bound-together";
import type { FacedWith } from "@/core/queries/cover";
import type { PileEntry } from "@/core/queries/pile";

// WHICH JACKET A ROW OF THE PILE WEARS, and which Volume it belongs to.
//
// A row is faced with `entry.cover` — the Story's own image, or whatever the Volume lending it
// a jacket is faced with (`composePile`, by the walls' own rule). An omnibus lends one picture
// to every tale inside it; the row wears it, and where more than one narrative wears it
// (`wornBy`) says under its name which Volume it is bound in (`lentBy`), so the picture is not
// mistaken for the tale's own (`ownsItsCover`, `@/components/bound-together`).

/** What a row is faced with, and the Volume it is bound in where the jacket is shared. */
export function entryWears(entry: PileEntry): { image: FacedWith | null; boundIn: string | null } {
  if (!entry.cover || ownsItsCover(entry)) return { image: entry.cover, boundIn: null };

  return { image: entry.cover, boundIn: entry.lentBy?.title ?? null };
}
