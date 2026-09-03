import { describe, expect, it } from "vitest";
import {
  THE_FIELDS_A_REFUSAL_CARRIES,
  THE_SENTENCES,
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
