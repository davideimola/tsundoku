import { describe, expect, it } from "vitest";

import { SRC, sourceFiles } from "@/test/source-files";

// "No page containing collection data renders for an unauthenticated visitor" is the
// criterion this slice exists for, and it is not a property of any one page: it is a
// property of **where pages are put**. Eleven slices after this one add screens over
// the Collection, the Stories, the Readings and the Reading list, and none of them is
// going to read this file first.
//
// So the placement is a test rather than a paragraph. A page added outside the gated
// route group compiles, renders and reads Postgres exactly as intended — it has simply
// been served to whoever has the URL, and nothing else in the repo would notice.
//
// The rule, in two halves:
//
//   1. every page lives in `(owner)` — behind the gate — or in `(public)`, which is
//      the deliberate act of putting a page outside it;
//   2. every page and every Server Function file inside `(owner)` calls
//      `requireOwner()`, because the proxy is ergonomics and not the wall: a layout
//      does not run for a Server Function, and Next's own guidance is to verify inside
//      each one rather than to rely on the proxy.

const APP = `${SRC}app`;

const pages = sourceFiles(APP).filter((read) => /(?:^|\/)page\.tsx$/.test(read.file));
const serverFunctions = sourceFiles(APP).filter((read) => /(?:^|\/)actions\.ts$/.test(read.file));

/** Files under the gated route group, which is the only group that touches data. */
function gated(files: typeof pages) {
  return files.filter((read) => read.file.startsWith("(owner)/"));
}

// The call, not merely the import: a file that imports the wall and forgets to await it
// has the same hole as one that never heard of it.
const CALLS_THE_WALL = /requireOwner\s*\(/;

describe("where a page is allowed to live", () => {
  // Guards itself as well as the app: a filter that matched nothing would fail here
  // rather than pass the two expectations below for the wrong reason.
  it("finds the pages it is about to check", () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it("is inside (owner) or inside (public), and nowhere else", () => {
    const homeless = pages
      .map((read) => read.file)
      .filter((file) => !file.startsWith("(owner)/") && !file.startsWith("(public)/"));

    expect(homeless).toEqual([]);
  });
});

describe("the wall behind the gated route group", () => {
  it("is called by every page in it", () => {
    const unwalled = gated(pages)
      .filter((read) => !CALLS_THE_WALL.test(read.source))
      .map((read) => read.file);

    expect(unwalled).toEqual([]);
  });

  it("is called by every Server Function file in it", () => {
    const unwalled = gated(serverFunctions)
      .filter((read) => !CALLS_THE_WALL.test(read.source))
      .map((read) => read.file);

    expect(unwalled).toEqual([]);
  });
});
