import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";

// Writing the completeness ledger.
//
// Six verbs, and the shape of the set is the design: the owner declares a Series, records
// what the publisher has done to it, places the objects they own in it — and, as a
// **separate act that nothing else performs**, decides they are completing it. There is
// no verb here that opens a collecting project as a side effect of anything, because
// holding 42 of Naruto's 72 volumes is not a decision (CONTEXT.md).
//
// What is not here is the missing list. Nothing writes it: it is derived from the count
// published and the shelf, in `../queries/series.ts`.

/** Whether the publisher is still adding to the Series. */
export type SeriesStatus = "ongoing" | "concluded";

/** What declaring a Series needs, and the whole of it. */
export type NewSeries = {
  /** The Series' name without its edition: `Death Note`. */
  name: string;
  publisher: string;
  /** The publisher's edition line — `Black Edition`. Absent for the standard printing. */
  editionLine?: string | null;
  /** How many Volumes are out. Zero is an announced Series with nothing published yet. */
  publishedCount: number;
  status: SeriesStatus;
};

// A Series' id is generated, so the owner never types one: what arrives here came from a
// screen or from an assistant reading the ledger over MCP. A malformed one is therefore
// the same event as an unknown one — nothing to act on — and this keeps it that way,
// because `where id = $1` on a uuid column raises a *syntax* error for `"banana"`, which
// is not a refusal and would reach an adapter as a 500.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The prose for every constraint the `series` table can refuse a write with. */
function whySeriesRefused(constraint: string | undefined): string {
  switch (constraint) {
    case "series_name_is_not_blank":
      return "A Series needs a name.";
    case "series_publisher_is_not_blank":
      return "A Series needs its publisher.";
    case "series_edition_line_is_not_blank":
      return "Leave the edition line empty rather than blank: most Series are the standard printing.";
    case "series_published_count_is_not_negative":
      return "A Series has published nought Volumes or more, never fewer.";
    case "series_status_is_ongoing_or_concluded":
      return "A Series is either ongoing or concluded.";
    case "series_is_one_per_edition_line":
      return "That Series is already declared. The same name in another edition is a second Series.";
    default:
      return "That Series could not be declared.";
  }
}

/**
 * Declare a Series the owner wants held as a ledger: its publisher, its edition, how many
 * Volumes are out and whether the publisher is done. Returns its id.
 *
 * **It starts no collecting project.** A declared Series is one the owner knows about;
 * completing it is `declareSeriesCollected`, which is a different decision on a different
 * day.
 *
 * Two Series of one name are the ordinary case — *Death Note* in six Black Edition
 * volumes and in twelve standard ones — and they share nothing but the name. What is
 * refused is the same Series twice.
 *
 * The owner's verb, not MCP's: an external assistant may only *propose* a Series, as an
 * Inbox entry the owner approves (ADR-0005).
 */
export async function declareSeries(series: NewSeries): Promise<string> {
  if (!Number.isInteger(series.publishedCount)) {
    throw new Refusal("invalid", "A count of published Volumes is a whole number.");
  }

  const rows = await refusing(
    () =>
      query<{ id: string }>(
        `insert into series (name, publisher, edition_line, published_count, status)
         values (btrim($1), btrim($2), $3, $4, $5)
         returning id`,
        [
          series.name,
          series.publisher,
          series.editionLine ?? null,
          series.publishedCount,
          series.status,
        ]
      ),
    whySeriesRefused
  );

  const [declared] = rows;
  if (!declared) throw new Error("insert into series returned no row");
  return declared.id;
}

/**
 * The one statement shape the four verbs below share, and **not a generic update**.
 *
 * Each of them is `update series set <one thing> where id = $1 and <the state it changes
 * from>`, followed by the same two refusals: the Series does not exist, or it is already
 * in the state asked for. One statement rather than a read and a write, so the diagnosis
 * cannot disagree with what happened.
 *
 * `set` and `changesFrom` are **literals written in this file** — the verbs README's rule
 * is that the vocabulary of writing is the owner's, and it is kept by the four exported
 * names above this line, not by repeating the same CTE four times. Nothing a caller
 * supplies reaches SQL other than as a parameter, here as everywhere.
 */
async function changeSeries(
  seriesId: string,
  set: string,
  changesFrom: string,
  values: readonly unknown[],
  said: { missing: string; already: string }
): Promise<void> {
  if (!UUID.test(seriesId)) throw new Refusal("not-found", said.missing);

  const [outcome] = await refusing(
    () =>
      query<{ known: boolean; changed: boolean }>(
        `with known as (
           select id from series where id = $1
         ), changed as (
           update series set ${set}
            where id = $1 and ${changesFrom}
           returning id
         )
         select exists (select 1 from known)   as known,
                exists (select 1 from changed) as changed`,
        [seriesId, ...values]
      ),
    whySeriesRefused
  );

  if (!outcome.known) throw new Refusal("not-found", said.missing);
  if (!outcome.changed) throw new Refusal("not-allowed", said.already);
}

/**
 * Decide that the owner is completing this Series, from today.
 *
 * **This is the only thing that opens a collecting project**, and it is why the missing
 * Volumes of a Series nobody chose are not a list anywhere: what is missing follows from
 * this decision, never from what happens to be on the shelf.
 */
