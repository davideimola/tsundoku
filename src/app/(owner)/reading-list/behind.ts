import type { ReadingListEntry, ReadingListRoute } from "@/core/queries/reading-list";
import { theKeyOf } from "@/core/queries/reading-list";

// **What stands behind a route's first stop**, and how the reserve is shaped around it. It is
// a screen's own derivation for the reason `./entry.ts` is one: a judgement about *reading* a
// composed list, not about the model.
//
// The core already answers with every stop still ahead on every active route
// (`stillAheadOnActivePaths`, #40) — that is what makes pinning the second and the third stop
// possible at all — and this file is what stops that answer from arriving as a wall. *Marvel*
// is ten stops and *Slam Dunk* twenty; laid out flat, one route is the whole screen and the
// Series the owner is collecting is below the fold. So a route's stops are drawn as **one row
// that leads and the rest standing behind it** — the first stop is the row, and what is behind
// it is shown on a press.
//
// **The count is on the row and never behind the press**, which is what keeps this inside the
// rule the Wishes screen is the case for (AGENTS.md: *what is folded away is not there*). What
// is put away is a set of further rows, each of which is on the screen the moment it matters —
// and the fact that there are nine of them, and what route they are on, is readable without a
// tap. A number that decides an act is never what goes away here.
//
// **Which route is shown is the URL** (`?route=…`), for the reason every drawer's open state
// is: pinning is a POST that redirects back, so a disclosure the browser owned would slam shut
// under the owner every time they pinned a stop out of it — and pinning the second and then
// the third stop of one route is precisely what this screen exists to allow. In the URL it
// survives the write, the refresh and the back button, and it costs no script at all.
//
// The word this file does not use is **queue**, which the glossary bans on this screen
// (CONTEXT.md, *Reading list*) — and which #40 had to take back out of the core for the same
// reason. What a route has is *stops*, and what is not the first of them stands *behind* it.

/** The parameter naming a route whose stops are shown. Three files read it. */
export const THE_ROUTE = "route";

/** One stop standing behind the row that leads its route. */
export type StopBehind = {
  entry: ReadingListEntry;
  /** Where it stands among what is still to read on that route, counted from one. */
  place: number;
};

/**
 * What stands behind one row on one route, and whether the owner is looking at it.
 *
 * `route` is the route as the *leading* row stands on it, so its `place` is the leading
 * stop's and not the first of these — `1` in the ordinary case, and higher where the owner
 * has already pinned what was in front.
 */
export type WhatStandsBehind = {
  route: ReadingListRoute;
  /** In the route's own order, which is the only order a route has. Never empty. */
  stops: StopBehind[];
  /** Whether the owner asked to see them. Read off the URL against the routes actually here. */
  shown: boolean;
};

/** One row of the reserve: an entry, and what stands behind it on the routes it leads. */
export type ReserveRow = {
  entry: ReadingListEntry;
  /**
   * The routes this row leads, in the order its own reasons name them. Empty on almost every
   * row — a Want, a Series position, and any route with nothing behind its first stop.
   */
  behind: WhatStandsBehind[];
};

/**
 * **The routes the owner asked to see**, out of a URL's parameter or a form's fields.
 *
 * One reader rather than two, because both doors of this screen normalise the same thing: the
 * page reads it off `searchParams`, where a repeated parameter arrives as an array and a
 * single one as a string, and the write side reads it back off the `FormData` the row carried
 * it in. Two copies of that walk is how the two come to disagree about a blank one.
 *
 * Nothing here checks that a route exists. What the routes actually are is
 * `theReserveAsRows`'s business, and `?route=banana` shows nothing because no row leads a
 * route by that name.
 */
export function theRoutesAskedFor(said: unknown): string[] {
  const values = Array.isArray(said) ? said : [said];

  return values.flatMap((value) => {
    if (typeof value !== "string") return [];
    const trimmed = value.trim();
    return trimmed === "" ? [] : [trimmed];
  });
}

/**
 * **The reserve as it is drawn**: the rows that lead, each carrying what stands behind it.
 *
 * One rule decides which entries are put behind a row, and it is deliberately narrow: an entry
 * stands behind a route's first stop **only when that one fact is the whole of why it is on
 * the list**. A stop that is also wanted, that is next on a second route, or that stands
 * behind the first stop of *two* routes keeps its own row — one Story is one row however many
 * reasons put it there (CONTEXT.md), and a Story drawn once under Marvel and again under DC
 * would be the very duplication the head-and-reserve split was built to end.
 *
 * The two-route case is the one worth naming, because it is the case the narrow rule exists
 * for: an entry belonging behind two rows has to belong behind neither, and its own row is
 * where both of its reasons are said out loud in one place.
 *
 * The consequence is worth stating: the numbers behind a row can have a gap in them. *2* and
 * *4* under a route whose third stop is also wanted is correct — the third stop is on the
 * screen, a few rows up, carrying both of its reasons.
 *
 * Nothing is dropped. Every entry of the reserve is either a row here or stands behind exactly
 * one of them, which is the invariant that matters: this half of the list is where the owner
 * looks for something they have not decided about yet, and a silent loss here would be
 * invisible by construction.
 */
