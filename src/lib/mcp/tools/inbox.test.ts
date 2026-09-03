import { describe, expect, it } from "vitest";
import tools from "./inbox.ts";

// **The prose is the product here**, which is why it is the one thing in this directory
// with a test beside it (#53).
//
// Everything a tool file does otherwise is call a query and hand back what it got, and that
// is Seam 1's business, tested beside the query. What a *proposing* tool is, though, is a
// paragraph an assistant reads before it decides whether to invent something — and the
// failure this catches is silent in the way a wall's failures are: a fifth proposing tool
// that words the instruction its own way, or one of these four losing it in an edit,
// changes nothing that any other test can see. The library fills up with duplicates months
// later.
//
// It is text in, verdict out, like `src/app/hotlinked.test.ts` and the other walls: no
// database, no DOM, and nothing here asserts the wording. What it asserts is that every
// tool that proposes names the tool to search with and says what a wrong one costs, which
// is exactly what #53 asked for.

/** The tools that ask the owner for something the assistant is not allowed to write. */
const proposing = tools.filter((tool) => tool.name.startsWith("inbox_propose"));

describe("every tool that proposes", () => {
  it("is all four of them, so the check below is not quietly checking three", () => {
    expect(proposing.map((tool) => tool.name)).toEqual([
      "inbox_propose_story",
      "inbox_propose_volume",
      "inbox_propose_series",
      "inbox_propose_amendment",
    ]);
  });

  it.each(proposing.map((tool) => [tool.name, tool] as const))(
    "%s says to search first, and names the tool to search with",
    (_name, tool) => {
      expect(tool.description).toMatch(/search/i);
      // The finder is the one call that answers over Stories, Volumes and Series at once,
      // so it is the one every proposal names: an assistant that searched the wrong area
      // and found nothing has not searched.
      expect(tool.description).toContain("finder_search");
    }
  );

  it.each(proposing.map((tool) => [tool.name, tool] as const))(
    "%s says what a wrong one costs the owner",
    (_name, tool) => {
      expect(tool.description).toContain("What a wrong one costs the owner");
      // In the owner's own consequences rather than as a policy: they read every entry and
      // turn it down by hand.
      expect(tool.description).toMatch(/by hand/);
    }
  );

  it("says both of those in one place rather than four", () => {
    // The instructions are constants spent by all four, so the descriptions carry them
    // **verbatim**. A tool that reworded one would fail this, which is the whole point: the
    // weakest description in the list is the one an assistant finds a way to read as
    // permission.
    const said = (fragment: string) =>
      proposing.filter((tool) => tool.description.includes(fragment)).length;

    expect(said("**Search before you propose, and say what you searched for.**")).toBe(4);
    expect(said("every entry in this Inbox is read by hand")).toBe(4);
  });
});
