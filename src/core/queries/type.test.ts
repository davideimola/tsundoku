import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { createStory } from "../verbs/story.ts";
import { listTypes, theTypeEachBindingOffers, theTypeToOffer } from "./type.ts";

// They are ADR-0006's, read off `CONTEXT.md` rather than off the migration: if this test and
// the schema ever disagree, the glossary is the one that is right. The list grows by an
// insert, which is the whole of what ADR-0006 promised a new Type would cost: **Play** arrived
// with the books half because one row of it was a script (migration 0013), and **Videogame**
// right after it (#62, ADR-0021). A Story owing no object to anybody is the ordinary case this
// model has held since ADR-0001, so nothing about the shape moved to make room for either.
describe("the Types", () => {
  it("are the ones the model recognises, in the order they are offered in", async () => {
    expect(await listTypes()).toEqual([
      { id: "manga", name: "Manga", verbPast: "read", verbBase: "read" },
      { id: "comic", name: "Comic", verbPast: "read", verbBase: "read" },
      { id: "graphic-novel", name: "Graphic Novel", verbPast: "read", verbBase: "read" },
      { id: "novel", name: "Novel", verbPast: "read", verbBase: "read" },
      { id: "non-fiction", name: "Non-fiction", verbPast: "read", verbBase: "read" },
      { id: "play", name: "Play", verbPast: "read", verbBase: "read" },
      { id: "videogame", name: "Videogame", verbPast: "played", verbBase: "play" },
    ]);
  });

  // **The verb is the whole of #65 and the door is downstream of it.** A Type that is not read
  // is the one that has to say so (migration 0019), which is what keeps a new kind of thing at
  // one insert: the six printed ones take the default, and the seventh carries the two words
  // the sentences on the door are built from. A Play is read — it is a script, printed and
  // bound (migration 0013) — and putting it beside the videogame here is what says the split
  // is *read or not*, and never *printed or not*.
  it("says what going through one is called, and only the videogame is not read", async () => {
    const types = await listTypes();
    const notRead = types.filter((one) => one.verbPast !== "read");

    expect(notRead).toEqual([
      { id: "videogame", name: "Videogame", verbPast: "played", verbBase: "play" },
    ]);
  });

  // Two words rather than one, for the reason English has them: *read* is its own past and
  // *play* is not, so one column would spell *I want to played it* on the one Type this exists
  // for. Asserted as a shape rather than on the videogame alone, so an eighth Type arriving
  // with one word filled in and the other left at the default is a failure here rather than a
  // sentence on a wall.
  it("carries both forms of that verb, as words", async () => {
    for (const one of await listTypes()) {
      expect(one.verbPast).toMatch(/^[a-z]+$/);
      expect(one.verbBase).toMatch(/^[a-z]+$/);
    }
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

// **The same answer, before the Binding has been chosen** (#48). At cataloguing time the
// Binding is a picker in the very form the narrative is being named in, so the offer cannot be
// asked for one Binding — it has to arrive for all of them, and the screen reads off it as the
// owner turns the picker.
describe("the Type each Binding offers", () => {
  beforeEach(async () => {
    await query("truncate story cascade");
  });

  it("answers for every Binding asked about, and for no Binding at all", async () => {
    await createStory({ title: "Gotham Noir", typeId: "comic" });

    expect(await theTypeEachBindingOffers(["tankobon", "stapled", "hardcover"])).toEqual({
      "": "comic",
      tankobon: "manga",
      stapled: "comic",
      hardcover: "comic",
    });
  });

  it("agrees with the one-Binding question it is the batch of", async () => {
    await createStory({ title: "Neuromancer", typeId: "novel" });

    const offers = await theTypeEachBindingOffers(["tankobon", "must-have"]);
    expect(offers.tankobon).toBe(await theTypeToOffer("tankobon"));
    expect(offers["must-have"]).toBe(await theTypeToOffer("must-have"));
    expect(offers[""]).toBe(await theTypeToOffer(null));
  });

  it("offers nothing where the library has nothing to go on and the Binding decides nothing", async () => {
    expect(await theTypeEachBindingOffers(["hardcover"])).toEqual({
      "": null,
      hardcover: null,
    });
  });
});
