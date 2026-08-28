import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";

/** What the owner records about an object when they bring it home. */
export type AcquiredVolume = {
  title: string;
  publisher: string;
  /** The publisher's line, where there is one. */
  editionLine?: string | null;
  /** A Binding id — `tankobon`, `omnibus`, `must-have`. */
  binding: string;
  /** A language code: `it`, `en`, `ja`. */
  language: string;
  /** What was paid, as the owner typed it: `24.90`. */
  pricePaid?: string | null;
  /** The day it was bought, `YYYY-MM-DD`. */
  purchaseDate?: string | null;
  isbn?: string | null;
};

/**
 * Record a Volume as the owner's: it joins the Collection from this moment.
 *
 * Nothing about the reading follows from it — no Story, no Reading, no Rating — because
 * being owned and being read are unrelated facts (ADR-0001). There is no medium to give:
 * an owned ebook is not representable, so a digital book is a Reading and never this.
 */
export async function acquireVolume(volume: AcquiredVolume): Promise<{ id: string }> {
  const rows = await refusing(
    () =>
      query<{ id: string }>(
        `insert into volume
           (title, publisher, edition_line, binding_id, language, price_paid, purchase_date, isbn)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id`,
        [
          volume.title,
          volume.publisher,
          volume.editionLine ?? null,
          volume.binding,
          volume.language,
          volume.pricePaid ?? null,
          volume.purchaseDate ?? null,
          volume.isbn ?? null,
        ]
      ),
    (constraint) => {
      switch (constraint) {
        case "volume_binding_id_fkey":
          return "That is not a Binding. Pick one of the six the model knows.";
        case "volume_title_is_not_blank":
          return "A Volume needs the title printed on it.";
        case "volume_publisher_is_not_blank":
          return "A Volume needs its publisher.";
        case "volume_edition_line_is_not_blank":
          return "Leave the edition line empty rather than blank: most volumes are the standard printing.";
        case "volume_language_is_a_code":
          return "A language is a code like it, en or ja.";
        case "volume_price_paid_is_not_negative":
          return "A price paid is not negative. Leave it empty if the receipt is gone.";
        case "volume_isbn_is_not_blank":
          return "An ISBN is 10 or 13 characters with no spaces or dashes.";
        default:
          return "That Volume could not be acquired.";
      }
    }
  );

  return rows[0];
}

// A Volume's id is generated, so the owner never types one: what arrives here came from
// the Collection the caller was just looking at, or from an assistant reading it over
// MCP. A malformed one is therefore the same event as an unknown one — nothing to act on
// — and this keeps it that way, because `where id = $1` on a uuid column raises a *syntax*
// error for `"banana"`, which is not a refusal and would reach an adapter as a 500.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Record that a Volume left the owner's hands: the Collection stops claiming it today.
 *
 * The record of the object is kept rather than deleted. A Reading made through it, and
 * the Edition note written about it, are facts about the owner's past that a delete
 * would take with them — so what changes is only whether the Collection answers with it.
 *
 * Refused on a Volume that is already gone, rather than passing silently: the Collection
 * already does not claim it, so a second release is a mistake worth naming.
 */
export async function releaseVolume(volumeId: string): Promise<void> {
  if (!UUID.test(volumeId)) {
    throw new Refusal("not-found", "No Volume has that id.");
  }

  // One statement, so the read that diagnoses a no-op cannot disagree with the write:
  // `known` sees the Volume as it was, `gone` is the release when there was one to make.
  const [outcome] = await query<{ known: boolean; released: boolean }>(
    `with known as (
       select id from volume where id = $1
     ), gone as (
       update volume set released_on = current_date
        where id = (select id from volume where id = $1 and released_on is null)
       returning id
     )
     select exists (select 1 from known)  as known,
            exists (select 1 from gone)   as released`,
    [volumeId]
  );

  if (!outcome.known) throw new Refusal("not-found", "No Volume has that id.");
  if (!outcome.released) {
    throw new Refusal("not-allowed", "That Volume has already left the house.");
  }
}
