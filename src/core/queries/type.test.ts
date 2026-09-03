import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { createStory } from "../verbs/story.ts";
import { listTypes, theTypeToOffer } from "./type.ts";

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

// **The Type is asked once for the whole object, and it arrives already answered** (#47,
// ADR-0019). Two sources, in that order: the Binding, where the Binding decides, and
// otherwise the last Type the owner used.
describe("the Type a new narrative is offered", () => {
  beforeEach(async () => {
    await query("truncate story cascade");
  });

  it("reads a tankōbon as a Manga and a spillato as a Comic", async () => {
    expect(await theTypeToOffer("tankobon")).toBe("manga");
    expect(await theTypeToOffer("stapled")).toBe("comic");
  });

  it("lets the Binding win over the last one used, because the object is in front of you", async () => {
    await createStory({ title: "Neuromancer", typeId: "novel" });

    expect(await theTypeToOffer("tankobon")).toBe("manga");
  });

  it("falls back to the last Type the owner used where the Binding decides nothing", async () => {
    await createStory({ title: "Neuromancer", typeId: "novel" });
    await createStory({ title: "Gotham Noir", typeId: "comic" });

    expect(await theTypeToOffer("must-have")).toBe("comic");
    expect(await theTypeToOffer("hardcover")).toBe("comic");
  });

  it("offers nothing at all on an empty library, so the owner is asked rather than guessed at", async () => {
    expect(await theTypeToOffer("hardcover")).toBeNull();
    expect(await theTypeToOffer(null)).toBeNull();
  });

  it("guesses from the Binding on an empty library, which is the whole of its usefulness", async () => {
    expect(await theTypeToOffer("tankobon")).toBe("manga");
  });
});
