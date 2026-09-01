import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import { transaction } from "../transaction.ts";

// Writing a Path: the route the owner defines through Stories, and the constraints they
// declare about how they want to read.
//
// Two things this file is careful about.
//
// **The order is the owner's judgement and nothing here derives it.** No verb sorts, no
// verb re-numbers, and there is no publication sequence to fall back on — a Story goes
// where the owner puts it, and the only way a place changes is a verb below saying so.
//
// **A re-order writes one row.** `path_item.position` is sparse `numeric`: appending
// takes `max + 1024` and moving takes the midpoint of the two new neighbours, so
// recording one decision costs one row however long the route is. The migration says why
// a dense `1, 2, 3` would be a re-numbering pretending to be a judgement.
//
// These are the owner's verbs. An external assistant may walk a Path and read its intent
// (ADR-0002); reordering someone's judgement from outside is not a thing the model
// offers, and there is nothing to add here for it.

/**
 * The gap left between two neighbours, and therefore the room a move has to work in.
 *
 * It reaches every statement below as a **parameter**, like every other value in this
 * module (`../README.md`): a number that arrives by interpolation is a number nobody is
 * stopping from being a string one day.
 */
const GAP = 1024;

// A Path's id and a Story's id are generated, so the owner never types one: what arrives
// here came from the screen they were just looking at, or from an assistant reading over
// MCP. A malformed one is therefore the same event as an unknown one — nothing to act on
// — and this keeps it that way, because `where id = $1` on a uuid column raises a
// *syntax* error for `"banana"`, which is not a refusal and would reach an adapter as a
// 500.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Refuse an id that no row could have, before Postgres is asked to parse it. */
function known(id: string, thing: "Path" | "Story" | "constraint"): void {
  if (!UUID.test(id)) throw new Refusal("not-found", `That ${thing} is not in the library.`);
}

/** What defining a Path needs. Only the name is required to start one. */
export type NewPath = {
  /** What the owner calls the route: *Recupero Batman*, *Angolo Giappone*. */
  name: string;
  /**
   * Why the route exists, in the owner's own words. Optional, because a route can exist
   * before the owner has the words for it — and the words can be added later with
   * `restatePathIntent`.
   */
  intent?: string | null;
};

/**
 * Define a Path. Returns its id.
 *
 * It starts **active**, so the Reading list composes from it at once: a route the owner
 * has just defined is one they mean to walk, and `deactivatePath` is the deliberate act
 * of putting it aside.
 *
 * No Story is placed by this verb. The route is built with `placeStoriesOnPath`,
 * which takes them in the order the caller means them to stand in.
 */
export async function definePath(path: NewPath): Promise<string> {
  const rows = await refusing(
    () =>
      query<{ id: string }>(
        "insert into path (name, intent) values (btrim($1), nullif(btrim($2), '')) returning id",
        [path.name, path.intent ?? null]
      ),
    (constraint) => {
      if (constraint === "path_name_names_one_route") return "There is already a Path called that.";
      if (constraint === "path_name_is_not_blank") return "A Path needs a name.";
      return "That Path could not be defined.";
    }
  );

  const [defined] = rows;
  if (!defined) throw new Error("insert into path returned no row");
  return defined.id;
}

/**
 * Call a Path something else.
 *
 * The name is the owner's and one route holds it, so a route defined with a typo would
 * otherwise keep the right name from ever being used again — putting it aside is for a
 * route the owner has paused, not for a mistake in one.
 */
export async function renamePath(pathId: string, name: string): Promise<void> {
  known(pathId, "Path");

  const renamed = await refusing(
    () =>
      query<{ id: string }>("update path set name = btrim($2) where id = $1 returning id", [
        pathId,
        name,
      ]),
    (constraint) => {
      if (constraint === "path_name_names_one_route") return "There is already a Path called that.";
      if (constraint === "path_name_is_not_blank") return "A Path needs a name.";
      return "That Path could not be renamed.";
    }
  );

  if (renamed.length === 0) throw new Refusal("not-found", "That Path is not in the library.");
}

/**
 * Say what a Path is for, in the owner's words, replacing whatever it said before.
 *
 * The intent is prose the external recommender reads, so it is the owner's *current*
 * words rather than a history of them: an intent restated is the same route explained
 * better, and nothing in the model wants the earlier explanation. `null` — or nothing
 * but whitespace — clears it.
 */
