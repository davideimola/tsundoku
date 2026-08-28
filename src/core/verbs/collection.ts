import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";

// Writing the catalogue and writing the Collection are **two acts**, and this file is
// where they came apart (ADR-0007).
//
// `acquireVolume` used to do both at once: one insert recorded the object *and* claimed it
// was in the house, so every Volume the library knew was in the Collection and a Wish
// could only ever name something the owner already had. Cataloguing an object — this is
// what it is, this is how it is bound, this is its ISBN — is not the same as having it,
// so:
//
//   catalogueVolume  the object enters the library's knowledge
//   acquireVolume    it is in the house, from a day, at a price
//   releaseVolume    it is not any more, and the record is kept
//
// One verb is one transaction, so a caller wanting both says both (`verbs/README.md`).
// That is deliberate rather than an inconvenience: the two are separate facts, and the
// screen that records a Volume in a shop asks for them in one breath because *that* is
// where they happen to coincide.

/** What the owner records about an object: everything about the thing, nothing about the narrative. */
export type CataloguedVolume = {
  title: string;
  publisher: string;
  /** The publisher's line, where there is one. */
  editionLine?: string | null;
  /** A Binding id — `tankobon`, `omnibus`, `must-have`. */
  binding: string;
  /** A language code: `it`, `en`, `ja`. */
  language: string;
  isbn?: string | null;
};

// The two values Postgres *parses* rather than checks, and therefore the two the database
// cannot refuse politely: a price and a day arrive as text and become `numeric` and `date`
// on the way in, and `6,50` or `11/03/2024` raises a syntax error rather than an integrity
// violation. `refusing` deliberately does not launder a syntax error into an answer — it is
// usually our bug — so the shape is checked here instead, and the owner reads prose rather
// than meeting a 500 with their whole entry gone.
const AMOUNT = /^[0-9]+([.][0-9]{1,2})?$/;
const DAY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

// A Volume's id is generated, so the owner never types one: what arrives here came from
// the Collection the caller was just looking at, or from an assistant reading it over
// MCP. A malformed one is therefore the same event as an unknown one — nothing to act on
// — and this keeps it that way, because `where id = $1` on a uuid column raises a *syntax*
// error for `"banana"`, which is not a refusal and would reach an adapter as a 500.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_SUCH_VOLUME = "No Volume has that id.";

/**
 * Record what an object is: the library knows it from now on. Returns its id.
 *
 * **It does not join the Collection.** Being catalogued and being in the house are two
 * facts (ADR-0007), and this is the first one — which is what lets a Wish name a Volume
 * the owner does not own, and what lets the import read the wishlist without claiming
 * twenty-one books off the shelf. `acquireVolume` is the other act.
 *
 * Nothing about the reading follows from it either — no Story, no Reading, no Rating —
 * because being read and being owned are unrelated facts (ADR-0001). There is no medium to
 * give: an owned ebook is not representable, so a digital book is a Reading and never this.
 */
export async function catalogueVolume(volume: CataloguedVolume): Promise<{ id: string }> {
  const rows = await refusing(
    () =>
      query<{ id: string }>(
        `insert into volume (title, publisher, edition_line, binding_id, language, isbn)
         values ($1, $2, $3, $4, $5, $6)
         returning id`,
        [
          volume.title,
          volume.publisher,
          volume.editionLine ?? null,
          volume.binding,
          volume.language,
          volume.isbn ?? null,
        ]
      ),
    (constraint) => {
      switch (constraint) {
        case "volume_binding_id_fkey":
          return "That is not a Binding. The pickers offer the ones the model knows.";
        case "volume_title_is_not_blank":
          return "A Volume needs the title printed on it.";
        case "volume_publisher_is_not_blank":
          return "A Volume needs its publisher.";
        case "volume_edition_line_is_not_blank":
          return "Leave the edition line empty rather than blank: most volumes are the standard printing.";
        case "volume_language_is_a_code":
          return "A language is a code like it, en or ja.";
        case "volume_isbn_is_ten_or_thirteen_characters":
          return "An ISBN is 10 or 13 characters with no spaces or dashes.";
        default:
          return "That Volume could not be catalogued.";
      }
    }
  );

  return rows[0];
}

