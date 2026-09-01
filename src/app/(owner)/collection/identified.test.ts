import { describe, expect, it } from "vitest";
import { whatFilledItIn, whereTheIsbnLeads } from "./identified.ts";

// **A screen's own derivation, tested beside itself** — the licence `vitest.config.ts` names,
// and the same one `./covers-found.ts` takes: data in, data out, a function this application
// would still have if React were replaced. No render, no database, no source.
//
// What it derives is **where a scanned ISBN leads**, and that is a screen's question rather
// than the model's: the core answers *what is on this ISBN* in five ways
// (`@/core/queries/isbn`), and which of those is a place, which is a form arriving
// half-filled, and which is a sentence beside the field is a fact about this app's addresses.
//
// The reason it is worth a file: **four of the five destinations are not the same page**, and
// getting one wrong is silent. An `already-catalogued` that led to a blank form would let the
// owner catalogue a second copy of the object they were holding the first of, which is the
// exact mistake the Inbox's striking verb exists to clean up (ADR-0014).

const ONE_PIECE = "9788822632753";

describe("where an ISBN the library already knows leads", () => {
  it("leads to the object's own page, because that is the answer to the question asked", () => {
    // *Do I already have this?* is answered by the object: its standing, its Series, its
    // Stories, its cover and the acts it offers are all on that page already, and nothing a
    // panel could say would be more than a worse copy of it.
    expect(
      whereTheIsbnLeads(ONE_PIECE, {
        it: "already-catalogued",
        isbn: ONE_PIECE,
        volumes: [
          {
            id: "3f6c1b2e-1111-4444-8888-aaaaaaaaaaaa",
            title: "One Piece 100",
            publisher: "Star Comics",
            inTheHouse: true,
          },
        ],
      })
    ).toBe("/collection/3f6c1b2e-1111-4444-8888-aaaaaaaaaaaa");
  });

  it("leads to the first of them where one ISBN was catalogued twice", () => {
    // Two objects on one ISBN is a duplicate rather than two books, and either page is the
    // answer — landing on one of them is what lets the owner see there are two.
    expect(
      whereTheIsbnLeads(ONE_PIECE, {
        it: "already-catalogued",
        isbn: ONE_PIECE,
        volumes: [
          {
            id: "11111111-1111-4444-8888-aaaaaaaaaaaa",
            title: "One Piece 100",
            publisher: "Star Comics",
            inTheHouse: true,
          },
          {
            id: "22222222-2222-4444-8888-aaaaaaaaaaaa",
            title: "One Piece 100",
            publisher: "Star Comics",
            inTheHouse: false,
          },
        ],
      })
    ).toBe("/collection/11111111-1111-4444-8888-aaaaaaaaaaaa");
  });
});

describe("where an ISBN the library has never seen leads", () => {
  it("opens the catalogue form with the record already in it", () => {
    const where = new URL(
      whereTheIsbnLeads(ONE_PIECE, {
        it: "a-record",
        isbn: ONE_PIECE,
        record: { title: "One piece 100", publisher: "Star Comics" },
      }),
      "https://tsundoku.test"
    );

    expect(where.pathname).toBe("/collection");
    expect(where.searchParams.get("panel")).toBe("catalogue");
    expect(where.searchParams.get("isbn")).toBe(ONE_PIECE);
    expect(where.searchParams.get("record")).toBe("One piece 100");
    expect(where.searchParams.get("publishedBy")).toBe("Star Comics");
    expect(where.searchParams.get("from")).toBe("sbn");
  });

  it("carries no publisher where the record had none, rather than an empty field", () => {
    const where = new URL(
      whereTheIsbnLeads(ONE_PIECE, {
        it: "a-record",
        isbn: ONE_PIECE,
        record: { title: "One piece 100", publisher: null },
      }),
      "https://tsundoku.test"
    );

    expect(where.searchParams.has("publishedBy")).toBe(false);
    expect(where.searchParams.get("record")).toBe("One piece 100");
  });

  it("opens the same form with only the ISBN where nothing is published under it", () => {
    const where = new URL(
      whereTheIsbnLeads(ONE_PIECE, { it: "no-record", isbn: ONE_PIECE }),
      "https://tsundoku.test"
    );

    expect(where.searchParams.get("panel")).toBe("catalogue");
    expect(where.searchParams.get("isbn")).toBe(ONE_PIECE);
    expect(where.searchParams.has("record")).toBe(false);
    expect(where.searchParams.get("from")).toBe("nothing");
  });

  it("says the source could not be asked, and does not call that an absent book", () => {
    // The two answers arrive at the same form and **say different things on it**, which is
    // the whole reason the core keeps them apart.
    const where = new URL(
      whereTheIsbnLeads(ONE_PIECE, {
        it: "unanswered",
        isbn: ONE_PIECE,
        because: "SBN answered 503.",
      }),
      "https://tsundoku.test"
    );

    expect(where.searchParams.get("from")).toBe("unanswered");
    expect(where.searchParams.get("isbn")).toBe(ONE_PIECE);
  });
});

describe("where a barcode that is not an ISBN leads", () => {
  it("comes back to the panel it was scanned in, with the refusal beside the field", () => {
    const where = new URL(
      whereTheIsbnLeads("977112365904850039", {
        it: "not-an-isbn",
        because: "That is a periodical's EAN rather than an ISBN.",
      }),
      "https://tsundoku.test"
    );

    expect(where.searchParams.get("panel")).toBe("isbn");
    expect(where.searchParams.get("refused")).toBe(
      "That is a periodical's EAN rather than an ISBN."
    );
  });

  it("keeps what was scanned in the field, so a misread digit is one keystroke from right", () => {
    const where = new URL(
      whereTheIsbnLeads("9788822632754", {
        it: "not-an-isbn",
        because: "The check digit does not add up.",
      }),
      "https://tsundoku.test"
    );

    expect(where.searchParams.get("isbn")).toBe("9788822632754");
  });
});

describe("what the prefilled form says about where its fields came from", () => {
  it("names the source, and asks the owner to check it against the object in their hand", () => {
    const said = whatFilledItIn("sbn");

    expect(said).toMatch(/SBN/);
    expect(said).toMatch(/check/i);
  });

  it("says the catalogue has nothing under this ISBN, which is not an error", () => {
    // Ordinary rather than exceptional: SBN holds legal deposit, and a volume out this month
    // may not be in it yet.
    expect(whatFilledItIn("nothing")).toMatch(/no record/i);
  });

  it("says the catalogue could not be asked, which is a different sentence", () => {
    const said = whatFilledItIn("unanswered");

    expect(said).toMatch(/could not be asked/i);
    expect(said).not.toMatch(/no record/i);
  });

  it("says nothing at all about a form the owner opened themselves", () => {
    expect(whatFilledItIn(undefined)).toBeNull();
    expect(whatFilledItIn("banana")).toBeNull();
  });
});
