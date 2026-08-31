import { describe, expect, it } from "vitest";

import { type Finding, FOUND_KINDS } from "@/core/queries/finder";
import { SRC, sourceFiles } from "@/test/source-files";

import { groupFindings, headingFor, recordHref } from "./kinds";

// A screen's own derivation, tested beside itself under the licence `vitest.config.ts`
// states: data in, data out, and a function this application would still have if React were
// replaced. It is **not** a test of the suggestion list — that has none, deliberately, and
// what it is tested through is `src/core/queries/finder.test.ts`.
//
// What earns the file is the same silent failure the other three walls catch. *Enter lands
// on the record* is the finder's whole promise (#25), and it is one string away from being
// broken: a kind pointed at a segment that does not exist compiles, renders, and hands the
// owner a 404 at the end of the one gesture the finder is for.

const APP = `${SRC}app`;
const GROUP = "(owner)/";

/** Every route in the gated group that opens one record: `(owner)/series/[id]/page.tsx`. */
const recordRoutes = new Set(
  sourceFiles(APP)
    .filter((read) => read.file.startsWith(GROUP) && /\/\[id\]\/page\.tsx$/.test(read.file))
    .map((read) => `/${read.file.slice(GROUP.length).replace("/[id]/page.tsx", "")}`)
);

const finding = (kind: Finding["kind"]): Finding => ({
  kind,
  id: "9f2c",
  name: "Slam Dunk",
  qualifier: null,
});

describe("where a finding's record is", () => {
  // Guards itself as well as the app: a walk that found no detail screens would pass the
  // expectation below for the wrong reason.
  it("finds the record screens it is about to check", () => {
    expect(recordRoutes.size).toBeGreaterThan(0);
  });

  it.each([...FOUND_KINDS])("sends a %s to a screen that exists", (kind) => {
    const href = recordHref(finding(kind));

    expect(href.endsWith("/9f2c")).toBe(true);
    expect(recordRoutes).toContain(href.replace("/9f2c", ""));
  });

  it("names every kind, so a sixth cannot be added and left unlanded", () => {
    expect(FOUND_KINDS.map(headingFor).filter((heading) => heading !== "")).toHaveLength(
      FOUND_KINDS.length
    );
  });
});

describe("banding the answer", () => {
  it("keeps the order the core answered in", () => {
    const found = [finding("path"), finding("story"), finding("series")];

    expect(groupFindings(found).map((group) => group.kind)).toEqual(["story", "series", "path"]);
  });

  it("drops a band with nothing in it", () => {
    expect(groupFindings([finding("person")]).map((group) => group.heading)).toEqual(["People"]);
  });

  it("holds every finding exactly once", () => {
    const found = [finding("story"), finding("story"), finding("volume")];

    expect(groupFindings(found).flatMap((group) => group.findings)).toEqual(found);
  });

  it("bands nothing into nothing", () => {
    expect(groupFindings([])).toEqual([]);
  });
});