export async function restatePathIntent(pathId: string, intent: string | null): Promise<void> {
  known(pathId, "Path");

  const changed = await refusing(
    () =>
      query<{ id: string }>(
        "update path set intent = nullif(btrim($2), '') where id = $1 returning id",
        [pathId, intent]
      ),
    "That intent could not be recorded."
  );

  if (changed.length === 0) throw new Refusal("not-found", "That Path is not in the library.");
}

/** Mark a Path active: the Reading list composes from it again. */
export async function activatePath(pathId: string): Promise<void> {
  await setActive(pathId, true);
}

/**
 * Put a Path aside. The Reading list stops composing from it; the route survives whole.
 *
 * Inactive rather than deleted, because *Angolo Giappone* paused for a year is not
 * *Angolo Giappone* forgotten — the order in it is a judgement the owner made once and
 * should not have to make again.
 */
export async function deactivatePath(pathId: string): Promise<void> {
  await setActive(pathId, false);
}

async function setActive(pathId: string, active: boolean): Promise<void> {
  known(pathId, "Path");

  const changed = await query<{ id: string }>(
    "update path set active = $2 where id = $1 returning id",
    [pathId, active]
  );

  if (changed.length === 0) throw new Refusal("not-found", "That Path is not in the library.");
}

function stopProse(constraint: string | undefined): string {
  if (constraint === "path_item_is_one_stop") return "That Story is already on this Path.";
  if (constraint === "path_item_path_exists") return "That Path is not in the library.";
  if (constraint === "path_item_story_exists") return "That Story is not in the library yet.";
  return "That Story could not be placed on this Path.";
}

/**
 * Place Stories at the end of a Path, **in the order they are given**. Returns how many
 * landed.
 *
 * At the end because that is where a route grows and nowhere else is guessable: the owner
 * then moves them with `moveStoryOnPath` if the end is not where they belong. A Story is on a
 * route once — placing it twice is refused, since a plan that visits the same stop twice is a
 * mistake in the plan.
 *
 * **It takes a selection because that is the shape the act actually has.** A route through
 * *Slam Dunk* is twenty stops, and one Story per press meant the owner opened a picker, found
 * a title in seventy-seven, submitted, waited for the route to come back, and did it again
 * nineteen times. Twenty presses is not a more careful version of one press; it is the same
 * judgement, taken once, typed twenty times, and the third one is where the owner stops
 * building routes at all.
 *
 * **The order is the caller's, and it is the whole of what the caller is trusted with.** The
 * positions are spaced by `GAP` in the order the ids arrive, so the route reads in the order
 * the selection was in — which is why the screen that ticks them stands them in the order
 * their objects stand on a shelf rather than by title. Nothing here sorts: the owner's
 * judgement about order is the one thing this application never computes.
 *
 * **Whole or nothing**, like the Inbox's approval and the catalogue's strike: one Story
 * already on the route refuses the selection and names itself, and the route is untouched.
 * Half a route placed in an order the owner did not read is worse than none — they would have
 * to work out which half landed.
 *
 * A selection of one is an ordinary selection, and there is no second verb for it: this is one
 * act at two sizes, and two verbs would be two answers to *where does a stop land*.
 */
export async function placeStoriesOnPath(
  pathId: string,
  storyIds: readonly string[]
): Promise<number> {
  known(pathId, "Path");
  for (const storyId of storyIds) known(storyId, "Story");

  // The same tick twice is one intention, and the route has one place per Story: deduplicated
  // here rather than left to the primary key, which would refuse the whole selection over a
  // form that said the same true thing twice. The order the ids first arrived in survives.
  const asked = [...new Set(storyIds)];
  if (asked.length === 0) {
    throw new Refusal("invalid", "Choose the Stories to put on this route first.");
  }

  return transaction(async (run) => {
    // What stands in the way, read in the transaction that is about to write — so nothing can
    // be placed between the check and the act. It is a check rather than the primary key's
    // own refusal because the key cannot say *which*: `That Story is already on this Path`
    // over a tick of twenty is a sentence the owner cannot act on.
    const standing = await run<{ id: string; title: string; standing: boolean }>(
      `select s.id,
              s.title,
              exists (select 1 from path_item i
                       where i.path_id = $1 and i.story_id = s.id) as standing
         from story s
        where s.id = any($2::uuid[])`,
      [pathId, asked]
    );

    if (standing.length !== asked.length) throw new Refusal("not-found", noSuchStory(asked.length));

    const already = standing.find((one) => one.standing);
    if (already) {
      throw new Refusal(
        "already-exists",
        asked.length === 1
          ? "That Story is already on this route."
          : `${already.title} is already on this route. Nothing was placed.`
      );
    }

    // One statement for the whole selection, and `with ordinality` is what carries the
    // caller's order into the positions: the nth id lands n gaps past the end of the route,
    // so the spacing a later re-order needs is the spacing a single placement leaves.
    const placed = await refusing(
      () =>
        run<{ story_id: string }>(
          `insert into path_item (path_id, story_id, position)
           select $1,
                  asked.story_id,
                  coalesce((select max(position) from path_item where path_id = $1), 0)
                    + asked.place * $3
             from unnest($2::uuid[]) with ordinality as asked(story_id, place)
           returning story_id`,
          [pathId, asked, GAP]
        ),
      stopProse
    );

    return placed.length;
  });
}

