import "server-only";

import { query } from "../db.ts";
import type { StoryType } from "./story.ts";

// **A Want, and whether it has fallen quiet** — which is the only question there is to ask
// about one.
//
// A Want has no closing column (`db/migrations/0005_a_want_is_an_open_intention_to_read.sql`).
// It is one row saying *I want to read this Story*, and it stops being an answer the moment
// the owner has acted on it: nobody closes a Want, and there is no second truth to keep in
// step with the Readings. So *is it still open?* is a **derivation over the Readings**,
// written here once and spent by every caller — this file's own lists and the Reading list
// that composes from them.
//
// That derivation is what makes **rereading ordinary instead of a special case**, and it is
// worth stating why. A Want opened today on a Story read in 2019 finds no Reading later than
// itself and stands; the same Want on a Story read tomorrow finds one and falls quiet. Nothing
// anywhere says *this one is a reread* — it is one because the reading is older than the wish
// to read it again.

/**
 * **When a Reading counts as having begun after the Want was opened**, in SQL, naming the
 * Want `w`.
 *
 * The two branches are the two granularities the library has, not two rules. A Reading that
 * says *when* it began carries a **date**, which has no time of day, so it is compared against
 * the day the Want was opened and a Reading begun on that same day counts as after it — the
 * alternative reads a bare date as midnight, and every Want opened this morning would survive
 * the Reading started this afternoon. A Reading that does not say — the ordinary shape of *I
 * read this at some point*, off Goodreads or off the shelf — has only the **moment it was
 * recorded**, which is compared as a moment. That is what keeps the other order of the same
 * evening honest: the owner records an undated old Reading and then says *I want to read it
 * again*, and the Want that follows it stands.
 */
export const A_READING_BEGAN_AFTER_IT = `
  exists (
    select 1
      from reading r
     where r.story_id = w.story_id
       and case
             when r.started_on is not null then r.started_on >= w.opened_at::date
             else r.created_at > w.opened_at
           end
  )`;

/** An open Want: one sentence about one Story, and when the owner said it. */
export type OpenWant = {
  id: string;
  /** When the owner said it. The Reading list reads the newest first. */
  openedAt: string;
  story: { id: string; title: string; type: StoryType };
};

/**
 * Every Want that has not fallen quiet, **newest first** — which is the order the Reading
 * list's reserve reads them in and the only order a Want has.
 *
 * A Want the owner has since acted on is simply absent. It is not deleted and nothing was
 * written to retire it: the Reading is what answered it, and the row stays as the record of
 * having meant to.
 */
export async function listOpenWants(): Promise<OpenWant[]> {
  return query<OpenWant>(
    `select w.id::text as id,
            w.opened_at as "openedAt",
            jsonb_build_object(
              'id', s.id,
              'title', s.title,
              'type', jsonb_build_object('id', t.id, 'name', t.name)
            ) as story
       from want w
       join story s on s.id = w.story_id
       join type t on t.id = s.type_id
      where not ${A_READING_BEGAN_AFTER_IT}
      order by w.opened_at desc, w.id`
  );
}

/** The Want standing on one Story, and whether it has fallen quiet. */
export type WantOnAStory = {
  id: string;
  openedAt: string;
  /**
   * Whether a Reading has begun since, which is the whole of what ends one.
   *
   * A quiet Want is still a row — there is one Want per Story and Postgres holds that — so
   * the Story's own page reads this rather than offering to open a second one and meeting a
   * refusal it could have foreseen.
   */
  quiet: boolean;
};

/**
 * The Want on this Story, where the owner opened one.
 *
 * Its own question rather than a field on `theStory`, because a Want is not a fact about a
 * narrative: it is a sentence the owner said about themselves, and the Story is what it names.
 */
export async function theWantOnTheStory(storyId: string): Promise<WantOnAStory | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storyId)) return null;

  const [want] = await query<WantOnAStory>(
    `select w.id::text as id, w.opened_at as "openedAt", ${A_READING_BEGAN_AFTER_IT} as quiet
       from want w
      where w.story_id = $1`,
    [storyId]
  );

  return want ?? null;
}
