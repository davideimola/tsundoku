import { describe, expect, it } from "vitest";
import {
  A_NARRATIVE_WITH_NO_NAME,
  THE_FIELDS_A_REFUSAL_CARRIES,
  THE_SENTENCES,
  theNarrativeAlreadyStanding,
  theNarrativesInside,
  theNarrativesNamedBefore,
  theSentence,
  whatFilledItIn,
  whatWasTyped,
  whereATitleLeads,
  whereTheBarcodeLeads,
} from "./door.ts";

// A screen's own derivation, tested beside itself: data in, data out, no render and no
// database. What is asserted is where the owner lands, because the door has one field and
// five answers behind it, and landing in the wrong place is the failure nothing else catches.

const ONE_PIECE = "9788822632753";

describe("what the one field held", () => {
  it("reads thirteen digits as a barcode", () => {
    expect(whatWasTyped(ONE_PIECE)).toEqual({ it: "a-barcode", digits: ONE_PIECE });
  });

  it("reads a printed ISBN's separators off before deciding", () => {
    expect(whatWasTyped("978-88-226-3275-3")).toEqual({ it: "a-barcode", digits: ONE_PIECE });
  });

  it("reads an older ten-digit ISBN, check letter and all, as a barcode", () => {
    expect(whatWasTyped("880451003x")).toEqual({ it: "a-barcode", digits: "880451003X" });
  });

  it("reads a title as a title", () => {
    expect(whatWasTyped("  Slam Dunk 21 ")).toEqual({ it: "a-title", title: "Slam Dunk 21" });
  });

  // The case the floor exists for: a novel called by a number is not a mis-scanned barcode,
  // and answering it with "an ISBN is 13 digits, that is 4" would be the door refusing the
  // plainest thing anybody types into it.
  it("reads a short run of digits as a title rather than as a broken ISBN", () => {
    expect(whatWasTyped("1984")).toEqual({ it: "a-title", title: "1984" });
  });

  it("reads a title carrying digits as a title", () => {
    expect(whatWasTyped("Slam Dunk 21")).toEqual({ it: "a-title", title: "Slam Dunk 21" });
  });
});

describe("where a title leads", () => {
  it("goes to the sentences", () => {
    expect(whereATitleLeads("Slam Dunk 21")).toBe("/add?title=Slam+Dunk+21");
  });

  it("carries the barcode it arrived with, so the object keeps its ISBN", () => {
    expect(whereATitleLeads("One Piece 1", { isbn: ONE_PIECE, from: "a-record" })).toBe(
      `/add?title=One+Piece+1&isbn=${ONE_PIECE}&from=a-record`
    );
  });
});

describe("where a barcode leads", () => {
  it("goes to the object itself where the library already knows it", () => {
    expect(
      whereTheBarcodeLeads(ONE_PIECE, {
        it: "already-catalogued",
        isbn: ONE_PIECE,
        volumes: [{ id: "9f2c", title: "One Piece 1", publisher: "Star Comics", inTheHouse: true }],
      })
    ).toBe("/collection/9f2c");
  });

  it("goes to the sentences with the title SBN gave, and says where it came from", () => {
    const where = whereTheBarcodeLeads(ONE_PIECE, {
      it: "a-record",
      isbn: ONE_PIECE,
      record: { title: "One Piece 1", publisher: "Star Comics" },
    });

    const asked = new URLSearchParams(where.slice("/add?".length));
    expect(asked.get("title")).toBe("One Piece 1");
    expect(asked.get("isbn")).toBe(ONE_PIECE);
    expect(asked.get("from")).toBe("a-record");
  });

  // An ISBN and no title is a question rather than a form with an empty first field: back to
  // the one field, which now asks what it is called, with the digits remembered underneath.
  it.each(["no-record", "unanswered"] as const)("comes back to the field on %s", (it_) => {
    const where = whereTheBarcodeLeads(ONE_PIECE, {
      it: it_,
      isbn: ONE_PIECE,
      because: "SBN did not answer.",
    } as never);

    const asked = new URLSearchParams(where.slice("/add?".length));
    expect(asked.get("isbn")).toBe(ONE_PIECE);
    expect(asked.get("from")).toBe(it_);
    expect(asked.get("title")).toBeNull();
  });

  // The refusal names which barcode the owner is holding, and it belongs beside the field
  // they read it into — never recorded as the name of a narrative.
  it("comes back to the field with the prose when the barcode is not an ISBN", () => {
    const where = whereTheBarcodeLeads("977112365904850039", {
      it: "not-an-isbn",
      because: "That is a periodical's EAN rather than an ISBN.",
    });

    const asked = new URLSearchParams(where.slice("/add?".length));
    expect(asked.get("asked")).toBe("977112365904850039");
    expect(asked.get("refused")).toBe("That is a periodical's EAN rather than an ISBN.");
    expect(asked.get("title")).toBeNull();
  });
});

describe("what filled it in", () => {
  it("says to check a record against the object in hand", () => {
    expect(whatFilledItIn("a-record")).toMatch(/check it/i);
  });

  it("tells an absence from a source that could not be asked", () => {
    expect(whatFilledItIn("no-record")).toMatch(/no record/i);
    expect(whatFilledItIn("unanswered")).toMatch(/could not be asked/i);
    expect(whatFilledItIn("no-record")).not.toBe(whatFilledItIn("unanswered"));
  });

  it("says nothing where the owner typed the title themselves", () => {
    expect(whatFilledItIn(undefined)).toBeNull();
    expect(whatFilledItIn("banana")).toBeNull();
  });
});

