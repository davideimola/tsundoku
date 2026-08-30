/**
 * THE DESTINATIONS, as data rather than as markup.
 *
 * It is a module of its own — and not a constant inside the shell — for two reasons. The
 * first is that `src/app/(owner)/shell.test.ts` reads it: the wall that says every screen
 * in this group is reachable has to compare the map against the route tree, and a list
 * embedded in a client component with a `"use client"` on top of it is not a thing a node
 * test imports. The second is that the desk and the phone render the *same* map at two
 * widths, so a route that existed on one and not the other would be a bug nobody sees
 * until they are holding the phone.
 *
 * **Three sections, because the owner asks three different questions at three different
 * moments** — not because nine links wanted grouping. *Reading* is the desk at night:
 * what am I in the middle of, what is next, what did I think of it. *Owning* is the
 * question asked standing in a fumetteria: do I have this, what am I missing, what was I
 * going to buy. *Repairing* is the maintenance of the catalogue itself — what an
 * assistant asked for, and the people nobody has credited yet. A screen goes in the
 * section whose question it answers, and if it answers none of them the section is wrong
 * rather than the screen.
 *
 * No icons, and no icon library: #19 bought none, one mark does not earn a dependency,
 * and nine destinations named in words are shorter to read than nine glyphs to learn.
 */

export type Destination = {
  /** The route, exactly as it appears in the tree. The wall compares these to the files. */
  readonly href: string;
  /** The same word at both widths. A bottom bar that renames things is a second vocabulary. */
  readonly label: string;
  /**
   * On the phone's bottom bar rather than behind its *More*.
   *
   * It is a property of the destination and not a list kept beside this one, so that the
   * question — *is this worth a thumb?* — is answered where the destination is declared
   * and cannot drift out of step with it.
   *
   * Four carry it. The home page is where an evening starts, the Reading list is what
   * gets opened on a sofa, the Collection is the one question that is *only* ever asked
   * away from the desk — do I already have volume 12 — and the Inbox is the one that
   * fills up while nobody is looking. Nobody opens Paths standing in a fumetteria, and
   * nobody credits an artist one-handed.
   */
  readonly onTheBar?: true;
};

export type Section = {
  readonly title: "Reading" | "Owning" | "Repairing";
  readonly destinations: readonly Destination[];
};

export const NAVIGATION: readonly Section[] = [
  {
    title: "Reading",
    destinations: [
      { href: "/", label: "Home", onTheBar: true },
      { href: "/reading-list", label: "Reading list", onTheBar: true },
      { href: "/stories", label: "Stories" },
      { href: "/paths", label: "Paths" },
    ],
  },
  {
    title: "Owning",
    destinations: [
      { href: "/collection", label: "Collection", onTheBar: true },
      { href: "/series", label: "Series" },
      { href: "/wishes", label: "Wishes" },
    ],
  },
  {
    title: "Repairing",
    destinations: [
      { href: "/inbox", label: "Inbox", onTheBar: true },
      { href: "/credits", label: "Credits" },
    ],
  },
];

/** Every destination, in the order the sections give them. */
export const DESTINATIONS: readonly Destination[] = NAVIGATION.flatMap(
  (section) => section.destinations
);

/** The phone's bottom bar, in map order. */
export const ON_THE_BAR: readonly Destination[] = DESTINATIONS.filter(
  (destination) => destination.onTheBar
);

/**
 * Everything the bar does not carry, still grouped and still in map order, which is what
 * the phone's *More* opens onto. A section the bar has emptied is dropped rather than
 * rendered as a heading over nothing.
 */
export const BEHIND_MORE: readonly Section[] = NAVIGATION.map((section) => ({
  ...section,
  destinations: section.destinations.filter((destination) => !destination.onTheBar),
})).filter((section) => section.destinations.length > 0);

/**
 * Which destination the owner is inside, so the navigation can say so without them
 * reading the URL.
 *
 * It is a function and not a comparison in the markup because of the two cases that
 * comparison gets wrong: a detail screen is *inside* its section — `/series/12` is still
 * Series — and `/` is a prefix of every path there is, so a naive `startsWith` would light
 * up Home on every screen in the application. Matching is on whole segments for the same
 * reason: `/series` must not claim a future `/series-notes`.
 *
 * Returns `undefined` where the path is no destination's, which is a real answer and not a
 * failure: `/signin` is served outside this group entirely.
 */
export function currentDestination(pathname: string): string | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/" || path === "") return "/";

  return DESTINATIONS.find(
    (destination) =>
      destination.href !== "/" &&
      (path === destination.href || path.startsWith(`${destination.href}/`))
  )?.href;
}
