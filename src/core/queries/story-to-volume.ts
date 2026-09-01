import "server-only";

import { query } from "../db.ts";
import { IN_THE_HOUSE, THE_ORDER_A_RUN_OF_OBJECTS_STANDS_IN } from "./collection.ts";

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
};

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
    )
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
            ${IN_THE_HOUSE} as "inTheHouse"
       from volume_story vs
       join volume  v on v.id = vs.volume_id
       join binding b on b.id = v.binding_id
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
       join story s on s.id = vs.story_id
       join type  t on t.id = s.type_id
      where vs.volume_id = any ($1::uuid[])
      group by vs.volume_id`,
    [volumeIds]
  );

  for (const row of rows) held[row.volumeId] = row.stories;
  return held;
}
