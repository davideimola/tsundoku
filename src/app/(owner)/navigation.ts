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
 * No icons on the destinations, and no icon library: #19 bought none, one mark does not
 * earn a dependency, and destinations named in words are shorter to read than glyphs to
 * learn. The two screens the chrome carries *outside* this map are the exception and are
 * drawn rather than named — a magnifier and a spine joining the pile — because a control
 * repeated on every screen is learned once and then only recognised.
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

/**
 * **The finder, which is a screen in this group and deliberately not a destination** (#25).
 *
 * It is declared here rather than left as a string in the shell for the same reason the map
 * is: `./shell.test.ts` reads this module, and the wall that says every screen is reachable
 * has to know about the one screen that is reachable another way. Naming it here is what
 * turns "the finder is the exception" from a paragraph into the one line the test points at.
 *
 * Why it is not in the map: the three sections are the three questions the owner asks at
 * three different moments, and *find* is not a fourth question — it is how they get to the
 * answer to any of them. Put under *Reading* it would be a lie about what it is for; given a
 * section of its own it would make the sidebar claim four questions where there are three.
 *
 * What replaces the line, and why the rule is not weakened: the shell puts the way into it
 * beside the mark on **every** screen, at both widths, which is stronger than a link in a
 * list. The rule the wall protects is that no screen is reachable only by typing its URL,
 * and this one is reachable from a glyph the owner never has to leave a screen to reach —
 * and from `⌘K`, which no destination in the map has. The glyph is itself a link *to* this
 * screen, so the claim holds with nothing running in the browser.
 */
export const THE_FINDER: Destination = { href: "/find", label: "Find" };

/**
 * **The door, which is the second screen in this group that is deliberately not a
 * destination** (#45, placed here).
 *
 * It was a line in *Owning* for one release, and it read as a misfiling because it was one.
 * Saying *I bought it*, *I want to buy it*, *I read it* and *I want to read it* reaches all
 * three sections at once, so the door belongs to none of them — and the reason is sharper than that. The three
 * sections are three questions the owner **asks**: what am I in the middle of, do I have
 * this, what needs repairing. The door is the one place they make a **statement**. A
 * statement filed among questions is a category error, and it is what a fourth section would
 * have made permanent.
 *
 * So it takes the finder's exception rather than a line of its own, and for the same reason
 * the finder takes it: the chrome carries it on **every** screen at **both** widths, which
 * is stronger than a line in a list. The two are a pair — the finder asks the library what
 * it already holds, the door tells it something new — and they are the only two. A third
 * would be an argument to have here, in this module, before it is an element in the shell.
 *
 * `./door` is what it looks like, and why it is the one filled control in the chrome. It is
 * still not on the phone's bottom bar: that bar is four *destinations*, and the door is not
 * one of them.
 */
export const THE_DOOR: Destination = { href: "/add", label: "Add to the library" };

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
 * failure: `/signin` is served outside this group entirely, and `/find` is inside it and
 * deliberately not on the map (`THE_FINDER`) — a navigation that marked a section while the
 * owner was passing through the finder would be telling them where they are not.
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
