import { describe, expect, it } from "vitest";
import { listMedia } from "./medium.ts";

// Read off `CONTEXT.md`'s Medium entry rather than off the migration, the way the Bindings
// are: if this test and the schema disagree, the glossary is the one that is right. What it
// pins is the pair the old check constraint held and the flag that constraint implied —
// **only paper goes through an object** (ADR-0022).
describe("the media", () => {
  it("are a vocabulary in the order they are offered in, and say which goes through an object", async () => {
    expect(await listMedia()).toEqual([
      { id: "paper", name: "Paper", goesThroughAnObject: true },
      { id: "digital", name: "Digital", goesThroughAnObject: false },
    ]);
  });
});
