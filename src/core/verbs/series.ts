import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import type { Executor } from "../transaction.ts";

// Writing the completeness ledger.
//
// Nine verbs, and the shape of the set is the design: the owner declares a Series, records
// what the publisher has done to it, places the objects they own in it — and, as a
// **separate act that nothing else performs**, decides they are completing it. There is
// no verb here that opens a collecting project as a side effect of anything, because
// holding 42 of Naruto's 72 volumes is not a decision (CONTEXT.md).
//
// `amendSeries` is the ledger being **repaired** rather than kept: what an approved
// Amendment writes when an assistant found the line out of date and the owner agreed
// (ADR-0011).
//
// **The last two are the one arrow out of this file**, and they are the only thing a Series
// and a Story say to each other (#39): the Series says which Story it publishes, and says it
// no longer. Everything above them counts objects; those two name a narrative — and they
// still count nothing about it, because the ledger answers *what am I missing* and never
// *was it any good* (ADR-0001).
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
function whySeriesRefused(
  constraint: string | undefined,
  otherwise = "That Series could not be declared."
): string {
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
      return otherwise;
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
 * Inbox entry the owner approves (ADR-0005). `run` is how the Inbox's approval calls it
 * inside its own transaction (see `../transaction.ts`).
 */
export async function declareSeries(series: NewSeries, run: Executor = query): Promise<string> {
  if (!Number.isInteger(series.publishedCount)) {
    throw new Refusal("invalid", "A count of published Volumes is a whole number.");
  }

  const rows = await refusing(
    () =>
      run<{ id: string }>(
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
 * What an approved Amendment writes onto a Series: the fields it names, and nothing else.
 *
 * `null` or absent means **leave what stands there today**, so an amendment completes and
 * corrects but never empties.
 */
export type SeriesAmendment = {
  name?: string | null;
  publisher?: string | null;
  /** The publisher's edition line — `Black Edition`. */
  editionLine?: string | null;
  /** How many Volumes are out. */
  publishedCount?: number | null;
  status?: SeriesStatus | null;
};

/**
 * Complete or correct a declared Series: the publisher left blank on the way in, the count
 * the ledger has fallen behind on, the line the publisher has since finished.
 *
 * **The owner's act, and the Inbox is the door an assistant reaches it through** — an
 * assistant reading a shop page is exactly who notices the count is stale and exactly who
 * might invent it, so it is proposed as an Amendment and waits for a decision (ADR-0011).
 * `run` is how that approval calls this inside its own transaction (see
 * `../transaction.ts`).
 *
 * It is not `recordVolumesPublished` and `concludeSeries` called twice: those are the
 * owner's own single-fact verbs and each refuses a value the Series already holds, where an
 * amendment names several fields at once and a field that changes nothing is an amendment
 * the owner approved anyway. **It starts no collecting project** either — nothing here
 * does.
 *
 * And it has **no way back from concluded**, which is the one rule `concludeSeries` states
 * and the one an amendment could otherwise walk around: a publisher restarting a concluded
 * line is a new edition, which is a new Series. Everything else about a concluded Series is
 * amendable — a name spelt wrong stays wrong otherwise.
 */
export async function amendSeries(
  seriesId: string,
  amendment: SeriesAmendment,
  run: Executor = query
): Promise<void> {
  if (!UUID.test(seriesId)) throw new Refusal("not-found", "No Series has that id.");
  if (!Object.values(amendment).some((value) => value !== null && value !== undefined)) {
    throw new Refusal("invalid", "An amendment changes at least one field of the Series.");
  }
  if (amendment.publishedCount != null && !Number.isInteger(amendment.publishedCount)) {
    throw new Refusal("invalid", "A count of published Volumes is a whole number.");
  }

  // `coalesce` rather than a `set` clause assembled from whichever fields arrived: the
  // fields are a closed list written here, and *leave it standing* is the same sentence in
  // SQL as it is in the type above. One statement rather than a read and a write, as the
  // four verbs below it are, so the diagnosis cannot disagree with what happened.
  const [outcome] = await refusing(
    () =>
      run<{ known: boolean; amended: boolean }>(
        `with known as (
           select id from series where id = $1
         ), amended as (
           update series
              set name            = coalesce($2, name),
                  publisher       = coalesce($3, publisher),
                  edition_line    = coalesce($4, edition_line),
                  published_count = coalesce($5, published_count),
                  status          = coalesce($6, status)
            where id = $1
              and not (status = 'concluded' and coalesce($6, status) = 'ongoing')
            returning id
         )
         select exists (select 1 from known)   as known,
                exists (select 1 from amended) as amended`,
        [
          seriesId,
          amendment.name ?? null,
          amendment.publisher ?? null,
          amendment.editionLine ?? null,
          amendment.publishedCount ?? null,
          amendment.status ?? null,
        ]
      ),
    (constraint) => whySeriesRefused(constraint, "That Series could not be amended.")
  );

  if (!outcome.known) throw new Refusal("not-found", "No Series has that id.");
  if (!outcome.amended) {
    throw new Refusal(
      "not-allowed",
      "That Series is concluded. A publisher restarting a concluded line is a new edition, which is a new Series."
    );
  }
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

const NO_SUCH_SERIES = "No Series has that id.";
const NO_SUCH_STORY = "That Story is not in the library yet.";

/**
 * Record which Story this Series publishes: the twenty tankōbon of *Slam Dunk* print the
 * Story called *Slam Dunk*.
 *
 * **Many Series may name one Story**, and that is the point rather than a tolerated case:
 * the standard edition and the Ultimate Deluxe Edition are two completeness ledgers over one
 * narrative, so what is missing stays per Series and what it was worth stays with the Story.
 *
 * Its consequence is the reason it exists: a Volume placed in a Series that names a Story
 * **attaches to that Story** instead of a new narrative being minted for it, so the owner
 * says this once per Series and never again (`placeVolumeInSeries`).
 *
 * Said again with another Story it **moves** the arrow, because the realistic mistake is the
 * wrong narrative picked out of a list and a correction should not need a second verb. It
 * attaches nothing retroactively: the objects already in the Series carry what they carried,
 * and collapsing them onto one Story is the merge gesture's own act.
 *
 * Nothing about the ledger moves — not the count published, not the collecting project, not
 * a judgement, because a Series has none to give.
 */
export async function recordSeriesPublishesStory(seriesId: string, storyId: string): Promise<void> {
  if (!UUID.test(seriesId)) throw new Refusal("not-found", NO_SUCH_SERIES);
  if (!UUID.test(storyId)) throw new Refusal("not-found", NO_SUCH_STORY);

  const [outcome] = await refusing(
    () =>
      query<{ known: boolean }>(
        `with said as (
           update series set story_id = $2 where id = $1 returning id
         )
         select exists (select 1 from said) as known`,
        [seriesId, storyId]
      ),
    (constraint) =>
      constraint === "series_story_exists"
        ? NO_SUCH_STORY
        : whySeriesRefused(constraint, "That Series could not be said to publish that Story.")
  );

  if (!outcome.known) throw new Refusal("not-found", NO_SUCH_SERIES);
}

/**
 * Take that back: this Series publishes no Story after all.
 *
 * The Story stays in the library with its Readings, its Ratings and every object carrying
 * it, and the Series stays a ledger with everything it counts — what goes is the arrow, and
 * the Series simply stops saying what it prints, which is where every Series stood before
 * this fact existed. A Volume placed in it afterwards attaches to nothing again.
 *
 * Refused where there was no such fact rather than passing silently, exactly as taking back
 * *this Volume carries that Story* is: the caller believed something that is not in the
 * library.
 */
export async function recordSeriesNoLongerPublishesStory(seriesId: string): Promise<void> {
  if (!UUID.test(seriesId)) throw new Refusal("not-found", NO_SUCH_SERIES);

  const [outcome] = await refusing(
    () =>
      query<{ known: boolean; taken: boolean }>(
        `with known as (
           select id from series where id = $1
         ), taken as (
           update series set story_id = null
            where id = $1 and story_id is not null
           returning id
         )
         select exists (select 1 from known) as known,
                exists (select 1 from taken) as taken`,
        [seriesId]
      ),
    (constraint) =>
      whySeriesRefused(constraint, "That Series could not be said to publish nothing.")
  );

  if (!outcome.known) throw new Refusal("not-found", NO_SUCH_SERIES);
  if (!outcome.taken) throw new Refusal("not-found", "That Series publishes no Story.");
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
 * **Where the Series says which Story it publishes, the object joins that Story too** (#39).
 * That is not the Series deciding what the object contains — it is the owner's own arrow
 * being read: they said once that these twenty tankōbon print *Slam Dunk*, and the
 * twenty-first arriving is that narrative again rather than a twenty-first one. A Series
 * that names no Story is the ordinary case and nothing follows from joining it, which is
 * where every Series stood before that arrow existed (ADR-0001 is untouched: the Volume is
 * still an object and the Story is still a narrative, and this writes the link between them
 * rather than collapsing the two).
 *
 * **Attaching only ever adds, and that is a decision rather than an oversight.** Moving an
 * object along the same Series says the same fact again and writes nothing; moving it to
 * *another* Series attaches the second Story and leaves the first standing. Taking a
 * narrative off an object is `recordVolumeNoLongerCarriesStory`, which is the owner saying
 * *this object does not carry that* — and a placement quietly deleting that fact would
 * destroy a link the owner may have made by hand, which the schema cannot tell apart from
 * one this attached.
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
         ), attached as (
           -- The arrow, read: the Story this Series publishes, carried by the object that
           -- just joined it. In the same statement as the placement and conditioned on it, so an
           -- object refused a position carries nothing either — one verb is one transaction,
           -- and half of this fact is worse than neither.
           insert into volume_story (volume_id, story_id)
           select $1, s.story_id
             from series s
            where s.id = $2
              and s.story_id is not null
              and exists (select 1 from placed)
           on conflict on constraint volume_story_is_said_once do nothing
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
