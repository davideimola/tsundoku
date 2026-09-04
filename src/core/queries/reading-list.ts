import "server-only";

// The old word for the Pile, kept alive for exactly as long as the rename takes.
//
// The list that composes itself is **the Pile** now, and `./pile.ts` is where it is composed
// (#57, ADR-0021). This file holds nothing but the old names pointed at the new ones, so the
// dashboard, the list screen and the MCP door's own tool go on compiling while they are
// migrated separately.
//
// **It is deleted whole in the contract step (#60)**, and nothing new imports from it.

export type {
  Pile as ReadingList,
  PileEntry as ReadingListEntry,
  PileLine as ReadingListLine,
  PileMedium as ReadingListMedium,
  PileObject as ReadingListObject,
  PileReason as ReadingListReason,
  PileRoute as ReadingListRoute,
  PileRun as ReadingListRun,
} from "./pile.ts";
export { composePile as composeReadingList, theKeyOf } from "./pile.ts";
