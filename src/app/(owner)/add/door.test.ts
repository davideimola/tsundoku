import { describe, expect, it } from "vitest";
import {
  aboutAnObject,
  THE_FIELDS_A_REFUSAL_CARRIES,
  THE_HALVES,
  THE_SENTENCES,
  THE_TWO_MEDIA,
  theMediumPressed,
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

  // #50: the narrative half asks the medium, so the sentence that records a pass stops
  // promising the digital case at both lengths. What is asserted is the promise rather than
  // the wording — a sentence saying *this is what a digital read is* under a form offering
  // paper is one act described two ways.
  it("promises no medium in the sentence that asks for one", () => {
    const read = theSentence("read");

    expect(`${read?.records} ${read?.atLength}`).toMatch(/paper/i);
    expect(read?.records).not.toMatch(/the digital case needs nothing more/i);
    expect(read?.atLength).not.toMatch(/which is what a digital read is/i);
  });

  // And it still promises no object, because that is the half's own fact and the one thing
  // this door does not ask: a pass knows the object it went through only if there was one.
  it("still says the pass went through no object", () => {
    expect(theSentence("read")?.records).toMatch(/no object/i);
  });

  it("finds the one a panel names, and none where it names nothing", () => {
    expect(theSentence("read")?.sentence).toBe("I read it.");
    expect(theSentence("banana")).toBeUndefined();
    expect(theSentence(undefined)).toBeUndefined();
  });
});

// THE TWO HALVES (#49). The same four sentences and the same one press each, grouped by which
// of the two things they are about. What is asserted is that the grouping is a *reading* of the
// four rather than a second copy of them: a sentence added to the model lands in a half without
// anybody editing a second list, and a heading cannot come to name a record.
describe("the two halves the sentences stand in", () => {
  it("names the object and the narrative, in that order", () => {
    expect(THE_HALVES.map((half) => half.about)).toEqual(["an-object", "a-narrative"]);
    expect(THE_HALVES.map((half) => half.heading)).toEqual(["The object", "The narrative"]);
  });

  it("holds every sentence exactly once, in the order the door offers them", () => {
    expect(THE_HALVES.flatMap((half) => half.sentences)).toEqual([...THE_SENTENCES]);
  });

  it("puts the fact before the intention inside each half", () => {
    expect(THE_HALVES.map((half) => half.sentences.map((one) => one.said))).toEqual([
      ["bought", "wished"],
      ["read", "wanted"],
    ]);
  });

  // The halves are named for what they are about and never for what they write, which is the
  // one thing #49 asks of the copy: *The object*, not *Volume and Wish*.
  it("says what each half is about without naming a record", () => {
    for (const half of THE_HALVES) {
      expect(half.says).not.toBe("");

      for (const word of ["Volume", "Story", "Wish", "Want", "Pass", "Acquisition"]) {
        expect(`${half.heading} ${half.says}`).not.toContain(word);
      }
    }
  });

  it("reads which of the two a press is, off the halves rather than off a second pair", () => {
    expect(THE_HALVES[0].sentences.map((one) => one.said)).toEqual(["bought", "wished"]);

    expect(aboutAnObject("bought")).toBe(true);
    expect(aboutAnObject("wished")).toBe(true);
    expect(aboutAnObject("read")).toBe(false);
    expect(aboutAnObject("wanted")).toBe(false);
  });
});

// WHICH MEDIUM THE PANEL OPENS ON (#50). The narrative half's one field, and the one place a
// default still stands on this screen — so it is here rather than inside the control, where
// nothing could read it back. What is asserted is the default itself, because *defaulting to
// digital* is a line of the ticket rather than a detail of a radio.
describe("which medium a pass is offered as", () => {
  it("opens on digital where the owner has pressed nothing", () => {
    expect(theMediumPressed(undefined)).toBe("digital");
  });

  it("opens on what a refused press carried back", () => {
    expect(theMediumPressed("paper")).toBe("paper");
    expect(theMediumPressed("digital")).toBe("digital");
  });

  // Read against the two rather than trusted, which is what `theSentence` does with `?panel=`.
  // It cannot come off the form — it comes off a hand-edited address — and an unreadable answer
  // is no answer rather than a third medium posted at the verb.
  it("reads an address naming neither as no answer at all", () => {
    expect(theMediumPressed("audiobook")).toBe("digital");
    expect(theMediumPressed("")).toBe("digital");
  });

  it("offers both, in the order the two presses stand in", () => {
    expect(THE_TWO_MEDIA.map((medium) => medium.value)).toEqual(["paper", "digital"]);

    for (const medium of THE_TWO_MEDIA) expect(medium.label).not.toBe("");
  });
});

// A refusal is a sentence about one field and every other field was right, so the panel comes
// back carrying what was typed into it. The list is spelled by the action that sends it and by
// the page that reads it back, in opposite directions.
describe("what a refused press carries back", () => {
  it("names each field once", () => {
    expect(new Set(THE_FIELDS_A_REFUSAL_CARRIES).size).toBe(THE_FIELDS_A_REFUSAL_CARRIES.length);
  });

  // #50. The medium is a field like the Type beside it: a press refused for a blank title or
  // a Type nobody chose comes back with the radio the owner pressed still pressed, because a
  // refusal is a sentence about one field and every other answer was right.
  it("carries the medium a pass was said to have gone by", () => {
    expect(THE_FIELDS_A_REFUSAL_CARRIES).toContain("medium");
  });

  // The door carries the title itself, and sending it twice would put two fields called
  // `title` in one address — the collision `../stories/panels.ts` was written for.
  it("leaves the door's own facts to the door", () => {
    for (const carried of ["title", "from", "publishedBy", "panel", "refused"]) {
      expect(THE_FIELDS_A_REFUSAL_CARRIES).not.toContain(carried);
    }
  });
});
