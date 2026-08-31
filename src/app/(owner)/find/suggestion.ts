// What a suggestion is once it has crossed the wire, and the reason it is a module of its
// own: the client component that draws the list and the Server Function that fills it have
// to agree on one shape, and neither of them may import the other's.
//
// `../finder.tsx` is `"use client"`; `./actions.ts` reaches `@/core/queries/finder`, which is
// `server-only` and a build error inside a client bundle. So the shape lives here, in a file
// that is neither — plain types, no directive, nothing imported.
//
// It is **already drawn**, which is the point. A suggestion arrives as a name, a qualifier
// and the href enter lands on: the grouping, the words and the routes are decided on the
// server in `./kinds`, so the list on the other side holds no derivation of its own. That is
// what makes it a component with nothing to test (#25) rather than one that has been left
// untested.

/** One record, as a row under the field. */
export type Suggestion = {
  /** What it is called. */
  name: string;
  /** The one word that tells it from another of the same name, or `null`. */
  qualifier: string | null;
  /** Where enter lands: the record itself, never a search for it. */
  href: string;
};

/** One band of the list: what the group is called, and the records in it. */
export type SuggestionGroup = {
  heading: string;
  suggestions: Suggestion[];
};
