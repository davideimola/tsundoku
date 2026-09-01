// **The acts on a route that need a field**, named once — and the reason this is a module
// rather than two constants in the page is the same one `collection/[id]/standing.ts` gives:
// the page reads `?panel=` against these names, and the Server Function behind each form has
// to send the owner *back* into the same panel when the verb refuses. Two files spelling one
// panel is a rename that compiles, renders and silently drops a refusal behind a closed
// drawer — which is the failure the drawer contract exists to prevent (`AGENTS.md`, *Where a
// form the owner opened deliberately goes*).
//
// It is reached from a server component and from a `"use server"` module, so it may import
// nothing: `@/core` is `server-only`, and this holds no derivation of its own — it is a
// screen's vocabulary, in the terms the acts on a Volume are.

/** Defining a Path, which is the one act with a field on `/paths`. */
export const DEFINING_A_PATH = "define";

/** Calling a route something else. Its label is the panel's title, so they cannot disagree. */
export const NAMING_A_ROUTE = "name";

/** Saying what the route is for, in the owner's own words. */
export const SAYING_WHAT_A_ROUTE_IS_FOR = "intent";

/**
 * Every panel one route's own page has.
 *
 * The page opens none the screen did not name, so a hand-typed `?panel=release` cannot stand
 * a form from another screen over a route — the honesty every filter on every wall is held
 * to.
 */
export const THE_PANELS_ON_A_ROUTE = [NAMING_A_ROUTE, SAYING_WHAT_A_ROUTE_IS_FOR] as const;
