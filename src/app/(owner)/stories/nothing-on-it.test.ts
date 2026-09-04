import { describe, expect, it } from "vitest";

import type { StoryNothingHasHappenedTo } from "@/core/queries/story";
import { whatGoesWithIt } from "./nothing-on-it";

// What the row under a destructive tick says, tested beside itself under the licence
// `vitest.config.ts` states: data in, data out.
//
// The reason it is tested at all is ADR-0012. A Credit names a Person and does not own them,
// so *2 Credits go with it* has to carry *and the people stay* or the sentence reads as two
// people being deleted — and the owner who reads it that way unticks the row and leaves the
// wall wrong, which is the one outcome this whole panel exists to prevent.

function aStory(of: Partial<StoryNothingHasHappenedTo> = {}): StoryNothingHasHappenedTo {
  return {
    id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    title: "Slam Dunk 5",
    type: { id: "manga", name: "Manga" },
    carriedBy: 0,
    credits: 0,
    ...of,
  };
}

describe("what a strike takes with a Story", () => {
  it("says so when nothing else points at it, rather than leaving the line blank", () => {
    expect(whatGoesWithIt(aStory())).toBe("Nothing else points at it.");
  });

  // The clause that stops a count from reading as people being deleted (ADR-0012).
  it("names the Credits and says the people stay", () => {
    expect(whatGoesWithIt(aStory({ credits: 1 }))).toBe(
      "1 Credit goes with it, and the person stays."
    );
    expect(whatGoesWithIt(aStory({ credits: 3 }))).toBe(
      "3 Credits go with it, and the people stay."
    );
  });

  // *The house does not hold it* is the reason the row can be struck, not a caveat on it: an
  // object in the house refuses the strike outright.
  it("names the objects that carried it as objects the house does not hold", () => {
    expect(whatGoesWithIt(aStory({ carriedBy: 1 }))).toBe(
      "1 object the house does not hold carries it."
    );
    expect(whatGoesWithIt(aStory({ carriedBy: 2 }))).toBe(
      "2 objects the house does not hold carry it."
    );
  });

  it("says both where both are true, and nothing about what cannot be there", () => {
    const said = whatGoesWithIt(aStory({ credits: 2, carriedBy: 1 }));

    expect(said).toBe(
      "2 Credits go with it, and the people stay. 1 object the house does not hold carries it."
    );
    // A Pass, a score or a Path stop would have refused the strike, so the row never
    // mentions one — this is the sentence's silence being deliberate rather than an omission.
    expect(said).not.toMatch(/Pass|score|Path/);
  });
});
