import "server-only";

// The old word for the Pass, kept alive for exactly as long as the rename takes.
//
// A Reading is *one act of reading a Story* and a videogame is not read, so the core says
// **Pass** now and `./pass.ts` is where the verbs live (#57, ADR-0021). This file holds
// nothing but the old names pointed at the new ones, so the screens, the MCP tools and the
// converter go on compiling while they are migrated a batch at a time — the expand half of
// an expand-contract rename, said in TypeScript rather than in SQL.
//
// **It is deleted whole in the contract step (#60)**, and nothing new imports from it.

export type { Medium, NewPass as NewReading, Outcome } from "./pass.ts";
export {
  abandonPass as abandonReading,
  finishPass as finishReading,
  recordInstalmentReached,
  recordPass as recordReading,
  strikePass as strikeReading,
  WHY_A_PASS_STANDS as WHY_A_READING_STANDS,
} from "./pass.ts";
