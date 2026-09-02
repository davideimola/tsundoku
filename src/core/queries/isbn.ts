import "server-only";

import { query } from "../db.ts";
import { theIsbnItIs } from "../isbn.ts";
import { type AskAboutAnIsbn, askSbnAboutAnIsbn, type BookRecord } from "../records.ts";
import { IN_THE_HOUSE } from "./collection.ts";

// WHAT IS ON THIS ISBN — and, like `queries/finder.ts`, **a question that is not an area's**,
// which is why it is a file named after the question (`../README.md`). It reads the catalogue
// and it asks a source, and putting it in `queries/collection.ts` would make it a Collection
// query that reaches somebody else's server.
//
// It is one question with a definite order, and the order is the feature:
//
//   1. **Is this an ISBN at all?** The field is now filled in by a camera as well as by a
//      keyboard, and a camera answers with whatever it was pointed at — the price add-on
//      beside the barcode, the periodical EAN on a Bonelli monthly, the shop's own loyalty
//      card. `../isbn.ts` is that reading, and the refusal it writes names which barcode the
//      owner is holding.
//   2. **Does the library already know it?** One round trip to Postgres, before anybody's
//      network is involved. This is *the* question the Collection exists to answer — "do I
//      already have this?", asked standing in a shop — and an ISBN is the one key that
//      answers it without a judgement call about whether two titles are the same object.
//   3. **Only then, what does the catalogue of record say it is**, so that the form the owner
//      is about to fill in arrives with the title and the publisher already in it.
//
// Step 2 short-circuiting step 3 is deliberate and is worth more than the request it saves: a
// lookup that asked SBN first would spend the shop's signal, and several seconds of somebody
// standing up holding a book, to fill in a form for an object that is already on their shelf.
//
// The source arrives as an argument the way `AskForACover` does, so **no test here calls a
// third party** and the two answers that matter — a catalogue that is down, and an ISBN
// nothing was published under — are exactly the two a live source would not produce on demand.
//
// **There are two questions in here now, and the second is the first with its middle step
// taken out.** `whatIsPublishedUnderThisIsbn` is asked from the page of an object the
// owner is already holding — so *does the library know this?* is not a question worth a round
// trip: the answer is yes, and it is the record on screen. What is wanted there is the third
// step alone, which is the catalogue of record's own account of the object, read against the
// one this library kept.
//
// They are two exports over one shared step rather than one export with a flag, because the
// **answers** differ and not merely the work: an ISBN scanned in a shop can turn out to be an
// object already on the shelf, and an ISBN scanned off the object whose page you are standing
// on cannot. A boolean would have left every caller of the shop question handling an answer it
// can get, and every caller of this one handling an answer it cannot.

/** An object the library already holds on this ISBN. */
export type VolumeOnThisIsbn = {
  readonly id: string;
  readonly title: string;
  readonly publisher: string;
  /** Whether it is on the shelf now, which is a different fact from being catalogued. */
  readonly inTheHouse: boolean;
};

/**
 * What an ISBN turned out to be. **Five answers**, because the four that are not a record are
 * each a different thing to do next, and a screen that collapsed them would tell the owner to
 * check their typing when the catalogue of record was down.
 */
export type WhatIsOnThisIsbn =
  /** Not an ISBN, and `because` says which barcode it is instead. */
  | { readonly it: "not-an-isbn"; readonly because: string }
  /** The library knows this object already — the answer the shop question wants. */
  | {
      readonly it: "already-catalogued";
      readonly isbn: string;
      readonly volumes: readonly VolumeOnThisIsbn[];
    }
  /** New to the library, and whatever the catalogue of record had to say about it. */
  | WhatTheCatalogueSaid;

/**
 * What the catalogue of record said about an ISBN. **Three answers and not two**, for
 * `../records.ts`'s reason: a source that could not be asked has said nothing about the book,
 * and writing that down as *nothing is published under this number* is the cover research's
 * false 0% happening again where it changes a decision.
 *
 * It is a type of its own because both questions in this file end in it.
 */
