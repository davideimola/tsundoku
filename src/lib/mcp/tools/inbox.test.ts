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

// The same wall, one step further in (#52). A proposed object now names the works it carries,
// which is the one place in this door where a proposal reaches records other than the one it
// proposes — so it is the one place a *second* proposal could be smuggled inside the first.
//
// It is text in, verdict out like everything above: what it asserts is the **shape** of that
// argument, because the shape is what makes the rule unbreakable rather than merely stated.
// A list of plain strings has nowhere to put a title; a list of objects would have, and an
// assistant would find it.
/** The arguments one tool takes, refusing to check nothing where the tool has been renamed. */
function argumentsOf(name: string): Record<string, { type?: string; description?: string }> {
  const tool = tools.find((one) => one.name === name);
  if (!tool) throw new Error(`this area has no tool called ${name}`);
  return (tool.inputSchema.properties ?? {}) as Record<
    string,
    { type?: string; description?: string }
  >;
}

describe("naming the works a proposed object carries", () => {
  it("is offered on the object, because the object is where contents are said", () => {
    expect(argumentsOf("inbox_propose_volume")).toHaveProperty("stories");
  });

  it("takes ids and nothing else, so no title can be proposed inside a volume proposal", () => {
    // Plain strings, not a list of records to create. This is criterion four of the ticket
    // expressed as a schema rather than as a sentence an assistant may read around.
    expect(argumentsOf("inbox_propose_volume").stories).toMatchObject({
      type: "array",
      items: { type: "string" },
    });

    // And the schema is closed, so a `story_title` beside it is not silently accepted either.
    const volume = tools.find((tool) => tool.name === "inbox_propose_volume");
    expect(volume?.inputSchema.additionalProperties).toBe(false);
  });

  it("says where the ids come from, and what a wrong one costs the whole entry", () => {
    const stories = argumentsOf("inbox_propose_volume").stories.description ?? "";

    // The finder is named here for the reason `SEARCH_FIRST` names it: an id is found rather
    // than composed, and an assistant that searched the wrong area has not searched.
    expect(stories).toContain("finder_search");
    expect(stories).toMatch(/never a title/i);
    // The refusal is the whole entry rather than the one id, and an assistant that expected a
    // partial success would tell the owner the object had been catalogued.
    expect(stories).toMatch(/refuses the whole entry/i);
  });

  it("is the object's alone: a Story and a Series carry no works", () => {
    expect(argumentsOf("inbox_propose_story")).not.toHaveProperty("stories");
    expect(argumentsOf("inbox_propose_series")).not.toHaveProperty("stories");
    // Nor is it a field an amendment can name. What an object holds is a record of its own
    // rather than a column on either end of it, which is the line ADR-0012 drew through a
    // Credit — so it is said on the object's page and never amended into it.
    expect(argumentsOf("inbox_propose_amendment")).not.toHaveProperty("stories");
  });
});
