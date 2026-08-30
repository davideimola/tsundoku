import { describe, expect, it } from "vitest";

import { SRC, sourceFiles } from "@/test/source-files";

import {
  BEHIND_MORE,
  currentDestination,
  DESTINATIONS,
  NAVIGATION,
  ON_THE_BAR,
} from "./navigation";

// The third wall in this app, and it is a wall for the same reason the other two are
// (`src/app/gated.test.ts`, `src/app/palette.test.ts`): the failure it catches is silent.
// A screen added without a line in the navigation compiles, renders and reads Postgres
// exactly as intended — it has simply been served to nobody, because the only way to
// reach it is to type the URL. That is the state this ticket found the application in:
// eight links on the home page and no `<nav>` anywhere.
//
// So the shell is a rule rather than a paragraph, in three halves:
//
//   1. **The map and the routes agree, in both directions.** Every destination is a
//      screen that exists, and every screen is a destination. The second half is the one
//      that matters: it is what makes adding a screen and forgetting the navigation a
//      failing test instead of a dead end nobody meets for a month.
//   2. **The phone is a partition, chosen rather than truncated.** Four destinations are
//      worth opening away from the desk; the rest are behind the fifth tab. Both halves
//      are read off the same map, so a route cannot exist at one width and not the other,
//      and none can fall between them.
//   3. **No screen centres itself in a column.** The width belongs to the shell now. A
//      page that puts `mx-auto` and a `max-w-*` on the same element is the 34 constraints
//      this ticket removed, growing back one screen at a time.
//
// It is a grep and a pure function, so it needs no DOM and no renderer: the two seams the
// configuration names are untouched by it, exactly as the palette's arithmetic is.

const APP = `${SRC}app`;
const GROUP = "(owner)/";

const pages = sourceFiles(APP).filter((read) => /(?:^|\/)page\.tsx$/.test(read.file));
const gated = pages.filter((read) => read.file.startsWith(GROUP));

/**
 * The route a page file answers on: `(owner)/series/page.tsx` is `/series`, and
 * `(owner)/page.tsx` is `/`.
 */
function route(file: string): string {
  const segments = file.slice(GROUP.length).replace(/\/?page\.tsx$/, "");
  return segments === "" ? "/" : `/${segments}`;
}

/** A route with a `[param]` in it is opened from a screen, never from the navigation. */
const detail = (path: string) => path.includes("[");

describe("the map and the routes agree", () => {
  // Guards itself as well as the app: a filter that matched nothing would pass both
  // directions below for the wrong reason.
  it("finds the screens it is about to check", () => {
    expect(gated.length).toBeGreaterThan(0);
    expect(DESTINATIONS.length).toBeGreaterThan(0);
  });

  it("sends every destination to a screen that exists", () => {
    const routes = new Set(gated.map((read) => route(read.file)));

    const nowhere = DESTINATIONS.map((destination) => destination.href).filter(
      (href) => !routes.has(href)
    );

    expect(nowhere).toEqual([]);
  });

  // The half that earns the file. A screen nothing links to is a screen nobody opens.
  it("carries a line for every screen in the group", () => {
    const linked = new Set(DESTINATIONS.map((destination) => destination.href));

    const unreachable = gated
      .map((read) => route(read.file))
      .filter((path) => !detail(path) && !linked.has(path));

    expect(unreachable).toEqual([]);
  });

  it("names each destination once", () => {
    const hrefs = DESTINATIONS.map((destination) => destination.href);

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  // Three, because the owner asks three different questions at three different moments.
  // Adding a fourth is a decision about the application, not a line in a list.
  it("groups them into the three questions", () => {
    expect(NAVIGATION.map((section) => section.title)).toEqual(["Reading", "Owning", "Repairing"]);
  });
});

describe("the phone", () => {
  const behindMore = BEHIND_MORE.flatMap((section) => section.destinations);

  it("carries four destinations on the bar, and the rest behind the fifth tab", () => {
    expect(ON_THE_BAR).toHaveLength(4);
    expect(behindMore.length).toBeGreaterThan(0);
  });

  // The bar and the panel are a partition of the map, not two lists that happen to add up:
  // a destination in neither is unreachable on a phone, and one in both is a tab that
  // opens a menu containing itself.
  it("splits the whole map between them, once each", () => {
    const split = [...ON_THE_BAR, ...behindMore].map((destination) => destination.href).sort();
    const all = DESTINATIONS.map((destination) => destination.href).sort();

    expect(split).toEqual(all);
  });

  // Not the labels, which are a design decision, but the count of sections the panel opens
  // onto: a section the bar has emptied is dropped rather than left as a heading over
  // nothing.
  it("opens onto no empty section", () => {
    expect(BEHIND_MORE.filter((section) => section.destinations.length === 0)).toEqual([]);
  });
});

// Where the owner is, without them reading the URL. It is a function rather than a
// comparison in the markup because a detail screen is inside a section — `/series/12` is
// still *Owning* — and because `/` is a prefix of everything, which is the bug this would
// otherwise have.
describe("where the owner is", () => {
  it.each([
    ["/", "/"],
    ["/series", "/series"],
    ["/series/12", "/series"],
    ["/reading-list", "/reading-list"],
    ["/collection/9f2c", "/collection"],
    ["/stories/1/", "/stories"],
  ])("reads %s as %s", (pathname, expected) => {
    expect(currentDestination(pathname)).toBe(expected);
  });

  it("is nowhere when the path is not a screen", () => {
    expect(currentDestination("/signin")).toBeUndefined();
  });
});

describe("no screen centres itself in a column", () => {
  // The pair, not either half. `max-w-prose` on a paragraph is measure — the line length
  // prose is read at — and it stays. What is forbidden is the pair that takes a width and
  // puts it in the middle of the window, which is what every screen in this group did
  // before the shell existed.
  const A_COLUMN = /mx-auto[^"'`]*max-w-|max-w-[a-z0-9-]+[^"'`]*mx-auto/;

  const screens = sourceFiles(APP).filter((read) => read.file.startsWith(GROUP));

  it("finds the source it is about to check", () => {
    expect(screens.length).toBeGreaterThan(0);
  });

  it("leaves the width to the shell", () => {
    const columned = screens
      // This file quotes the form it forbids, which is the one place it may appear.
      .filter((read) => read.file !== `${GROUP}shell.test.ts`)
      .filter((read) => A_COLUMN.test(read.source))
      .map((read) => read.file);

    expect(columned).toEqual([]);
  });
});