/** *No such Story*, in the number of the selection it was asked about. */
function noSuchStory(asked: number): string {
  return asked === 1
    ? "That Story is not in the library yet."
    : "One of those is not a Story the library knows.";
}

/** Take a Story off a Path. The Story, its Readings and its Rating are untouched. */
export async function removeStoryFromPath(pathId: string, storyId: string): Promise<void> {
  known(pathId, "Path");
  known(storyId, "Story");

  const removed = await query<{ story_id: string }>(
    "delete from path_item where path_id = $1 and story_id = $2 returning story_id",
    [pathId, storyId]
  );

  if (removed.length === 0) throw new Refusal("not-found", "That Story is not on this Path.");
}

/**
 * Move a Story so that it follows another one on the route — or to the very front, with
 * `afterStoryId` of `null`.
 *
 * One row is written: the new place is the midpoint of the two Stories the moved one now
 * sits between, so nothing else on the route moves and no place is re-numbered.
 */
export async function moveStoryOnPath(
  pathId: string,
  storyId: string,
  afterStoryId: string | null
): Promise<void> {
  if (afterStoryId === storyId) {
    throw new Refusal("invalid", "A Story cannot be placed after itself.");
  }
  known(pathId, "Path");
  known(storyId, "Story");
  if (afterStoryId !== null) known(afterStoryId, "Story");

  if (afterStoryId === null) {
    // Half of whatever the first place is. Halving the smallest position rather than
    // subtracting a gap from it, so the front of a route can be reached any number of
    // times without ever reaching zero.
    const rows = await query<{ moved: string }>(
      `with moved as (
         update path_item i
            set position = coalesce(
                  (select min(o.position) from path_item o
                    where o.path_id = $1 and o.story_id <> $2) * 0.5,
                  i.position)
          where i.path_id = $1 and i.story_id = $2
         returning i.story_id
       )
       select count(*)::text as moved from moved`,
      [pathId, storyId]
    );

    if (rows[0]?.moved === "0") {
      throw new Refusal("not-found", "That Story is not on this Path.");
    }
    return;
  }

  const rows = await query<{ moved: string; anchor: string; stop: string }>(
    `with anchor as (
       select position from path_item where path_id = $1 and story_id = $3
     ),
     follower as (
       select min(position) as position
         from path_item
        where path_id = $1
          and story_id <> $2
          and position > (select position from anchor)
     ),
     moved as (
       update path_item
          set position = case
                when (select position from follower) is null
                  then (select position from anchor) + $4
                else ((select position from anchor) + (select position from follower)) * 0.5
              end
        where path_id = $1 and story_id = $2 and exists (select 1 from anchor)
       returning story_id
     )
     select (select count(*) from moved)::text  as moved,
            (select count(*) from anchor)::text as anchor,
            (select count(*) from path_item where path_id = $1 and story_id = $2)::text as stop`,
    [pathId, storyId, afterStoryId, GAP]
  );

  const [counts] = rows;
  if (!counts) throw new Error("moving a Story on a Path returned no row");
  if (counts.moved !== "0") return;
  if (counts.stop === "0") throw new Refusal("not-found", "That Story is not on this Path.");
  throw new Refusal("not-found", "The Story it was to follow is not on this Path.");
}

