import "server-only";

import { query } from "../db.ts";
import { WHY_A_CARRIED_STORY_STANDS } from "../verbs/story.ts";
import { IN_THE_HOUSE, THE_ORDER_A_RUN_OF_OBJECTS_STANDS_IN } from "./collection.ts";
import { type StoryType, THE_LINE_IT_STANDS_IN } from "./story.ts";

// The many-to-many, read from both ends (ADR-0001). One stored fact, two questions:
//
//   - from a Volume, **which Stories does this object hold** — *L'uomo che ride* holds
//     three, each with its own judgement;
//   - from a Story, **which objects carry it** — *Slam Dunk* is carried by twenty.
//
// Both directions live in one file because they are one fact, and putting them in two would
// invite the next reader to believe one of them is the primary side. Neither is.
//
// There is no Edition note anywhere in here. It is a judgement of an object and it never
// feeds recommendation, and this is a file the MCP door reads (ADR-0001).

/**
 * The Instalments of a work that are inside one object, and where the answer came from.
 *
 * `null` everywhere the question does not arise — a Story that declares no Instalments, or
 * an object nobody placed in a line to follow.
 */
export type CoveredInstalments = {
  from: number;
  to: number;
  /**
   * Whether the owner wrote this range, or it **follows the Volume's position in its
   * Series**. The default is the reason nobody types anything for a manga: volume 7 carries
   * instalment 7, and it is only the omnibus that has to say so.
   */
  written: boolean;
};

/** A Story as a Volume's contents shows it: what it is, and what the owner thought of it. */
export type CarriedStory = {
  id: string;
  title: string;
  /** By name as well as by id, because MCP reads this and prose is the point (ADR-0006). */
  type: { id: string; name: string };
  /**
   * The score the owner set most recently, or `null` where they set none. It is the
   * Story's, never the Volume's: three Stories in one object have three of these, and one
   * Story across twenty objects shows the same one twenty times.
   */
  latestScore: number | null;
  /**
   * Whether another object carries this narrative too — which is to say whether it is *this*
   * object's own or a work running across a line.
   *
   * It is the one fact on this shape that is about neither the Story nor the object but about
   * the many-to-many between them, and it is here because a screen cannot derive it: read from
   * one Volume, *Slam Dunk* and *Gotham Noir* look exactly alike. What needs it is the split
   * (#38) — an object that stands for a work twenty tankōbon share is not one volume's to
   * unmake, so the act is not offered rather than offered and refused.
   */
  alsoCarriedElsewhere: boolean;
  /** How many Instalments the work has, or `null` where it was not serialized. */
  instalments: number | null;
  /** Which of them are inside this object, written or followed from the line. */
  covers: CoveredInstalments | null;
  /**
   * **Why this narrative stands**, in the owner's words, or `null` where nothing holds it
   * and it may be unmade from in here (#47).
   *
   * The row under this object's title offers two acts and they are different sizes: the
   * cross says *this object does not hold that*, and the bin says *the library stops knowing
   * it*. The second is drawn only where it would be allowed, and this is what says so —
   * `WHY_A_CARRIED_STORY_STANDS` read the other way round, so the row and
   * `strikeStoryCarriedBy` cannot come to answer *may this record be unmade* differently.
   *
   * It is prose rather than a boolean because the four ways a narrative stands are four
   * different sentences, and the day one of them is worth printing beside a row the words are
   * already here — written where the act is, which is the verb (`verbs/README.md`).
   */
  whyItStands: string | null;
};

/** A Volume as a Story's carriers show it: the object, and whether the house holds it. */
export type CarryingVolume = {
  id: string;
  title: string;
  publisher: string;
  editionLine: string | null;
  /** What tells two editions of one Story apart, and the fact the owner checks in a shop. */
  binding: { id: string; name: string };
  language: string;
  /**
   * **The line it stands in, and where** — which is the colour the spine wears and the number
   * along its foot (#29).
   *
   * Both `null` for an object nobody has placed in a line, which is ordinary rather than a
   * gap: a one-off hardback carries a Story as truly as a numbered tankōbon does, and it
   * stands at the end of the row in the page's own paper.
   */
  seriesId: string | null;
  seriesNumber: number | null;
  /**
   * Whether the Collection claims it right now. A Volume the house does not hold still
   * carries what it held — the Reading made through it is still true — so it is answered
   * with rather than hidden, and marked.
   *
   * A boolean rather than the day it left, since the catalogue and the Collection came
   * apart (ADR-0007): an object can be carrying Stories and have never been owned at all,
   * and *not on the shelf* is the whole of what this list needs to say about it.
   */
  inTheHouse: boolean;
  /**
   * Which Instalments of the Story this object holds — *one to thirty-five* for an omnibus,
   * *seven to seven* for the seventh tankōbon of a line, and `null` for a work nobody
   * numbered.
   */
  covers: CoveredInstalments | null;
};

