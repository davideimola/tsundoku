import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import { type Executor, transaction } from "../transaction.ts";
import { createStory } from "./story.ts";

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
export async function recordSeriesPublishesStory(
  seriesId: string,
  storyId: string,
  run: Executor = query
): Promise<void> {
  if (!UUID.test(seriesId)) throw new Refusal("not-found", NO_SUCH_SERIES);
  if (!UUID.test(storyId)) throw new Refusal("not-found", NO_SUCH_STORY);

  const [outcome] = await refusing(
    () =>
      run<{ known: boolean }>(
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

// MERGING A LINE INTO ONE STORY, which is the first of the two gestures that carry the
// exceptions to *one Volume, one Story* — and the one this library has five cases of.
//
// The default is one object, one narrative, and nothing asks the owner to think about it while
// cataloguing (`CONTEXT.md`). That default is right for almost everything on these shelves and
// wrong for a run: twenty tankōbon of *Slam Dunk* stood as twenty narratives, none of which is
// a thing that gets a score, and the owner's judgement of the work had nowhere to live. This is
// the single gesture that says so — the line prints **one** work — and after it the arrow does
// the rest, because a twenty-first volume joining the line attaches to that work rather than
// minting a twenty-first narrative (`placeVolumeInSeries`). That is why it is pressed once per
// line and why the arrow is what refuses a second press.
//
// **It changes what is judged and never what is owned.** Not one Volume, not one Acquisition
// and not one number of the completeness ledger moves: the objects keep their positions, the
// count published is what it was, and the collecting project is untouched. The only column of
// the Series that changes is `story_id`, and that is the arrow rather than the ledger.
//
// **What is carried across is everything the owner has lived with**, because the collapse must
// not be a way of losing a fact:
//
//   the Ratings and the Readings  the events and the judgement move onto the work, which is the
//                                 whole point — a score given to volume seven was always a score
//                                 about the run
//   the Credits                   an attribution is of a **narrative** (ADR-0012), so twenty
//                                 copies of *Takehiko Inoue, artist* collapse into one
//   the Path stops                the route keeps its place; two stops of one route that both
//                                 named this line become the one stop the work now is, at the
//                                 earlier of the two positions
//   the Wants                     one open intention per Story, so several become the **most
//                                 recent** of them — see the verb for why it is that one
//   another line's arrow          a second Series that named one of the collapsed narratives
//                                 comes to name the work instead, which is two ledgers over one
//                                 narrative and exactly what the arrow is for
//
// **And it refuses rather than proceeds where the collapse would lose one of them.** Two
// narratives of the line judged apart cannot both be the work's one score, and a narrative an
// object *outside* this line carries is not this line's to unmake — the same sentence
// `splitVolumeIntoStories` refuses with, asked from the other end.
//
// **Not a tool, and it cannot become one**: it creates a Story, so an assistant may only
// propose one and the door for that is the Inbox (ADR-0005).

/** One narrative the objects of a line carry, and what stands in the way of collapsing it. */
type NarrativeOfTheLine = {
  id: string;
  title: string;
  typeId: string;
  /** Whether an object outside this Series carries it too, which makes it not this line's. */
  elsewhere: boolean;
  /** Whether it carries a judgement of its own, of which the work can keep one. */
  judged: boolean;
  /** Whether a pass through it counted Instalments, which are this narrative's units. */
  counted: boolean;
};

/** The rule two judged narratives break, in one place because two callers say it. */
const JUDGED_APART =
  "are judged apart, and a Story has one score to give. Merging would lose one of them. Nothing was merged.";

/**
 * Merge the Volumes of a Series into one Story: the twenty tankōbon of *Slam Dunk* become one
 * work that all twenty objects carry, and there is finally somewhere to say *Slam Dunk is a 9*.
 * Returns the new Story's id.
 *
 * **One gesture, and therefore one transaction** (`./README.md`): the work is created, every
 * object of the line is recorded as carrying it, everything the collapsed narratives held is
 * moved onto it, the arrow is set and the collapsed narratives are dropped — together or not at
 * all. Half of it landing would be a line with two answers to what it prints.
 *
 * `title` is the work's, and the Series' own name is what it takes when none is given — *Slam
 * Dunk*, off the line that prints it. The Type comes from the narratives being collapsed, so
 * the gesture asks for nothing the owner would have to look up.
 *
 * The work is **serialized to the length of the line**, because that is what the glossary says
 * a manga line's Instalments are: one part per Volume, so volume seven is instalment seven and
 * nobody types anything. It is the count published or the furthest position placed, whichever
 * is further, and `declareInstalments` is the correction where a line's parts are counted some
 * other way.
 *
 * **Nothing about the shelf changes.** Every Volume, every Acquisition and every number of the
 * completeness ledger is exactly as it was.
 *
 * Refused on a line that already publishes a Story — that is what makes this once per line —
 * on one with no objects in it or whose objects carry no narrative, on one carrying a narrative
 * an object outside the Series carries too, on one where two narratives are judged apart, since
 * a Story has one score to give, and on one where a pass counted its way through a narrative in
 * that narrative's own units, since those units are what the collapse replaces.
 */
export async function mergeSeriesIntoOneStory(
  seriesId: string,
  title?: string | null
): Promise<string> {
  if (!UUID.test(seriesId)) throw new Refusal("not-found", NO_SUCH_SERIES);

  return transaction(async (run) => {
    // Locked, and read in the same transaction that is about to write: the arrow is what makes
    // this once per line, and two presses arriving together would otherwise both find it null.
    const [line] = await run<{ name: string; storyId: string | null; publishedCount: number }>(
      `select s.name, s.story_id as "storyId", s.published_count as "publishedCount"
         from series s
        where s.id = $1
          for no key update`,
      [seriesId]
    );

    if (!line) throw new Refusal("not-found", NO_SUCH_SERIES);
    if (line.storyId) {
      throw new Refusal(
        "not-allowed",
        "That Series already publishes a Story. A line is merged once, and what it prints is managed on that Story's own page."
      );
    }

    // How long the line is, in the only two ways it can be said: what the publisher has put
    // out, and how far the objects placed in it reach. The further of the two is what the work
    // is serialized to, because a work shorter than the shelf holding it is not one.
    const [held] = await run<{ objects: number; furthest: number }>(
      `select count(*)::int as objects, coalesce(max(series_number), 0)::int as furthest
         from volume where series_id = $1`,
      [seriesId]
    );
    if (held.objects === 0) {
      throw new Refusal(
        "not-allowed",
        "That Series has no objects in the library, so there is nothing to merge. Place its Volumes in it first."
      );
    }

    // The narratives the line's objects stand for, in the order the objects stand on the shelf
    // — which is what makes the Type and the refusals below the same answer on every run.
    const narratives = await run<NarrativeOfTheLine>(
      `select s.id,
              s.title,
              s.type_id as "typeId",
              exists (select 1
                        from volume_story other
                        join volume ov on ov.id = other.volume_id
                       where other.story_id = s.id
                         and ov.series_id is distinct from $1) as elsewhere,
              exists (select 1 from rating g
                       where g.story_id = s.id and g.reading_id is null) as judged,
              exists (select 1 from reading r
                       where r.story_id = s.id and r.at_instalment is not null) as counted
         from story s
        where exists (select 1
                        from volume_story vs
                        join volume v on v.id = vs.volume_id
                       where vs.story_id = s.id and v.series_id = $1)
        order by (select min(v.series_number)
                    from volume_story vs
                    join volume v on v.id = vs.volume_id
                   where vs.story_id = s.id and v.series_id = $1),
                 lower(s.title),
                 s.id`,
      [seriesId]
    );

    const [first] = narratives;
    if (!first) {
      throw new Refusal(
        "not-allowed",
        "The objects of this Series carry no narrative yet, so there is nothing to merge. Record what is inside one of them first."
      );
    }

    const outside = narratives.find((one) => one.elsewhere);
    if (outside) {
      throw new Refusal(
        "not-allowed",
        `${outside.title} stays: an object outside this Series carries it too, and a narrative running past the line is not this line's to collapse. Say that object no longer carries it first. Nothing was merged.`
      );
    }

    // A work has one score, and the schema says so: one Rating per Story that names no Reading.
    // So two of them are two judgements the collapse cannot keep, and it is refused rather than
    // quietly keeping whichever Postgres reached first. A Rating that names a Reading travels
    // with that Reading and collides with nothing.
    const judged = narratives.filter((one) => one.judged);
    if (judged.length > 1) {
      const [one, two] = judged;
      throw new Refusal("not-allowed", `${one.title} and ${two.title} ${JUDGED_APART}`);
    }

    // **A pass that counted its way through one of these narratives is the other thing a
    // collapse would quietly change**, and it is refused rather than carried. `at_instalment`
    // is *seven of twenty* in the units of the Story it names, so a pass at one of a
    // five-part narrative becomes a pass at one of the line the moment the narrative under it
    // is replaced — the number survives and its meaning does not, which is the one way this
    // gesture could write a wrong fact rather than move a true one. Renumbering it onto the
    // line is a rule nobody has written down (the volume's position is a guess, and an
    // omnibus has no single one), so it is refused and named instead of invented.
    const counted = narratives.find((one) => one.counted);
    if (counted) {
      throw new Refusal(
        "not-allowed",
        `A pass through ${counted.title} recorded how far it got, and that number counts parts of ${counted.title} rather than parts of the line. Merging would change what it means. Nothing was merged.`
      );
    }

    const collapsing = narratives.map((one) => one.id);
    const work = await createStory(
      {
        title: title?.trim() ? title.trim() : line.name,
        typeId: first.typeId,
        instalments: Math.max(line.publishedCount, held.furthest) || null,
      },
      run
    );

    // Every object of the line, and not only the ones in the house: an object the owner let go
    // still carried this narrative, and the shelf is not what a merge is about.
    await refusing(
      () =>
        run(
          `insert into volume_story (volume_id, story_id)
           select v.id, $2 from volume v where v.series_id = $1
           on conflict on constraint volume_story_is_said_once do nothing`,
          [seriesId, work]
        ),
      () => "The objects of this Series could not be said to carry one Story."
    );

    // **One statement, because the two halves refer to each other.** A Rating names the Reading
    // it came out of *and* the Story that Reading went through, as one foreign key, so moving
    // either on its own leaves the pair disagreeing for as long as the statement lasts — and
    // that key is checked at the end of each statement rather than at the end of the
    // transaction. Moved together, they are consistent when anybody looks.
    await refusing(
      () =>
        run(
          `with passes as (
             update reading set story_id = $1 where story_id = any($2::uuid[]) returning id
           ), judgements as (
             update rating set story_id = $1 where story_id = any($2::uuid[]) returning id
           )
           select count(*) from passes, judgements`,
          [work, collapsing]
        ),
      (constraint) => {
        switch (constraint) {
          case "reading_at_instalment_is_within_the_work":
            return "A pass through one of these narratives got further than this line goes. Nothing was merged.";
          case "rating_is_one_per_story_and_reading":
            return `Two of these narratives ${JUDGED_APART}`;
          default:
            return "What you have read of this line could not be carried onto one Story.";
        }
      }
    );

    // An attribution is of a narrative, so twenty copies of *Takehiko Inoue, artist* are one
    // attribution of the work. Deduplicated by the constraint that says so rather than by a
    // `distinct` this file would have to keep in step with it.
    await refusing(
      () =>
        run(
          `insert into credit (story_id, person_id, role_id)
           select $1, c.person_id, c.role_id from credit c where c.story_id = any($2::uuid[])
           on conflict on constraint credit_is_one_role_per_person_per_story do nothing`,
          [work, collapsing]
        ),
      () => "The people credited on this line could not be credited on one Story."
    );

    // **Deleted and written again rather than repointed**, because a route holds one stop per
    // Story *and* one Story per place: two stops that both named this line are one stop now, and
    // an update would have collided with itself. The place kept is the earlier of them, which is
    // where the owner had already decided this line comes.
    await refusing(
      () =>
        run(
          `with gone as (
             delete from path_item where story_id = any($2::uuid[])
             returning path_id, position, added_at
           ), kept as (
             select distinct on (path_id) path_id, position, added_at from gone
              order by path_id, position
           )
           insert into path_item (path_id, story_id, position, added_at)
           select path_id, $1, position, added_at from kept`,
          [work, collapsing]
        ),
      () => "The routes naming this line could not be pointed at one Story."
    );

    // One open Want per Story, so several become one — and it is the **most recent** of them
    // rather than the first. A Want falls quiet when a Reading began after it was opened, so
    // keeping the oldest could quiet an intention that was live a moment ago; keeping the newest
    // never does, and a merge must not answer a Want the owner had not answered.
    await refusing(
      () =>
        run(
          `with gone as (
             delete from want where story_id = any($2::uuid[]) returning opened_at
           ), kept as (
             select max(opened_at) as opened_at from gone
           )
           insert into want (story_id, opened_at)
           select $1, opened_at from kept where opened_at is not null`,
          [work, collapsing]
        ),
      () => "What you meant to read of this line could not be pointed at one Story."
    );

    // A pin names a Story since #40, and one pin per Story, so the same rule as the Want and
    // for a sharper reason: the pin cascades. Left alone, the delete at the foot of this
    // transaction would take the owner's own order off the front of their list **silently** —
    // the one thing a gesture that only changes what is judged must not do. The most recent
    // pin is kept, which is what migration 0010 decided when two routes offered one Story: a
    // pin is the act of saying *this next*, so the later one is the standing decision. A pin
    // on a *position of the line* is another subject entirely — the shopping half names an
    // object and no narrative — and nothing here touches it.
    await refusing(
      () =>
        run(
          `with gone as (
             delete from reading_list_pin where story_id = any($2::uuid[]) returning pinned_at
           ), kept as (
             select max(pinned_at) as pinned_at from gone
           )
           insert into reading_list_pin (story_id, pinned_at)
           select $1, pinned_at from kept where pinned_at is not null`,
          [work, collapsing]
        ),
      () => "What you pinned of this line could not be pointed at one Story."
    );

    // A second Series that named one of these narratives comes to name the work: two ledgers
    // over one narrative is what the arrow is for, and leaving it would have let the delete
    // below silently empty it (`on delete set null`).
    await refusing(
      () =>
        run("update series set story_id = $1 where story_id = any($2::uuid[])", [work, collapsing]),
      () => "Another Series printing one of these narratives could not be pointed at the Story."
    );

    await recordSeriesPublishesStory(seriesId, work, run);

    // Last, and everything worth keeping is off them by now: what still points at one of these
    // narratives is the record of which objects carried it, which is the fact being replaced.
    await refusing(
      () => run("delete from story where id = any($1::uuid[])", [collapsing]),
      () => "The narratives of this line could not be replaced by the Story they print."
    );

    return work;
  });
}
