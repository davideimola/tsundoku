import "server-only";

import { query } from "../db.ts";
import { STORY_STATE, type StoryState, type StoryType } from "./story.ts";

// What the owner and an **external reader** ask about a Path. This file is the one both
// doors read: the screen lays out what it returns, and the MCP door hands the same shapes
// to an assistant, which is what lets a recommendation extend a route the owner already
// chose rather than guess at a genre (ADR-0002, user stories 34 and 37).
//
// Two derivations live here, and both replace a column the owner maintains by hand today.
//
// - **What comes next on a route** is the `Prossimo` cell of every path in the sheets,
//   recomputed by the owner every time they finish something. Here it is
//   `nextUnreadOnPath`, and there is nowhere it could be stored stale.
// - **Whether a Story is unread** is not a column either: it is the Story's state derived
//   from its Readings (`queries/story.ts`), and this file compares against it rather than
//   keeping a second answer.
//
// The order of a route is read and never computed. Every statement below orders by
// `path_item.position`, which only the owner's verbs write.

/** One stop on a route: the Story, and where the owner is with it. */
export type PathStop = {
  storyId: string;
  title: string;
  /** A Story's Type, which a Path crosses freely — it constrains nothing here. */
  type: StoryType;
  /** Derived from the Story's Readings, never stored. `to-read` is what "unread" means. */
  state: StoryState;
};

/** A constraint the owner has declared, as prose and nothing else. */
export type PathConstraint = {
  id: string;
  /** The sentence, in the owner's words. Nothing here interprets it. */
  prose: string;
  declaredAt: string;
};

/** A declared constraint with the scope it holds over. `path` is `null` for the library. */
export type DeclaredConstraint = PathConstraint & {
  path: { id: string; name: string } | null;
};

/** A Path as a list shows it: enough to choose one, and what comes next on it. */
export type PathSummary = {
  id: string;
  name: string;
  /** The owner's own words about the route, where they wrote some. */
  intent: string | null;
  /** The Reading list composes itself from the active ones only. */
  active: boolean;
  /** How many Stories are on the route. */
  stops: number;
  /** How many of them the owner has not read. Zero means the route is finished. */
  unread: number;
  /** The next unread Story, or `null` where the route is exhausted. */
  next: PathStop | null;
};

/** One Path, whole: the route in the owner's order, and what they declared about it. */
export type Path = {
  id: string;
  name: string;
  intent: string | null;
  active: boolean;
  /** In the owner's order, which is the only order there is. */
  stops: PathStop[];
  /** Declared on this route. The ones holding over the whole library are not here. */
  constraints: PathConstraint[];
  /** The next unread Story, or `null` where the route is exhausted. */
  next: PathStop | null;
};

// One stop, as a subquery builds it. `s` is the Story and `i` is its place on the route.
const STOP = `
  jsonb_build_object(
    'storyId', s.id,
    'title', s.title,
    'type', jsonb_build_object('id', t.id, 'name', t.name),
    'state', ${STORY_STATE}
  )`;

// The next unread Story of one route, as a correlated subquery over `p`.
//
// `= 'to-read'` and not "anything but read": a Story the owner is **in the middle of** is
// not what comes next, and neither is one they abandoned — recommending either would be
// telling them to start something they already started (user story 33). Ordered by the
// owner's judgement and limited to one, so an exhausted route answers with nothing.
const NEXT = `
  (select ${STOP}
     from path_item i
     join story s on s.id = i.story_id
     join type t on t.id = s.type_id
    where i.path_id = p.id and ${STORY_STATE} = 'to-read'
    order by i.position
    limit 1)`;

/**
 * Every Path the owner has defined, with what comes next on each.
 *
 * The active routes first and each group by name: active is the distinction the owner
 * reads this list for, and within it a name is the only order that is not an opinion the
 * screen was never asked for.
 */
export async function listPaths(): Promise<PathSummary[]> {
  return query<PathSummary>(
    `select
       p.id,
       p.name,
       p.intent,
       p.active,
       (select count(*)::int from path_item i where i.path_id = p.id) as stops,
       (select count(*)::int
          from path_item i
          join story s on s.id = i.story_id
         where i.path_id = p.id and ${STORY_STATE} = 'to-read') as unread,
       ${NEXT} as next
     from path p
    order by p.active desc, lower(p.name)`
  );
}

