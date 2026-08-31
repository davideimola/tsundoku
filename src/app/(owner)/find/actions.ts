"use server";

import { findInTheLibrary } from "@/core/queries/finder";
import { requireOwner } from "@/lib/auth/owner";
import { groupFindings, recordHref } from "./kinds";
import type { SuggestionGroup } from "./suggestion";

// The suggestion list's one Server Function, and the only thing on the finder that a script
// is needed for.
//
// **It is a read behind `"use server"`, which is unusual in this group and deliberate.**
// Every other `actions.ts` here writes; this one asks the question `page.tsx` asks, one
// keystroke at a time, so the field under the owner's cursor can answer without a
// navigation. It is a Server Function rather than a route handler because the wall is the
// same call either way (`src/app/gated.test.ts` requires it of both) and a route handler
// would be a second URL over one query, with a second shape of answer to keep in step.
//
// **Nothing depends on it.** The field is a plain `GET` form to `/find`, which answers with
// the same records out of the same query (ADR-0010). If this call never arrives — a script
// that did not load, a shop's signal — the owner presses enter and gets the screen. That is
// what makes the list a convenience rather than the feature, and it is why the list itself
// has no test (#25): what it renders is decided here and in `./kinds`, and what it renders
// is decided *whole* — the client is handed headings and hrefs, so there is no derivation
// left on the other side of the wire to get wrong.

/** A suggestion list's worth. Five is what fits under a field without covering the screen. */
const SUGGESTIONS = 5;

/**
 * What the library holds that is called what has been typed so far, grouped and ready to
 * draw.
 *
 * The wall first, like every entry point behind the gate: a layout does not run for a Server
 * Function, so this is one of the places the gate is enforced rather than assumed.
 */
export async function suggest(term: string): Promise<SuggestionGroup[]> {
  await requireOwner();

  // Read as untrusted. A Server Function is a POST, so `term` arrives as whatever the
  // caller sent whatever the signature says.
  if (typeof term !== "string") return [];

  const found = await findInTheLibrary({ term, perKind: SUGGESTIONS });

  return groupFindings(found).map((group) => ({
    heading: group.heading,
    suggestions: group.findings.map((finding) => ({
      name: finding.name,
      qualifier: finding.qualifier,
      href: recordHref(finding),
    })),
  }));
}