describe("the sentences", () => {
  // The object first and the narrative after, and inside each pair the fact before the
  // intention: what the door is opened for in a shop is under the thumb.
  it("offers four, and every one of them says what it writes at two lengths", () => {
    expect(THE_SENTENCES.map((one) => one.said)).toEqual(["bought", "wished", "read", "wanted"]);

    for (const one of THE_SENTENCES) {
      expect(one.records).not.toBe("");
      expect(one.atLength).not.toBe("");
    }
  });

  it("finds the one a panel names, and none where it names nothing", () => {
    expect(theSentence("read")?.sentence).toBe("I read it.");
    expect(theSentence("banana")).toBeUndefined();
    expect(theSentence(undefined)).toBeUndefined();
  });
});

// A refusal is a sentence about one field and every other field was right, so the panel comes
// back carrying what was typed into it. The list is spelled by the action that sends it and by
// the page that reads it back, in opposite directions.
describe("what a refused press carries back", () => {
  it("names each field once", () => {
    expect(new Set(THE_FIELDS_A_REFUSAL_CARRIES).size).toBe(THE_FIELDS_A_REFUSAL_CARRIES.length);
  });

  // The door carries the title itself, and sending it twice would put two fields called
  // `title` in one address — the collision `../stories/panels.ts` was written for.
  it("leaves the door's own facts to the door", () => {
    for (const carried of ["title", "from", "publishedBy", "panel", "refused"]) {
      expect(THE_FIELDS_A_REFUSAL_CARRIES).not.toContain(carried);
    }
  });
});

// **The default is shown rather than written** (#48, ADR-0019). What used to be a Story minted
// from the volume's title behind the owner's back is now a row standing in a list in front of
// them, and this is the function that decides what that row says.
describe("the narrative an object is shown as holding", () => {
  it("is the work the chosen line publishes, and not a new title", () => {
    expect(
      theNarrativeAlreadyStanding("Slam Dunk 21", { id: "a-story-id", title: "Slam Dunk" })
    ).toEqual({ it: "a-story", storyId: "a-story-id", title: "Slam Dunk" });
  });

  // The case the whole slice is about: the omnibus, the graphic novel and the novel are the
  // only objects the silent default ever reached, and on a novel it is right.
  it("is the volume's own title where the line names no work, or there is no line", () => {
    expect(theNarrativeAlreadyStanding("Neuromancer", null)).toMatchObject({
      it: "a-title",
      title: "Neuromancer",
    });
    expect(theNarrativeAlreadyStanding("Neuromancer", undefined)).toMatchObject({
      it: "a-title",
      title: "Neuromancer",
    });
  });

  it("stands nothing at all where the door has heard no title", () => {
    expect(theNarrativeAlreadyStanding("   ", null)).toBeNull();
  });

  // A line wins over the title even before a title is typed, because the arrow is a fact about
  // the object in front of the owner and the title is what they are still deciding.
  it("lets the line answer even with nothing typed", () => {
    expect(theNarrativeAlreadyStanding("", { id: "a-story-id", title: "Slam Dunk" })).toMatchObject(
      { it: "a-story" }
    );
  });
});

describe("what the object half submits about what is inside it", () => {
  it("splits the rows into the Stories to link and the titles to mint", () => {
    expect(
      theNarrativesInside([
        { it: "a-story", storyId: "gotham", title: "Gotham Noir" },
        { it: "a-title", key: "one", title: "L'uomo che ride" },
        { it: "a-title", key: "two", title: "Uomo di legno" },
      ])
    ).toEqual({
      stories: [{ storyId: "gotham", title: "Gotham Noir" }],
      newStories: ["L'uomo che ride", "Uomo di legno"],
    });
  });

  // A row typed over to nothing is a row on its way to saying something else, not a refusal.
  // What is refused is nothing being left at all, and the core says that in its own words.
  it("drops a title with nothing in it, and trims the rest", () => {
    expect(
      theNarrativesInside([
        { it: "a-title", key: "one", title: "   " },
        { it: "a-title", key: "two", title: "  Uomo di legno " },
      ])
    ).toEqual({ stories: [], newStories: ["Uomo di legno"] });
  });

  it("says the same narrative once however many rows say it", () => {
    expect(
      theNarrativesInside([
        { it: "a-story", storyId: "gotham", title: "Gotham Noir" },
        { it: "a-story", storyId: "gotham", title: "Gotham Noir" },
        { it: "a-title", key: "one", title: "Uomo di legno" },
        { it: "a-title", key: "two", title: "uomo di legno" },
      ])
    ).toEqual({
      stories: [{ storyId: "gotham", title: "Gotham Noir" }],
      newStories: ["Uomo di legno"],
    });
  });

  // The two directions are one list, and they are written and read by two different files: a
  // refused press that lost an omnibus's three tales would answer the owner by asking for the
  // most expensive thing on the screen again.
  it("comes back off a refused press as the rows it was", () => {
    const named = [
      { it: "a-story", storyId: "gotham", title: "Gotham Noir" },
      { it: "a-title", key: "one", title: "Uomo di legno" },
    ] as const;

    const sent = theNarrativesInside(named);
    const back = theNarrativesNamedBefore(
      sent.stories.map((one) => one.storyId),
      sent.stories.map((one) => one.title),
      sent.newStories
    );

    expect(theNarrativesInside(back)).toEqual(sent);
    expect(back).toMatchObject([
      { it: "a-story", storyId: "gotham", title: "Gotham Noir" },
      { it: "a-title", title: "Uomo di legno" },
    ]);
  });

  it("reads a row back under a name rather than under an id where the pair came apart", () => {
    expect(theNarrativesNamedBefore(["gotham"], [], [])).toEqual([
      { it: "a-story", storyId: "gotham", title: A_NARRATIVE_WITH_NO_NAME },
    ]);
  });
});
