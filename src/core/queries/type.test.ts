import { describe, expect, it } from "vitest";
import { listTypes } from "./type.ts";

// The five are ADR-0006's, read off `CONTEXT.md` rather than off the migration: if
// this test and the schema ever disagree, the glossary is the one that is right.
describe("the Types", () => {
  it("are the five the model recognises, in the order they are offered in", async () => {
    expect(await listTypes()).toEqual([
      { id: "manga", name: "Manga" },
      { id: "comic", name: "Comic" },
      { id: "graphic-novel", name: "Graphic Novel" },
      { id: "novel", name: "Novel" },
      { id: "non-fiction", name: "Non-fiction" },
    ]);
  });
});