// **What part of the work is in this object**, and the default is the whole reason
// Instalments cost nothing (#37).
//
// A range the owner wrote wins. Where they wrote none, it **follows the Volume's position in
// its Series**: volume 7 of a line that prints one part per Volume carries instalment 7, with
// nothing typed. Where the Story declares no Instalments, or the object stands in no line,
// there is no range to have — and an object standing at a position past the end of the work
// is not made to cover one, since a followed range must be as true as a written one.
//
// One fragment for both directions of the many-to-many, because it is one fact: it names the
// link `vs`, the Volume `v` and the Story `s`.
const WHAT_IT_COVERS = `
  case
    when vs.covers_from is not null
      then jsonb_build_object('from', vs.covers_from, 'to', vs.covers_to, 'written', true)
    when s.instalments is not null
     and v.series_number is not null
     and v.series_number <= s.instalments
      then jsonb_build_object('from', v.series_number, 'to', v.series_number, 'written', false)
  end`;

// The Story shape, as both the single and the batched question build it. `score` leaves as
// a double rather than as `numeric`, which the driver would hand over as a string.
const CARRIED_STORY = `
  jsonb_build_object(
    'id', s.id,
    'title', s.title,
    'type', jsonb_build_object('id', t.id, 'name', t.name),
    'latestScore', (
      select g.score::float8
        from rating g
       where g.story_id = s.id
       order by g.set_at desc
       limit 1
    ),
    'alsoCarriedElsewhere', exists (
      select 1
        from volume_story elsewhere
       where elsewhere.story_id = s.id
         and elsewhere.volume_id <> vs.volume_id
    ),
    'instalments', s.instalments,
    'covers', ${WHAT_IT_COVERS},
    'whyItStands', ${WHY_A_CARRIED_STORY_STANDS}
  )`;

/**
 * Which Volumes carry this Story, **in the order they stand on the shelf**.
 *
 * The twenty-in-one case read from the narrative: *Slam Dunk* answers with twenty objects
 * and is rated once.
 *
 * The order was by title until #29, with a note here saying that the order the owner means
 * is the position in the publisher's line and that it was a Series' fact rather than this
 * join's. It is still a Series' fact — it is read off `volume`, which is where a position is
 * stored — but the caller now *draws* these as a row of spines, and a shelf that read 1, 10,
 * 11, 2 would be a picture of nobody's shelf. So it is
 * `THE_ORDER_A_RUN_OF_OBJECTS_STANDS_IN` — the same fragment the jacket a Story wears is
 * picked with (`queries/story.ts`), because the picture and the pick must not disagree. An
 * object in no line stands after the ones that are in one.
 *
 * A Story with no Volume at all answers with nothing, and that is the ordinary case rather
 * than a gap: being read and being owned are unrelated facts (ADR-0001).
 */
export async function listVolumesCarryingStory(storyId: string): Promise<CarryingVolume[]> {
  return query<CarryingVolume>(
    `select v.id,
            v.title,
            v.publisher,
            v.edition_line as "editionLine",
            jsonb_build_object('id', b.id, 'name', b.name) as binding,
            v.language,
            v.series_id as "seriesId",
            v.series_number as "seriesNumber",
            ${IN_THE_HOUSE} as "inTheHouse",
            ${WHAT_IT_COVERS} as covers
       from volume_story vs
       join volume  v on v.id = vs.volume_id
       join binding b on b.id = v.binding_id
       join story   s on s.id = vs.story_id
      where vs.story_id = $1
      ${THE_ORDER_A_RUN_OF_OBJECTS_STANDS_IN}`,
    [storyId]
  );
}

/**
 * Which Stories this Volume holds, by title.
 *
 * The three-in-one case read from the object: *L'uomo che ride* answers with *Gotham Noir*,
 * *L'uomo che ride* and *Uomo di legno*, each carrying the score it earned on its own. An
 * object holding nothing yet answers with nothing, which is an ordinary answer.
 *
 * The same question as the one below, asked about one object rather than a screenful. It
 * delegates rather than writing the statement again: two copies of this SQL would be two
 * places for the answer to drift, and one Volume is a list of one.
 */
export async function listStoriesInVolume(volumeId: string): Promise<CarriedStory[]> {
  const held = await listStoriesInVolumes([volumeId]);
  return held[volumeId];
}

/**
 * What each of these Volumes holds, keyed by Volume id.
 *
 * The Collection lists a hundred rows and says what each one carries; asking per row would
 * be a hundred round trips reading a hundred different moments. Every id asked for is a key
 * in the answer, with an empty list where the object holds nothing — so the caller lays out
 * a row without checking whether the key is there.
 */
export async function listStoriesInVolumes(
  volumeIds: readonly string[]
): Promise<Record<string, CarriedStory[]>> {
  const held: Record<string, CarriedStory[]> = {};
  for (const volumeId of volumeIds) held[volumeId] = [];
  // No ids is a real answer and not a query: the Collection with nothing in it, or a search
  // that matched nothing.
  if (volumeIds.length === 0) return held;

  const rows = await query<{ volumeId: string; stories: CarriedStory[] }>(
    `select vs.volume_id as "volumeId",
            jsonb_agg(${CARRIED_STORY} order by lower(s.title), s.id) as stories
       from volume_story vs
       join story  s on s.id = vs.story_id
       join type   t on t.id = s.type_id
       join volume v on v.id = vs.volume_id
      where vs.volume_id = any ($1::uuid[])
      group by vs.volume_id`,
    [volumeIds]
  );

  for (const row of rows) held[row.volumeId] = row.stories;
  return held;
}

