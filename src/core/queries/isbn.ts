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
  /** New to the library, and the catalogue of record says what it is. */
  | { readonly it: "a-record"; readonly isbn: string; readonly record: BookRecord }
  /** New to the library, and nothing is published under it that the source knows of. */
  | { readonly it: "no-record"; readonly isbn: string }
  /** New to the library, and the source could not be asked. **Not** the same as `no-record`. */
  | { readonly it: "unanswered"; readonly isbn: string; readonly because: string };

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

  const said = await ask(isbn);
  if (said.answer === "found") return { it: "a-record", isbn, record: said.record };
  if (said.answer === "none") return { it: "no-record", isbn };
  return { it: "unanswered", isbn, because: said.because };
}