export function theReserveAsRows(reserve: ReadingListEntry[], shown: string[]): ReserveRow[] {
  // The rows that stand on their own, before any route has claimed one. Everything the reserve
  // holds is one of these unless standing behind a first stop is all it is.
  const leads = new Set(reserve.filter((entry) => !onlyBehind(entry)).map(keyOf));

  // Every route the reserve mentions, in the order it composed them, with its stops in the
  // route's own order. Sorted by place rather than trusted to arrive that way: the order this
  // reads by is the owner's, and it is cheap to be sure of it here.
  const routes = new Map<string, StopBehind[]>();
  for (const entry of reserve) {
    for (const reason of entry.reasons) {
      if (!reason.path) continue;

      const stops = routes.get(reason.path.id) ?? [];
      stops.push({ entry, place: reason.path.place });
      routes.set(reason.path.id, stops);
    }
  }

  // **Which row leads each route.** Its frontmost stop that already stands on its own, and
  // otherwise its frontmost stop, promoted — because a route whose first stops are all pinned
  // still has to be reachable from this half, and the alternative to promoting one is stops
  // nobody can see hanging off nothing.
  const leaders = new Map<string, string>();
  for (const [id, stops] of routes) {
    stops.sort((first, second) => first.place - second.place);

    const leader = stops.find((stop) => leads.has(keyOf(stop.entry))) ?? stops[0];
    if (!leader) continue;

    leads.add(keyOf(leader.entry));
    leaders.set(id, keyOf(leader.entry));
  }

  /** What stands behind one leading row, in the order its own reasons name the routes. */
  const behindThe = (entry: ReadingListEntry): WhatStandsBehind[] =>
    entry.reasons.flatMap((reason) => {
      const route = reason.path;
      if (!route || leaders.get(route.id) !== keyOf(entry)) return [];

      const stops = (routes.get(route.id) ?? []).filter(
        (stop) => stop.place > route.place && !leads.has(keyOf(stop.entry))
      );

      // A route with nothing behind its first stop offers no press rather than an empty one: a
      // control that opens onto nothing is one the owner learns to distrust.
      return stops.length === 0 ? [] : [{ route, stops, shown: shown.includes(route.id) }];
    });

  return reserve
    .filter((entry) => leads.has(keyOf(entry)))
    .map((entry) => ({ entry, behind: behindThe(entry) }));
}

/**
 * Whether standing behind **one** route's first stop is the whole of why this entry is here.
 *
 * The count is the load-bearing half. Two reasons means two places the entry would have to be
 * drawn, and an entry drawn twice is the thing this whole file exists to stop — so *one* reason
 * and it is a stop that is not the route's next one, or the entry leads a row of its own.
 *
 * `reasons` is never empty — the core composes a row *from* a reason — so this is a real
 * question about every entry and not a vacuous truth about an empty one.
 */
function onlyBehind(entry: ReadingListEntry): boolean {
  const only = entry.reasons.length === 1 ? entry.reasons[0].path : null;
  return only !== null && only.place > 1;
}

/** An entry's identity, which is the core's encoding and never a second one of this file's. */
function keyOf(entry: ReadingListEntry): string {
  return theKeyOf(entry.subject);
}

/**
 * **What the reserve's own heading says**: how much of it could be started tonight, and how
 * much of it is standing behind a row rather than on one.
 *
 * The second half is the whole reason it is a sentence rather than the count beside the label:
 * the number of entries the list composed is printed there, so without this the half would
 * read as fewer rows than it says it has. Saying it here is what stops the fold from being a
 * quiet subtraction.
 */
export function theReserveIsSaid(tonight: number, behind: number): string {
  const said = `In no order. ${tonight} of the whole list I could start tonight.`;
  // One of them *stands*. A count that agrees with its verb on every number but one is a
  // sentence the owner reads as a bug in the library rather than in the prose.
  const stand = behind === 1 ? "stands" : "stand";
  if (behind === 0) return said;

  return `${said} ${behind} of them ${stand} behind a route's first stop — open a route to pin one out of turn.`;
}

/**
 * The Reading list's address with one route's stops shown or put away, and every other route
 * left as it was.
 *
 * The screen's other parameters are deliberately **not** carried through, which is the
 * opposite of the Collection's rule and for the same reason it states: the only others here
 * are `refused` and `wished`, and both are the answer to a *write*. Looking behind a row is
 * not that write, so carrying the banner along would print a report again over an act nobody
 * just performed.
 */
export function theAddressWith(shown: string[], asked: { show?: string; hide?: string }): string {
  const routes = new Set(shown);
  if (asked.hide) routes.delete(asked.hide);
  if (asked.show) routes.add(asked.show);

  const said = new URLSearchParams([...routes].map((id) => [THE_ROUTE, id])).toString();
  return said === "" ? "/reading-list" : `/reading-list?${said}`;
}
