import "server-only";

import { query } from "../db.ts";
import type { Medium, Outcome } from "../verbs/reading.ts";

// What the owner and an external reader ask about a Story.
//
// The interesting thing in this file is that **a Story's state is not in it**. The
// sheets kept a `Stato lettura` column and it was wrong the moment a reread began;
// here the state is an expression over the Readings, computed on the way out, and there
// is nowhere it could be stored inconsistently. That is the shape every derivation in
// this repo takes (README, "The schema").

/**
 * Where the owner is with a Story, derived from its Readings and stored nowhere.
 *
 * A literal union rather than a data row, unlike Type and Provenance: these four are not
 * a vocabulary that could grow by an insert. They are the four cases the expression
 * below can produce, and a fifth would be a change to the derivation.
 */
export type StoryState = "to-read" | "reading" | "read" | "abandoned";

// The derivation, written once and used by both queries in this file.
//
// The order of the branches is the judgement in it: **an open Reading wins over a
// finished one**, so a Story being reread reads `reading` and an assistant does not
// recommend what is currently in the owner's hands (user story 33). A finished Reading
// then wins over an abandoned one, because having given up in 2019 and finished it in
// 2024 means the owner has read it.
const STATE = `
  case
    when not exists (select 1 from reading r where r.story_id = s.id)
      then 'to-read'
    when exists (select 1 from reading r where r.story_id = s.id and r.outcome is null)
      then 'reading'
    when exists (select 1 from reading r where r.story_id = s.id and r.outcome = 'finished')
      then 'read'
    else 'abandoned'
  end`;

/** A Type, as a Story carries it. */
export type StoryType = { id: string; name: string };

/** A Provenance, as a Reading or a Rating carries it. */
export type StoryProvenance = { id: string; name: string };

/** The owner's judgement of a Story. Never of an object (ADR-0001). */
export type StoryRating = {
  id: string;
  /** 1 to 10, in half points. */
  score: number;
  prose: string | null;
  /**
   * How this judgement came to be known, and how far it can be trusted. A score doubled
   * from a 1-5 scale says so here (ADR-0001).
   */
  provenance: StoryProvenance;
};

/** One act of reading, with the judgement it carried. */
export type StoryReading = {
  id: string;
  medium: Medium;
  /** `null` while the Reading is still open, which is what makes the Story `reading`. */
  outcome: Outcome | null;
  /** `YYYY-MM-DD`, or `null` where the owner only knows that it happened. */
  startedOn: string | null;
  endedOn: string | null;
  provenance: StoryProvenance;
  rating: StoryRating | null;
};

/** One Story, with everything the screen and the MCP tool show about it. */
export type Story = {
  id: string;
  title: string;
  type: StoryType;
  state: StoryState;
  /** Newest first. Several is the ordinary case, because rereading is. */
  readings: StoryReading[];
  /** Judgements attached to no Reading — a score imported with no act to point at. */
  standaloneRatings: StoryRating[];
};

// The Rating shape, as a subquery builds it. `score` leaves as a double rather than as
// `numeric`, which the driver would hand over as a string.
const RATING = `
  jsonb_build_object(
    'id', g.id,
    'score', g.score::float8,
    'prose', g.prose,
    'provenance', jsonb_build_object('id', gp.id, 'name', gp.name)
  )`;

/**
 * One Story with its Readings, each carrying the Rating it carried, and the judgements
 * that point at no Reading. `null` when there is no such Story.
 *
 * One statement rather than one per list: the Readings and the Ratings are the answer to
 * the same question, and reading them in three round trips would be reading three
 * different moments.
 */
export async function findStory(storyId: string): Promise<Story | null> {
  const rows = await query<Story>(
    `select
       s.id,
       s.title,
       jsonb_build_object('id', t.id, 'name', t.name) as type,
       ${STATE} as state,
       coalesce((
         select jsonb_agg(
           jsonb_build_object(
             'id', r.id,
             'medium', r.medium,
             'outcome', r.outcome,
             'startedOn', r.started_on::text,
             'endedOn', r.ended_on::text,
             'provenance', jsonb_build_object('id', rp.id, 'name', rp.name),
             'rating', (
               select ${RATING}
                 from rating g
                 join provenance gp on gp.id = g.provenance_id
                where g.reading_id = r.id
             )
           )
           order by r.started_on desc nulls last, r.created_at desc
         )
           from reading r
           join provenance rp on rp.id = r.provenance_id
          where r.story_id = s.id
       ), '[]'::jsonb) as readings,
       coalesce((
         select jsonb_agg(${RATING} order by g.set_at desc)
           from rating g
           join provenance gp on gp.id = g.provenance_id
          where g.story_id = s.id and g.reading_id is null
       ), '[]'::jsonb) as "standaloneRatings"
     from story s
     join type t on t.id = s.type_id
    where s.id = $1`,
    [storyId]
  );

  return rows[0] ?? null;
}

/** A Story as a list shows it: enough to choose one, and nothing more. */
export type StorySummary = {
  id: string;
  title: string;
  type: StoryType;
  state: StoryState;
  readingCount: number;
  /** The score the owner set most recently, or `null` if they set none. */
  latestScore: number | null;
};

/**
 * Every Story, by title.
 *
 * By title rather than by state or by score, because the list answers *"what have I
 * read"* by being readable, and any other order would be an opinion the screen has not
 * asked for.
 */
export async function listStories(): Promise<StorySummary[]> {
  return query<StorySummary>(
    `select
       s.id,
       s.title,
       jsonb_build_object('id', t.id, 'name', t.name) as type,
       ${STATE} as state,
       (select count(*)::int from reading r where r.story_id = s.id) as "readingCount",
       (select g.score::float8
          from rating g
         where g.story_id = s.id
         order by g.set_at desc
         limit 1) as "latestScore"
     from story s
     join type t on t.id = s.type_id
    order by s.title`
  );
}
