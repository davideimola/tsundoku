import { describe, expect, it } from "vitest";
import { listMedia } from "./medium.ts";

// Read off `CONTEXT.md`'s Medium entry rather than off the migration, the way the Bindings
// are: if this test and the schema disagree, the glossary is the one that is right. What it
// pins is the two the old check constraint held, the consoles that made a vocabulary of them,
// and the flag that constraint implied — **only paper goes through an object** (ADR-0022).
//
// **The consoles are the owner's own three and the list is meant to move**, which is the
// point of it being data (#62): a console bought next year is one insert and this line, and
// nothing else in the repository names one.
describe("the media", () => {
  it("are a vocabulary in the order they are offered in, and say which goes through an object", async () => {
    expect(await listMedia()).toEqual([
      { id: "paper", name: "Paper", goesThroughAnObject: true },
      { id: "digital", name: "Digital", goesThroughAnObject: false },
      { id: "playstation-5", name: "PlayStation 5", goesThroughAnObject: false },
      { id: "nintendo-switch", name: "Nintendo Switch", goesThroughAnObject: false },
      { id: "pc", name: "PC", goesThroughAnObject: false },
    ]);
  });

  // The rule stated as a rule rather than as a list, so that a console added without the flag
  // fails here rather than at the moment a pass through it is refused an object it should
  // never have been offered. Paper is the only medium that can, and it is the one the
  // sentence is written against (ADR-0022).
  it("lets only paper go through an object, whatever else is seeded beside it", async () => {
    const through = (await listMedia())
      .filter((medium) => medium.goesThroughAnObject)
      .map((medium) => medium.id);

    expect(through).toEqual(["paper"]);
  });
});
