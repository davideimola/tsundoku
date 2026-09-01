import "server-only";

// WHAT AN ISBN IS, and — the reason this is a file rather than a regex on a form handler —
// **what else a camera hands over when it is pointed at the back of a book.**
//
// The ISBN used to arrive here one way: typed into a field by the owner, at a desk, from the
// object in their hand. It now arrives a second way, from a barcode read in a shop, and the
// two fail differently. A typed ISBN fails by being short a digit. A *scanned* one fails by
// being **the wrong barcode entirely** — the price add-on printed beside it, the ISSN-derived
// EAN on a Bonelli monthly, the loyalty card the phone found first — and each of those is
// thirteen-ish digits that a length check waves straight through.
//
// So this answers with a **reading** rather than a boolean, and a refusal says which barcode
// the owner is holding. That is the whole difference between an app that helps in a shop and
// one that answers "invalid ISBN" at somebody standing up, one-handed, with a book.
//
// Three of the four refusals are facts out of `docs/research/cover-images-by-isbn.md`:
//
//   977…   is a **periodical**. Bonelli's monthly albi carry `977112365904850039` and no ISBN
//          anywhere on the object, verified on the publisher's own product pages. Nothing
//          keyed by ISBN will ever find one, which is why the refusal says so instead of
//          asking for thirteen digits: the owner is not one digit away, they are holding a
//          thing this scheme does not name.
//   978/979 is Bookland, and everything else in the EAN space is some other product.
//   2 or 5  digits is the add-on barcode — the price — printed beside the ISBN's own.
//
// **Nothing here is thrown.** A `Refusal` is what a verb raises when Postgres or a rule says
// no to a *write*; this is a reading of a value, and the caller wants both answers as data —
// the panel that asked puts the prose beside the field, and the same prose would be a 500 if
// it were an exception nobody caught.

/** What was read out of what the owner typed, or out of what the camera saw. */
export type IsbnReading =
  | {
      readonly read: "isbn";
      /**
       * The digits, separators removed and a check letter upper-cased — **in the length it
       * was given in.** A ten is not widened to a thirteen: the column takes either, both
       * sources take either, and rewriting what is printed on the object into a form that is
       * not on it would be this app inventing a fact about somebody's book.
       */
      readonly isbn: string;
    }
  | { readonly read: "not-an-isbn"; readonly because: string };

// What a printed ISBN, a keyboard and a text scan put between the digits. The last two are
// the typographic dashes Live Text returns from printed matter — the owner did not type
// them, and refusing them would be refusing the phone's own answer.
const SEPARATORS = /[\s-‐‑‒–—−]/g;

/** Digits, or nine digits and the check letter an older ISBN is allowed to end with. */
const DIGITS = /^[0-9]+$/;
const NINE_AND_A_CHECK_LETTER = /^[0-9]{9}X$/;

/**
 * Read an ISBN out of what arrived — typed, pasted, or written into the field by the scanner.
 *
 * The order of the refusals is deliberate and is the interesting part: **which barcode is
 * this?** is asked before **is it well formed?**, because a periodical EAN is not a broken
 * ISBN and telling its owner to check the check digit is telling them to look for something
 * that is not there.
 */
export function theIsbnItIs(typed: string): IsbnReading {
  const given = typed.replace(SEPARATORS, "").toUpperCase();

  if (given === "")
    return { read: "not-an-isbn", because: "Nothing to look up: type or scan an ISBN." };

  if (!DIGITS.test(given) && !NINE_AND_A_CHECK_LETTER.test(given)) {
    return {
      read: "not-an-isbn",
      because:
        "An ISBN is digits, and only a ten-digit one may end in an X. Read it again, or type it from the book.",
    };
  }

  // Before any length: what this barcode *is*. A monthly albo's EAN is 18 digits, an ISSN's
  // own form is 13, and both start 977 — so the prefix is the question and the length is not.
  if (given.startsWith("977")) {
    return {
      read: "not-an-isbn",
      because:
        "That is a periodical's EAN rather than an ISBN. A Bonelli monthly carries one of these and no ISBN at all, so no lookup will ever find it: catalogue it by hand, and the only thing that will ever face it is your own photograph.",
    };
  }

  if (given.length === 2 || given.length === 5) {
    return {
      read: "not-an-isbn",
      because: `${given.length} digits is the price add-on printed beside the barcode, not the ISBN — the ISBN is the longer one next to it.`,
    };
  }

  if (given.length === 13) {
    if (!given.startsWith("978") && !given.startsWith("979")) {
      return {
        read: "not-an-isbn",
        because: `A book's barcode starts 978 or 979. That one starts ${given.slice(0, 3)}, so it belongs to some other product.`,
      };
    }
    return checkDigitAddsUp(given, thirteenAddsUp(given));
  }

  if (given.length === 10) return checkDigitAddsUp(given, tenAddsUp(given));

  return {
    read: "not-an-isbn",
    because: `An ISBN is 13 digits, or 10 on an older book. That is ${given.length}.`,
  };
}

/** One sentence for both lengths, because it is one mistake: a digit was misread. */
function checkDigitAddsUp(given: string, addsUp: boolean): IsbnReading {
  if (addsUp) return { read: "isbn", isbn: given };
  return {
    read: "not-an-isbn",
    because:
      "The check digit does not add up, so one of the digits was misread. Scan it again, or type it from the book.",
  };
}

/** EAN-13: alternating weights of 1 and 3, and the whole thing is a multiple of ten. */
function thirteenAddsUp(given: string): boolean {
  let sum = 0;
  for (let at = 0; at < 13; at += 1) sum += Number(given[at]) * (at % 2 === 0 ? 1 : 3);
  return sum % 10 === 0;
}

/** ISBN-10: weights ten down to one, modulo eleven, and `X` is the digit worth ten. */
function tenAddsUp(given: string): boolean {
  let sum = 0;
  for (let at = 0; at < 10; at += 1) {
    const digit = given[at] === "X" ? 10 : Number(given[at]);
    sum += digit * (10 - at);
  }
  return sum % 11 === 0;
}
