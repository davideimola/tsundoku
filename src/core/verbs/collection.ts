import "server-only";

import { query } from "../db.ts";
import { priceAsTyped } from "../money.ts";
import { Refusal, refusing } from "../refusal.ts";
import { type Executor, transaction } from "../transaction.ts";

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

// A day is the other value Postgres *parses* rather than checks, and therefore the other one
// the database cannot refuse politely: it arrives as text and becomes `date` on the way in,
// and `11/03/2024` raises a syntax error rather than an integrity violation. `refusing`
// deliberately does not launder a syntax error into an answer — it is usually our bug — so
// the shape is checked here, and the owner reads prose rather than meeting a 500 with their
// whole entry gone. A price is the same problem and is `../money.ts`, because *which
// separator a keyboard offers* is a fact about the owner rather than about this area.
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
 * Nothing about the reading follows from it either — no Story, no Pass, no Rating —
 * because being read and being owned are unrelated facts (ADR-0001). There is no medium to
 * give: an owned ebook is not representable, so a digital book is a Pass and never this.
 *
 * `run` is how the Inbox's approval calls it inside its own transaction: an assistant may
 * only *propose* an object, and approving that proposal is one act — the Volume and the
 * entry that became it land together or not at all (see `../transaction.ts`).
 */
export async function catalogueVolume(
  volume: CataloguedVolume,
  run: Executor = query
): Promise<{ id: string }> {
  const rows = await refusing(
    () =>
      run<{ id: string }>(
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
    (constraint) => whyVolumeRefused(constraint, "That Volume could not be catalogued.")
  );

  return rows[0];
}

/** The prose for every constraint the `volume` table can refuse a write with. */
function whyVolumeRefused(constraint: string | undefined, otherwise: string): string {
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
      return otherwise;
  }
}

/**
 * What an approved Amendment writes onto a Volume the library already knows: the fields it
 * names, and nothing else.
 *
 * Every field is optional because an amendment is usually one — the ISBN the catalogue was
 * imported without — and `null` or absent means **leave what stands there today**. So there
 * is no way to empty a field through an amendment, deliberately: an assistant proposing
 * *this Volume has no publisher* is proposing to lose a fact, and taking one out is the
 * owner's act on the record rather than a proposal about it.
 */
export type VolumeAmendment = {
  title?: string | null;
  publisher?: string | null;
  /** The publisher's line, where there is one. */
  editionLine?: string | null;
  /** A Binding id — `tankobon`, `omnibus`, `must-have`. */
  binding?: string | null;
  /** A language code: `it`, `en`, `ja`. */
  language?: string | null;
  isbn?: string | null;
};

// **Whether this amendment puts a different ISBN on the object**, said once and spent five
// times in the statement below — `$7` is the amended ISBN.
//
// Both halves matter. An amendment that names no ISBN leaves `$7` null, and `null is
// distinct from '978…'` is *true*, so without the first half every amendment to a publisher
// or a Binding would silently unface the object. And the second half is `is distinct from`
// rather than `<>` because `'978…' <> null` is null, not true: an ISBN arriving on a Volume
// that had none must count as a replacement.
//
// It reads the column, which inside a `set` clause is the value as it stood before the
// update — which is exactly the ISBN the cover was an answer to.
const THE_ISBN_IS_REPLACED = `($7::text is not null and $7::text is distinct from isbn)`;

/**
 * Complete or correct a catalogued Volume: the ISBN it was catalogued without, the
 * publisher left blank, the Binding somebody guessed wrong.
 *
 * **The owner's act, and the Inbox is the door an assistant reaches it through.** An
 * invented ISBN is a permanent fact nobody ever reads back and nothing looks wrong about,
 * so it is proposed as an Amendment and waits for a decision (ADR-0011); `run` is how that
 * approval calls this inside its own transaction, so the record and the entry that changed
 * it land together (see `../transaction.ts`).
 *
 * It says nothing about the house, the narrative or the Series: this is the object as the
 * library catalogues it, and everything else about it is a different fact somewhere else.
 *
 * **It says one thing about the cover, and it has to**: putting a *different* ISBN on the
 * object drops the looked-up cover with it. See `THE_ISBN_IS_REPLACED` above for why that is
 * a correction and not a courtesy.
 */