/**
 * Move a Story one place earlier on the route. The first Story stays where it is.
 *
 * The verb the screen's arrows call, and the reason they need no JavaScript: one place
 * earlier is a fact about the route, so the page does not have to know which Story is
 * the new neighbour in order to submit a form. One row is written, as with every move.
 */
export async function moveStoryEarlier(pathId: string, storyId: string): Promise<void> {
  await nudge(pathId, storyId, {
    // The place before this one, and the place before that: the Story lands between
    // them, which is one place earlier.
    neighbour: "max(position) filter (where position < (select position from here))",
    beyond: "max(position) filter (where position < (select position from neighbour))",
    // Nothing before the neighbour means the neighbour is the front of the route.
    edge: "(select position from neighbour) * 0.5",
    // Halving the front place needs no room made for it, so this direction binds no gap.
    gap: false,
  });
}

/** Move a Story one place later on the route. The last Story stays where it is. */
export async function moveStoryLater(pathId: string, storyId: string): Promise<void> {
  await nudge(pathId, storyId, {
    neighbour: "min(position) filter (where position > (select position from here))",
    beyond: "min(position) filter (where position > (select position from neighbour))",
    edge: "(select position from neighbour) + $3",
    gap: true,
  });
}

/**
 * One place earlier or one place later, which are the same statement read in two
 * directions: find the neighbour, find what lies beyond it, and land in between.
 *
 * The fragments are this module's own SQL and never a caller's — no value reaches a
 * statement except as a parameter.
 */
async function nudge(
  pathId: string,
  storyId: string,
  direction: { neighbour: string; beyond: string; edge: string; gap: boolean }
): Promise<void> {
  known(pathId, "Path");
  known(storyId, "Story");

  const rows = await query<{ moved: string }>(
    `with here as (
       select position from path_item where path_id = $1 and story_id = $2
     ),
     neighbour as (
       select ${direction.neighbour} as position from path_item where path_id = $1
     ),
     beyond as (
       select ${direction.beyond} as position from path_item where path_id = $1
     ),
     moved as (
       update path_item i
          set position = case
                -- No neighbour in that direction: the Story is already at that end of
                -- the route, and asking again is not an error.
                when (select position from neighbour) is null then i.position
                when (select position from beyond) is null then ${direction.edge}
                else ((select position from neighbour) + (select position from beyond)) * 0.5
              end
        where i.path_id = $1 and i.story_id = $2 and exists (select 1 from here)
       returning i.story_id
     )
     select count(*)::text as moved from moved`,
    direction.gap ? [pathId, storyId, GAP] : [pathId, storyId]
  );

  if (rows[0]?.moved === "0") {
    throw new Refusal("not-found", "That Story is not on this Path.");
  }
}

/** What declaring a constraint needs. */
export type NewConstraint = {
  /** The sentence, as the owner would say it out loud. */
  prose: string;
  /** The Path it holds over, or nothing at all for the whole library. */
  pathId?: string | null;
};

/**
 * Record something the owner has declared about how they want to read — *"don't
 * accumulate too many unread books"*, *"take it slowly, given the cost"*. Returns its id.
 *
 * It is an **instruction to the external advisor**, not a note to self (ADR-0002), and
 * nothing in this application reads it as anything but prose. Given a `pathId` it holds
 * over that route; given none it holds over the whole library.
 */
export async function declareConstraint(constraint: NewConstraint): Promise<string> {
  if (constraint.pathId) known(constraint.pathId, "Path");

  const rows = await refusing(
    () =>
      query<{ id: string }>(
        "insert into declared_constraint (path_id, prose) values ($1, btrim($2)) returning id",
        [constraint.pathId ?? null, constraint.prose]
      ),
    (name) => {
      if (name === "declared_constraint_prose_is_not_blank")
        return "A constraint is a sentence the recommender can read.";
      if (name === "declared_constraint_path_exists") return "That Path is not in the library.";
      return "That constraint could not be recorded.";
    }
  );

  const [declared] = rows;
  if (!declared) throw new Error("insert into declared_constraint returned no row");
  return declared.id;
}

/** Withdraw a declared constraint. The advisor stops being told it. */
export async function withdrawConstraint(constraintId: string): Promise<void> {
  known(constraintId, "constraint");

  const withdrawn = await query<{ id: string }>(
    "delete from declared_constraint where id = $1 returning id",
    [constraintId]
  );

  if (withdrawn.length === 0) {
    throw new Refusal("not-found", "That constraint is not in the library.");
  }
}
