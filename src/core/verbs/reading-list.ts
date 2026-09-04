import "server-only";

// The old word for the Pile, kept alive for exactly as long as the rename takes.
//
// The Reading list is *what to read next* and half of what stands on it is not read, so the
// core says **the Pile** now and `./pile.ts` is where the two verbs live (#57, ADR-0021).
// This file holds nothing but the old names pointed at the new ones, so the screens and the
// MCP tools go on compiling while they are migrated separately.
//
// **It is deleted whole in the contract step (#60)**, and nothing new imports from it.

export type { PinnedSubject } from "./pile.ts";
export { pinToPile as pinToReadingList, unpinFromPile as unpinFromReadingList } from "./pile.ts";