/**
 * One Path with its route in the owner's order, the constraints declared on it, and what
 * comes next. `null` when there is no such Path.
 *
 * One statement rather than one per list: the route and what comes next on it are the
 * answer to the same question, and reading them separately would be reading two moments.
 */
export async function findPath(pathId: string): Promise<Path | null> {
  const rows = await query<Path>(
    `select
       p.id,
       p.name,
       p.intent,
       p.active,
       coalesce((
         select jsonb_agg(${STOP} order by i.position)
           from path_item i
           join story s on s.id = i.story_id
           join type t on t.id = s.type_id
          where i.path_id = p.id
       ), '[]'::jsonb) as stops,
       coalesce((
         select jsonb_agg(
           jsonb_build_object('id', c.id, 'prose', c.prose, 'declaredAt', c.declared_at::text)
           order by c.declared_at
         )
           from declared_constraint c
          where c.path_id = p.id
       ), '[]'::jsonb) as constraints,
       ${NEXT} as next
     from path p
    where p.id = $1`,
    [pathId]
  );

  return rows[0] ?? null;
}

/**
 * **The next unread Story of one Path**, or `null` when the route is exhausted.
 *
 * This is the function the Reading list (#11) composes from, one call per active Path —
 * or `nextUnreadOnActivePaths` below, which is the same answer for all of them in one
 * statement. Read both before writing a third.
 *
 * "Unread" is the Story's derived state being `to-read` and never a column: a Story the
 * owner is currently reading is skipped rather than offered, and so is one they
 * abandoned. **An exhausted Path answers `null`** — it does not fall back to the first
 * stop, and it does not report the last one as still ahead. A Path with nothing unread
 * left is a route the owner has walked, and the honest answer for it is nothing.
 *
 * Whether the Path is active is not asked here. A route put aside can still be walked
 * deliberately; composing the Reading list is where `active` is the filter, which is what
 * `nextUnreadOnActivePaths` does.
 */
export async function nextUnreadOnPath(pathId: string): Promise<PathStop | null> {
  const rows = await query<{ next: PathStop | null }>(
    `select ${NEXT} as next from path p where p.id = $1`,
    [pathId]
  );

  return rows[0]?.next ?? null;
}

/** A Path and the Story that comes next on it. */
export type PathAhead = {
  path: { id: string; name: string; intent: string | null };
  next: PathStop;
};

/**
 * **What comes next on every active Path**, one entry each, in one statement.
 *
 * The Reading list (#11) composes itself from exactly this (user story 22): the entries
 * come back in the owner's order of routes, and a Path is simply **absent when it is
 * exhausted** — there is no entry with a `null` next to filter out, because a route with
 * nothing unread left has nothing to contribute. Inactive Paths are absent for the same
 * reason: the owner put them aside.
 */
export async function nextUnreadOnActivePaths(): Promise<PathAhead[]> {
  // A lateral join rather than the subquery plus a `is not null`: an exhausted route
  // produces no row on this side, so "absent when exhausted" is the join's own doing and
  // not a filter somebody has to remember to write.
  return query<PathAhead>(
    `select
       jsonb_build_object('id', p.id, 'name', p.name, 'intent', p.intent) as path,
       ahead.stop as next
     from path p
     cross join lateral (
       select ${STOP} as stop
         from path_item i
         join story s on s.id = i.story_id
         join type t on t.id = s.type_id
        where i.path_id = p.id and ${STORY_STATE} = 'to-read'
        order by i.position
        limit 1
     ) ahead
    where p.active
    order by lower(p.name)`
  );
}

/**
 * Every constraint the owner has declared, the global ones first and then route by route.
 *
 * This is what an assistant reads before it suggests anything (user story 37, ADR-0002),
 * which is why the global ones lead: they hold over whatever it is about to say. The
 * prose is returned as it was written and nothing here parses it — an instruction to a
 * reader that reads prose does not need a schema.
 */
export async function listDeclaredConstraints(): Promise<DeclaredConstraint[]> {
  return query<DeclaredConstraint>(
    `select
       c.id,
       c.prose,
       c.declared_at::text as "declaredAt",
       case
         when p.id is null then null
         else jsonb_build_object('id', p.id, 'name', p.name)
       end as path
     from declared_constraint c
     left join path p on p.id = c.path_id
    order by (p.id is not null), lower(p.name) nulls first, c.declared_at`
  );
}