/** The fact that a catalogued Volume is in the house, as the owner records it. */
export type MadeAcquisition = {
  /** The Volume that came home. It must already be catalogued. */
  volumeId: string;
  /**
   * The day it came home, `YYYY-MM-DD`. Optional: a Volume owned since before any of this
   * was written down has no receipt, and the fact does not depend on the day.
   */
  acquiredOn?: string | null;
  /** What was paid for *this* acquisition, as the owner typed it: `24.90`. */
  pricePaid?: string | null;
};

/**
 * Record that a catalogued Volume is in the owner's house: it joins the Collection.
 *
 * The second of the two acts (ADR-0007). It names a Volume the library already knows and
 * never catalogues one — an object nobody recorded is `catalogueVolume`'s to record, or an
 * Inbox proposal where MCP is asking (ADR-0005).
 *
 * Said again on a Volume already in the house it is refused, because the Collection would
 * otherwise claim one object twice and there would be no answer to *what did I pay*. Said
 * again after a release it is a **second acquisition**, which is the real event: sold, then
 * bought again.
 */
export async function acquireVolume(acquisition: MadeAcquisition): Promise<void> {
  if (!UUID.test(acquisition.volumeId)) {
    throw new Refusal("not-found", NO_SUCH_VOLUME);
  }
  if (acquisition.pricePaid && !AMOUNT.test(acquisition.pricePaid)) {
    throw new Refusal("invalid", "A price is written with a dot and no currency: 6.50.");
  }
  if (acquisition.acquiredOn && !DAY.test(acquisition.acquiredOn)) {
    throw new Refusal("invalid", "A purchase date is a day, written 2024-03-11.");
  }

  await refusing(
    () =>
      query(`insert into acquisition (volume_id, acquired_on, price_paid) values ($1, $2, $3)`, [
        acquisition.volumeId,
        acquisition.acquiredOn ?? null,
        acquisition.pricePaid ?? null,
      ]),
    (constraint) => {
      switch (constraint) {
        case "acquisition_volume_exists":
          return NO_SUCH_VOLUME;
        case "acquisition_one_open_per_volume":
          return "That Volume is already in the house.";
        case "acquisition_price_paid_is_not_negative":
          return "A price paid is not negative. Leave it empty if the receipt is gone.";
        // The Series ledger's own invariant, which acquiring is one of the two ways to
        // break: the object is placed at a position the house already holds one of.
        case "volume_is_one_per_number_in_a_series":
          return "That position of the Series is already in the house.";
        default:
          return "That Volume could not be acquired.";
      }
    }
  );
}

/**
 * Record that a Volume left the owner's hands: the acquisition ends today, and the
 * Collection stops claiming it.
 *
 * The catalogue keeps the object and the acquisition keeps its history rather than being
 * deleted. A Reading made through it, and the Edition note written about it, are facts
 * about the owner's past that a delete would take with them — so what changes is only
 * whether the Collection answers with it. Acquiring it again later is a new acquisition.
 *
 * Refused on a Volume the Collection does not claim, rather than passing silently: it is
 * not in the house already, so a release is a mistake worth naming — and the two ways of
 * not being in it are told apart, because one of them means the owner is looking at the
 * wrong object.
 */
export async function releaseVolume(volumeId: string): Promise<void> {
  if (!UUID.test(volumeId)) {
    throw new Refusal("not-found", NO_SUCH_VOLUME);
  }

  // One statement, so the read that diagnoses a no-op cannot disagree with the write:
  // `known` sees the Volume as it was, `owned` whether it was ever in the house, and
  // `gone` is the release when there was one to make.
  const [outcome] = await refusing(
    () =>
      query<{ known: boolean; owned: boolean; released: boolean }>(
        `with known as (
           select id from volume where id = $1
         ), ever as (
           select id from acquisition where volume_id = $1
         ), gone as (
           update acquisition set released_on = current_date
            where volume_id = $1 and released_on is null
           returning id
         )
         select exists (select 1 from known) as known,
                exists (select 1 from ever)  as owned,
                exists (select 1 from gone)  as released`,
        [volumeId]
      ),
    (constraint) =>
      constraint === "acquisition_release_follows_acquisition"
        ? "That Volume came home on a day in the future, so it cannot have left the house today."
        : "That Volume could not be released."
  );

  if (!outcome.known) throw new Refusal("not-found", NO_SUCH_VOLUME);
  if (!outcome.released) {
    throw new Refusal(
      "not-allowed",
      outcome.owned
        ? "That Volume has already left the house."
        : "That Volume is catalogued and has never been in the house."
    );
  }
}