// **THE ONE FIELD UNDER THE ROWS**, as a question (#47, ADR-0019).
//
// It is the many-to-many read as an *absence*: what the library holds and this object does
// not. The picker it replaces was a native `<select>` over every Story there is, so an
// omnibus of three was three round trips and a run of twenty was twenty acts of looking —
// and the answer to both is the same one the route picker found (`queries/path.ts`): narrow
// as the owner types, and hand the line each Story stands in back with it, so the screen can
// band a run into one block with one press over it.
//
// **The order is this query's and the banding is the screen's** — the same division the
// route's candidates are under, and for the sharper of its two reasons: what comes out here
// in the order the objects stand on the shelf (1, 2, 10) is what the owner reads as a run,
// and a band that re-sorted its rows would offer a run nobody recognises.

/** A Story the field can offer: enough to read it, band it and add it. */
export type StoryOnOffer = {
  id: string;
  title: string;
  type: StoryType;
  /**
   * The line it stands in, which is the band it goes in and the only thing a colour is ever
   * derived from (`@/lib/tint`). `null` for a narrative in no line — the novel and the
   * omnibus, which is routinely the biggest band there is.
   */
  series: { id: string; name: string; editionLine: string | null } | null;
  /** Where the objects carrying it stand in that line, which is the order of a run. */
  standsAt: number | null;
};

// The statement both askings of the field spend, and the whole of what they share: the
// columns a band is drawn from, and **the order a run is read in** — the line, its edition,
// the position, then the title, with what is in no line last, which is where it stands on a
// shelf too. `$1` is the title typed, or null; what is left out is the caller's own `where`,
// because that is the only thing the two moments disagree about.
function theStoriesOnOffer(unless: string, values: readonly unknown[]): Promise<StoryOnOffer[]> {
  return query<StoryOnOffer>(
    `select c.*
       from (
         select s.id,
                s.title,
                jsonb_build_object('id', t.id, 'name', t.name) as type,
                ${THE_LINE_IT_STANDS_IN} as series,
                (select min(v.series_number)::int
                   from volume_story vs
                   join volume v on v.id = vs.volume_id
                  where vs.story_id = s.id) as "standsAt"
           from story s
           join type t on t.id = s.type_id
          where ($1::text is null
                 or strpos(lower(unaccent(s.title)), lower(unaccent($1))) > 0)
            and ${unless}
       ) c
      order by lower(c.series->>'name') nulls last,
               c.series->>'editionLine' nulls first,
               c."standsAt" nulls last,
               lower(c.title)`,
    values
  );
}

/**
 * The Stories this object does not carry, narrowed by what the owner has typed.
 *
 * An object the library does not know answers with nothing rather than with the whole
 * catalogue — *not in that* is not an answer about an object that is not there — and a
 * malformed id is the same event, for the reason every verb here gives.
 */
export async function listStoriesNotInVolume(
  volumeId: string,
  filter: { title?: string } = {}
): Promise<StoryOnOffer[]> {
  if (!UUID.test(volumeId)) return [];

  return theStoriesOnOffer(
    // The object has to exist for *not in it* to be an answer. Uncorrelated, so it is
    // decided once rather than per Story.
    `exists (select 1 from volume v where v.id = $2)
       and not exists (select 1 from volume_story vs
                        where vs.volume_id = $2 and vs.story_id = s.id)`,
    [filter.title ?? null, volumeId]
  );
}

/**
 * The Stories the field offers **while an object is being catalogued**, narrowed by what the
 * owner has typed and minus the ones they have already named.
 *
 * The same question as the one above it, at the moment there is no object to ask it about: the
 * Volume is being written in the submission this list feeds (#48, ADR-0019), so what stands in
 * the way of offering a narrative twice is not a link but a row the screen is holding. That is
 * the whole of the difference, which is why the two share their statement — the columns a band
 * is drawn from and the order a run is read in must not come to differ between the two places
 * the same field stands.
 *
 * An id in `except` that is not an id is ignored rather than answering with nothing: it came
 * off a row the screen was just drawing, so a malformed one is a bug in the caller and not a
 * question about the library — and answering *nothing at all* would empty the field's whole
 * list on it.
 */
export async function listStoriesToOffer(
  filter: { title?: string; except?: readonly string[] } = {}
): Promise<StoryOnOffer[]> {
  const named = (filter.except ?? []).filter((storyId) => UUID.test(storyId));

  return theStoriesOnOffer("not (s.id = any ($2::uuid[]))", [filter.title ?? null, named]);
}

// An id is generated, so what arrives here came from a screen the caller was just looking at
// — a malformed one is the same event as an unknown one, and `where id = $1` on a uuid column
// raises a *syntax* error for `"banana"` that would reach an adapter as a 500.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
