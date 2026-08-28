import "server-only";

import { query } from "../db.ts";

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
};

/** A Volume as a Story's carriers show it: the object, and whether it is still owned. */
export type CarryingVolume = {
  id: string;
  title: string;
  publisher: string;
  editionLine: string | null;
  /** What tells two editions of one Story apart, and the fact the owner checks in a shop. */
  binding: { id: string; name: string };
  language: string;
  /**
   * The day it left the house, or `null` while it is in the Collection. A released Volume
   * still carries what it held — the Reading made through it is still true — so it is
   * answered with rather than hidden, and marked.
   */
  releasedOn: string | null;
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
    )
  )`;

/**
 * Which Stories this Volume holds, by title.
 *
 * The three-in-one case read from the object: *L'uomo che ride* answers with *Gotham Noir*,
 * *L'uomo che ride* and *Uomo di legno*, each carrying the score it earned on its own. An
 * object holding nothing yet answers with nothing, which is an ordinary answer.
 */
export async function listStoriesInVolume(volumeId: string): Promise<CarriedStory[]> {
  return query<CarriedStory>(
    `select s.id,
            s.title,
            jsonb_build_object('id', t.id, 'name', t.name) as type,
            (select g.score::float8
               from rating g
              where g.story_id = s.id
              order by g.set_at desc
              limit 1) as "latestScore"
       from volume_story vs
       join story s on s.id = vs.story_id
       join type  t on t.id = s.type_id
      where vs.volume_id = $1
      order by lower(s.title), s.id`,
    [volumeId]
  );
}

/**
 * Which Volumes carry this Story, by title.
 *
 * The twenty-in-one case read from the narrative: *Slam Dunk* answers with twenty objects
 * and is rated once. Ordered by title as text, which puts *Slam Dunk 10* between 1 and 2 —
 * the order the owner means is the position in the publisher's line, and that is a Series'
 * fact rather than this join's.
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
            to_char(v.released_on, 'YYYY-MM-DD') as "releasedOn"
       from volume_story vs
       join volume  v on v.id = vs.volume_id
       join binding b on b.id = v.binding_id
      where vs.story_id = $1
      order by lower(v.title), v.id`,
    [storyId]
  );
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