export async function amendVolume(
  volumeId: string,
  amendment: VolumeAmendment,
  run: Executor = query
): Promise<void> {
  if (!UUID.test(volumeId)) throw new Refusal("not-found", NO_SUCH_VOLUME);
  if (!Object.values(amendment).some((value) => value !== null && value !== undefined)) {
    throw new Refusal("invalid", "An amendment changes at least one field of the Volume.");
  }

  // `coalesce` rather than a `set` clause assembled from whichever fields arrived: the
  // fields are a closed list written here, nothing a caller supplies reaches the statement
  // except as a parameter, and *leave it standing* is the same sentence in SQL as it is in
  // the type above.
  //
  // **And a new ISBN takes the looked-up cover with it**, in the same statement, because a
  // cover is the answer to the ISBN that stood here when it was asked for (ADR-0013). This is
  // not tidiness: ADR-0012 named the exact failure — *a wrong one quietly fetches another
  // book's cover for as long as the record stands* — and it happened, in production, the week
  // covers shipped. An assistant proposed an ISBN, the approval wrote it, and *One-Punch Man
  // 9* wore *Slam Dunk 9*'s jacket. Correcting the ISBN now unfaces the object, so the wall
  // goes back to a drawn tile — honestly blank — until a lookup asks about the ISBN that is
  // actually there. The owner's own image is untouched, because that was never an answer to
  // an ISBN.
  const changed = await refusing(
    () =>
      run<{ id: string }>(
        `update volume
            set title        = coalesce($2, title),
                publisher    = coalesce($3, publisher),
                edition_line = coalesce($4, edition_line),
                binding_id   = coalesce($5, binding_id),
                language     = coalesce($6, language),
                isbn         = coalesce($7, isbn),
                cover_source       = case when ${THE_ISBN_IS_REPLACED} then null else cover_source end,
                cover_reference    = case when ${THE_ISBN_IS_REPLACED} then null else cover_reference end,
                cover_url          = case when ${THE_ISBN_IS_REPLACED} then null else cover_url end,
                cover_info_url     = case when ${THE_ISBN_IS_REPLACED} then null else cover_info_url end,
                cover_looked_up_at = case when ${THE_ISBN_IS_REPLACED} then null else cover_looked_up_at end
          where id = $1
          returning id`,
        [
          volumeId,
          amendment.title ?? null,
          amendment.publisher ?? null,
          amendment.editionLine ?? null,
          amendment.binding ?? null,
          amendment.language ?? null,
          amendment.isbn ?? null,
        ]
      ),
    (constraint) => whyVolumeRefused(constraint, "That Volume could not be amended.")
  );

  if (changed.length === 0) throw new Refusal("not-found", NO_SUCH_VOLUME);
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
 *
 * `run` is how the one door calls this inside its own transaction (`what-happened.ts`): the
 * owner says *I bought it* once, and the object, the acquisition and the narrative land
 * together or not at all (see `../transaction.ts`).
 */
export async function acquireVolume(
  acquisition: MadeAcquisition,
  run: Executor = query
): Promise<void> {
  if (!UUID.test(acquisition.volumeId)) {
    throw new Refusal("not-found", NO_SUCH_VOLUME);
  }
  const pricePaid = priceAsTyped(acquisition.pricePaid);
  if (acquisition.acquiredOn && !DAY.test(acquisition.acquiredOn)) {
    throw new Refusal("invalid", "A purchase date is a day, written 2024-03-11.");
  }

  await refusing(
    () =>
      run(`insert into acquisition (volume_id, acquired_on, price_paid) values ($1, $2, $3)`, [
        acquisition.volumeId,
        acquisition.acquiredOn ?? null,
        pricePaid,
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
 * deleted. A Pass made through it, and the Edition note written about it, are facts
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

// STRIKING A VOLUME FROM THE CATALOGUE, and why this is not the delete ADR-0007 refuses.
//
// **Releasing is about the world; striking is about the record.** `releaseVolume` says the
// object left the house and keeps everything, because a Pass made through it and the note
// written about it are facts about the owner's past that a delete would take with them. That
// rule protects an object that *was real*. It has nothing to say about a row that never
// stood for anything — a duplicate an assistant proposed, the owner approved in a bulk of
// forty, and noticed a day later, twice, in two editions (#32's aftermath: *Slam Dunk 5* to
// *9* catalogued a second time under a Shinsōban line that was never bought).
//
// So the act exists, and what makes it safe is what it **refuses** rather than a confirmation
// dialog. A struck Volume must be a record with nothing of the owner's own hanging off it:
//
//   in the house      an object on a shelf. Release it first, and then think again — this
//                     is the rail that makes a bulk control over the catalogue safe at all
//   a Pass         an event in the owner's life names this object. The strongest signal
//                     the thing was real, and no duplicate ever has one
//   an Edition note   prose the owner wrote about this object as an object
//   a Wish            an intention they recorded against this exact Volume
//
// What it does take with it is said out loud before it is done: the acquisitions that have
// **ended**, and the record of which Stories the object carried. The first is the deliberate
// half — a duplicate's purchase history is as fictional as the duplicate — and it is why the
// open acquisition is the line rather than any acquisition at all.
//
// **The owner's act, never the assistant's.** There is no MCP tool for this and there must
// not be one: the party that files a hallucinated duplicate is exactly the party that should
// not be able to delete rows to tidy up after itself (ADR-0005).

/** Why one Volume in a selection could not be struck, in the owner's words. */
type WhyItStands = { title: string; because: string };

/**
 * Strike Volumes from the catalogue: the library stops knowing them.
 *
 * **The selection lands whole or not at all**, like the Inbox's approval and for the same
 * reason: a mess arrives by the dozen, and half a clean-up is worse than none — the owner
 * would have to work out which half. So one refused object refuses the gesture and names
 * itself, and nothing has moved when the screen comes back.
 *
 * Returns how many were struck. An empty selection is refused rather than passing quietly:
 * a button that reported *0 struck* would be a button the owner could not tell from a broken
 * one.
 */
export async function strikeVolumes(volumeIds: readonly string[]): Promise<number> {
  const asked = volumeIds.filter((id) => UUID.test(id));
  if (asked.length === 0) {
    throw new Refusal("invalid", "Tick the Volumes to strike from the catalogue first.");
  }

  return transaction(async (run) => {
    // One statement for the whole selection: what stands in the way of each id, read in the
    // same transaction that is about to delete them, so nothing can be acquired or read
    // between the check and the act.
    const standing = await run<WhyItStands & { id: string }>(
      `select v.id,
              v.title,
              case
                when exists (select 1 from acquisition a
                              where a.volume_id = v.id and a.released_on is null)
                  then 'it is in the house. Release it first — the catalogue is not where an object on a shelf is removed.'
                when exists (select 1 from pass r where r.volume_id = v.id)
                  then 'a Pass went through it. That is an event in your life, and it names this object.'
                when exists (select 1 from edition_note n where n.volume_id = v.id)
                  then 'you wrote an Edition note about it.'
                when exists (select 1 from wish w where w.volume_id = v.id)
                  then 'a Wish names it. Close the Wish first.'
              end as because
         from volume v
        where v.id = any($1::uuid[])`,
      [asked]
    );

    if (standing.length !== asked.length) {
      throw new Refusal("not-found", "One of those is not a Volume the library knows.");
    }

    const held = standing.find((one) => one.because !== null);
    if (held) {
      throw new Refusal("not-allowed", `${held.title} stays: ${held.because} Nothing was struck.`);
    }

    // The acquisitions that ended go first, because the foreign key refuses the Volume
    // while any of them stands — and that refusal is the schema saying what this verb had
    // to decide out loud: an acquisition is history, and striking says the history was
    // fiction. The Edition note and the Stories it carried follow the Volume by cascade,
    // and a Pass through it cannot exist, because one would have refused the gesture.
    await run(`delete from acquisition where volume_id = any($1::uuid[])`, [asked]);

    const struck = await refusing(
      () =>
        run<{ id: string }>(`delete from volume where id = any($1::uuid[]) returning id`, [asked]),
      () => "Those Volumes could not be struck from the catalogue."
    );

    return struck.length;
  });
}