export async function declareSeriesCollected(seriesId: string): Promise<void> {
  await changeSeries(seriesId, "collecting_since = current_date", "collecting_since is null", [], {
    missing: "No Series has that id.",
    already: "That Series is already being collected.",
  });
}

/**
 * Decide that the owner is no longer completing this Series.
 *
 * The Series stays, with everything owned of it: what ends is the project, so the Series
 * stops appearing in what is missing. A decision the owner made is undone by another
 * decision and by nothing else — releasing the last Volume of a Series does not close it.
 */
export async function stopCollectingSeries(seriesId: string): Promise<void> {
  await changeSeries(seriesId, "collecting_since = null", "collecting_since is not null", [], {
    missing: "No Series has that id.",
    already: "That Series was not being collected.",
  });
}

/**
 * Record how many Volumes of the Series the publisher has put out.
 *
 * The left-hand side of the ledger, and the owner's knowledge rather than something this
 * app can discover, so it is said rather than derived. Lowering it is allowed: a count
 * entered from an announcement that turned out to be wrong is corrected here.
 */
export async function recordVolumesPublished(
  seriesId: string,
  publishedCount: number
): Promise<void> {
  if (!Number.isInteger(publishedCount)) {
    throw new Refusal("invalid", "A count of published Volumes is a whole number.");
  }

  await changeSeries(seriesId, "published_count = $2", "published_count <> $2", [publishedCount], {
    missing: "No Series has that id.",
    already: "That Series already has that many Volumes out.",
  });
}

/**
 * Record that the publisher is done with the Series.
 *
 * It changes what *missing* means rather than what is missing: an ongoing Series is
 * incomplete in a way nobody can fix yet, and a concluded one is a finite thing the owner
 * can finish. There is no verb back — a publisher restarting a concluded Series is a new
 * edition, which is a new Series.
 */
export async function concludeSeries(seriesId: string): Promise<void> {
  await changeSeries(seriesId, "status = 'concluded'", "status <> 'concluded'", [], {
    missing: "No Series has that id.",
    already: "That Series is already concluded.",
  });
}

/** Which position of which Series an object the owner holds is. */
export type VolumePlacement = {
  volumeId: string;
  seriesId: string;
  /** Its position in the Series: 12 of Slam Dunk. */
  number: number;
};

/**
 * Record that a Volume the owner holds is a particular position of a particular Series.
 *
 * This is what makes the ledger answerable: the missing Volumes are the positions the
 * house has none of. Said again it **moves** the object — to another position, or to
 * another Series — because the realistic mistake is a number typed wrong, and a correction
 * should not need a second verb.
 *
 * Nothing about the narrative follows from it. A Volume joining a Series says which object
 * this is, never what story it tells (ADR-0001).
 *
 * Refused on a Volume the house does not hold — let go, or catalogued and never had: it
 * fills no position, and the ledger is measured against what is on the shelf.
 */
export async function placeVolumeInSeries(placement: VolumePlacement): Promise<void> {
  if (!UUID.test(placement.volumeId)) {
    throw new Refusal("not-found", "No Volume has that id.");
  }
  if (!UUID.test(placement.seriesId)) {
    throw new Refusal("not-found", "No Series has that id.");
  }
  if (!Number.isInteger(placement.number)) {
    throw new Refusal("invalid", "A position in a Series is a whole number: 1, 2, 3.");
  }

  const [outcome] = await refusing(
    () =>
      query<{ known: boolean; owned: boolean; placed: boolean }>(
        `with known as (
           select id from volume where id = $1
         ), ever as (
           select id from acquisition where volume_id = $1
         ), placed as (
           update volume set series_id = $2, series_number = $3
            where id = $1
              and exists (select 1 from acquisition a
                           where a.volume_id = volume.id and a.released_on is null)
           returning id
         )
         select exists (select 1 from known)  as known,
                exists (select 1 from ever)   as owned,
                exists (select 1 from placed) as placed`,
        [placement.volumeId, placement.seriesId, placement.number]
      ),
    (constraint) => {
      switch (constraint) {
        case "volume_series_exists":
          return "No Series has that id.";
        case "volume_series_number_is_positive":
          return "A Series starts at 1, so a position before it is not one.";
        case "volume_is_one_per_number_in_a_series":
          return "That position of the Series is already in the house.";
        default:
          return "That Volume could not be placed in the Series.";
      }
    }
  );

  if (!outcome.known) throw new Refusal("not-found", "No Volume has that id.");
  // Known, and not placed: the house does not hold it. Refused rather than recorded,
  // because the ledger is measured against the shelf and an object not on it would take a
  // position without filling it. **Two ways of not being held since ADR-0007**, and they
  // are different mistakes: one is an object the owner let go, the other an object they
  // have catalogued and never had — most likely something they mean to buy.
  if (!outcome.placed) {
    throw new Refusal(
      "not-allowed",
      outcome.owned
        ? "That Volume has left the house, so it fills no position of the Series."
        : "That Volume is not in the house, so it fills no position of the Series."
    );
  }
}