export type WhatTheCatalogueSaid =
  /** The catalogue of record says what it is. */
  | { readonly it: "a-record"; readonly isbn: string; readonly record: BookRecord }
  /** Nothing is published under it that the source knows of. */
  | { readonly it: "no-record"; readonly isbn: string }
  /** The source could not be asked. **Not** the same as `no-record`. */
  | { readonly it: "unanswered"; readonly isbn: string; readonly because: string };

/**
 * What an object's own page got back when it asked. The three answers above, plus the barcode
 * that is not an ISBN at all — which on that screen is a camera pointed a centimetre to the
 * right, and is the one answer that is about the *press* rather than about the book.
 */
export type WhatIsPublishedUnderThisIsbn =
  | { readonly it: "not-an-isbn"; readonly because: string }
  | WhatTheCatalogueSaid;

/**
 * What is published under an ISBN, according to the catalogue of record and nobody else.
 *
 * **The question an object's own page asks**: the owner is standing on the record of a
 * thing they are holding, and what they want is the catalogue's account of it — to fill in
 * what this library never had and to correct what it got wrong. So the library is not
 * consulted, because the library's answer is the page the question was asked from.
 *
 * The ISBN is read leniently here for the same reason it is below, and more so: this is the
 * door a camera speaks through on that screen, and a camera answers with whatever it was
 * pointed at. A price add-on or a Bonelli monthly's periodical EAN comes back as
 * `not-an-isbn` naming which barcode is in front of the owner — before anything is written
 * and before anybody's network is asked.
 */
export async function whatIsPublishedUnderThisIsbn(
  typed: string,
  ask: AskAboutAnIsbn = askSbnAboutAnIsbn
): Promise<WhatIsPublishedUnderThisIsbn> {
  const reading = theIsbnItIs(typed);
  if (reading.read === "not-an-isbn") {
    return { it: "not-an-isbn", because: reading.because };
  }

  return whatTheCatalogueSays(reading.isbn, ask);
}

/**
 * Ask the source, and turn its three answers into this file's three. **Shared by both
 * questions**, which is what keeps *a catalogue that is down is not a book that does not
 * exist* one sentence in one place rather than two copies that can come to disagree.
 */
async function whatTheCatalogueSays(
  isbn: string,
  ask: AskAboutAnIsbn
): Promise<WhatTheCatalogueSaid> {
  const said = await ask(isbn);
  if (said.answer === "found") return { it: "a-record", isbn, record: said.record };
  if (said.answer === "none") return { it: "no-record", isbn };
  return { it: "unanswered", isbn, because: said.because };
}

/**
 * Ask what is on an ISBN: the owner's own catalogue first, then the world's.
 *
 * The ISBN is read leniently and the column stays strict, which is on purpose. What arrives
 * here has been through a camera or a phone's text scan, so hyphens, spaces and typographic
 * dashes are ordinary; what is *stored* is bare digits, because
 * `volume_isbn_is_ten_or_thirteen_characters` refuses anything else and an amendment proposing
 * a prettified ISBN is refused by name (`verbs/collection.test.ts`). So the leniency lives at
 * the door a camera speaks through, and the answer it hands back — `isbn` below — is already
 * in the form the catalogue accepts.
 */
export async function whatIsOnThisIsbn(
  typed: string,
  ask: AskAboutAnIsbn = askSbnAboutAnIsbn
): Promise<WhatIsOnThisIsbn> {
  const reading = theIsbnItIs(typed);
  if (reading.read === "not-an-isbn") {
    return { it: "not-an-isbn", because: reading.because };
  }

  const { isbn } = reading;

  // `upper` on both sides because the column accepts a lower-case check letter (`880451003x`)
  // and this reading upper-cases it: two spellings of one ISBN would otherwise be two objects.
  const known = await query<VolumeOnThisIsbn>(
    `select v.id, v.title, v.publisher, ${IN_THE_HOUSE} as "inTheHouse"
       from volume v
      where upper(v.isbn) = upper($1)
      order by v.title, v.id`,
    [isbn]
  );

  if (known.length > 0) return { it: "already-catalogued", isbn, volumes: known };

  return whatTheCatalogueSays(isbn, ask);
}
