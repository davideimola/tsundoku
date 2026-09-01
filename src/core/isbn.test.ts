import { describe, expect, it } from "vitest";
import { theIsbnItIs } from "./isbn.ts";

// **The licensed pure derivation, and the one in this repository with a *barcode* behind it.**
// Digits in, a reading out; no socket, no Postgres. What makes it worth its own file rather
// than a regex in a form handler is that the thing being read is a **camera's answer**, and a
// camera answers with whatever is pointed at it — the price sticker beside the ISBN, the
// periodical EAN on a Bonelli monthly, the barcode on the shop's loyalty card.
//
// Every case below is a barcode that really is on the back of a book the owner might be
// holding, and the point of each is that the wrong ones are refused **in the owner's words
// before anything is written**, rather than reaching Postgres and coming back as
// `volume_isbn_is_ten_or_thirteen_characters`.

describe("reading a 13-digit book barcode", () => {
  it("takes the digits of a real ISBN-13", () => {
    // One Piece 100, Star Comics — the ISBN the cover research measured against.
    expect(theIsbnItIs("9788822632753")).toEqual({ read: "isbn", isbn: "9788822632753" });
  });

  it("reads a printed ISBN with its hyphens, because that is how a book prints it", () => {
    expect(theIsbnItIs("978-88-6543-254-9")).toEqual({ read: "isbn", isbn: "9788865432549" });
  });

  it("reads one with spaces, and one a keyboard put a stray space on either end of", () => {
    expect(theIsbnItIs(" 978 88 2876 543 1 ")).toEqual({ read: "isbn", isbn: "9788828765431" });
  });

  it("reads the en dash a text scan hands over where the book printed a hyphen", () => {
    // Live Text on a phone returns typographic dashes from printed matter, and the owner
    // did not type them.
    expect(theIsbnItIs("978‑88‑6543‑254‑9")).toEqual({
      read: "isbn",
      isbn: "9788865432549",
    });
  });

  it("refuses a 13-digit barcode whose check digit does not add up", () => {
    const said = theIsbnItIs("9788822632754");

    expect(said.read).toBe("not-an-isbn");
    expect(said.read === "not-an-isbn" && said.because).toMatch(/check digit/i);
  });

  it("refuses the periodical EAN on a Bonelli monthly, and says what it is", () => {
    // Verified on the publisher's own product pages: `977112365904850039` is ISSN-derived and
    // there is no ISBN anywhere on the album. Nothing keyed by ISBN will ever find it, so the
    // refusal has to say so rather than repeat "13 digits" at somebody holding 18 of them.
    const said = theIsbnItIs("977112365904850039");

    expect(said.read).toBe("not-an-isbn");
    expect(said.read === "not-an-isbn" && said.because).toMatch(/periodical/i);
  });

  it("refuses a 977 barcode that is exactly 13 digits, which is the ISSN's own form", () => {
    const said = theIsbnItIs("9771123659048");

    expect(said.read).toBe("not-an-isbn");
    expect(said.read === "not-an-isbn" && said.because).toMatch(/periodical/i);
  });

  it("refuses a 13-digit barcode that is not a book at all", () => {
    // A shop's loyalty card, a packet of biscuits: a valid EAN-13 and not Bookland.
    const said = theIsbnItIs("4006381333931");

    expect(said.read).toBe("not-an-isbn");
    expect(said.read === "not-an-isbn" && said.because).toMatch(/978|979/);
  });
});

describe("reading a 10-digit ISBN, which is what an older book prints", () => {
  it("takes the digits", () => {
    expect(theIsbnItIs("8822632753")).toEqual({ read: "isbn", isbn: "8822632753" });
  });

  it("takes one whose check digit is the letter X, in either case", () => {
    expect(theIsbnItIs("880451003X")).toEqual({ read: "isbn", isbn: "880451003X" });
    expect(theIsbnItIs("880451003x")).toEqual({ read: "isbn", isbn: "880451003X" });
  });

  it("refuses one whose check digit does not add up", () => {
    const said = theIsbnItIs("8822632754");

    expect(said.read).toBe("not-an-isbn");
    expect(said.read === "not-an-isbn" && said.because).toMatch(/check digit/i);
  });

  // The ten-digit form is **kept as it was given** rather than widened to thirteen. The column
  // accepts either (`volume_isbn_is_ten_or_thirteen_characters`), a source keyed by ISBN takes
  // either, and rewriting what is printed on the object into a form that is not on it would be
  // this app inventing a fact about somebody's book.
  it("does not turn a ten into a thirteen", () => {
    expect(theIsbnItIs("8822632753")).toEqual({ read: "isbn", isbn: "8822632753" });
  });
});

describe("refusing what else a camera hands over", () => {
  it("names the price add-on beside the barcode for what it is", () => {
    // The second, shorter barcode printed to the right of the ISBN on a great many books.
    const said = theIsbnItIs("51299");

    expect(said.read).toBe("not-an-isbn");
    expect(said.read === "not-an-isbn" && said.because).toMatch(/price/i);
  });

  it("names the two-digit add-on as well", () => {
    const said = theIsbnItIs("12");

    expect(said.read).toBe("not-an-isbn");
    expect(said.read === "not-an-isbn" && said.because).toMatch(/price/i);
  });

  it("refuses letters in the middle, where only a trailing X means anything", () => {
    const said = theIsbnItIs("97888X632753");

    expect(said.read).toBe("not-an-isbn");
    expect(said.read === "not-an-isbn" && said.because).toMatch(/digits/i);
  });

  it("refuses nothing at all, which is a form submitted with an empty field", () => {
    const said = theIsbnItIs("   ");

    expect(said.read).toBe("not-an-isbn");
    expect(said.read === "not-an-isbn" && said.because).toBeTruthy();
  });

  it("says how many digits it was handed, because that is what the owner can check", () => {
    const said = theIsbnItIs("978882263275");

    expect(said.read).toBe("not-an-isbn");
    expect(said.read === "not-an-isbn" && said.because).toContain("12");
  });
});
