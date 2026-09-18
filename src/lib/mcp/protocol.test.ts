import { describe, expect, it } from "vitest";

import { answer } from "./protocol.ts";
import type { McpTool } from "./tool.ts";

// Seam 2's arithmetic, and it is the framing rather than the model: a wire contract in, a
// verdict out, no database and no bundler. `answer` takes the tool list as an argument, which
// is what lets this file hand it two tools of its own instead of the door's thirty-odd.
//
// **What it is about is the argument nobody read.** Every schema on this door says
// `additionalProperties: false`, and nothing made that true: an argument a tool did not
// declare was dropped in silence, and the call succeeded. That is not a tidiness problem, it
// is how a rename becomes a wrong permanent record — `rating_set` took `reading` before #59
// and takes `pass` now, so an assistant holding the older photograph of the tool list sent
// `reading`, and the door wrote the score attached to **nothing** and answered with an id. A
// standalone Rating is a real thing here, so the row looked ordinary and the owner was told
// three times it was fixed.
//
// A client that photographs the tool list has no signal to take another photograph
// (`./README.md`), so this is the normal consequence of shipping a rename rather than an edge
// case — which is why the refusal is a wall and not a nicety.

/** One write tool, shaped like the door's own and answering with what it was given. */
const tool: McpTool = {
  name: "rating_set",
  title: "Set the owner's Rating of a Story",
  description: "A score, and the Pass it came out of.",
  inputSchema: {
    type: "object",
    properties: { story: { type: "string" }, score: { type: "number" }, pass: { type: "string" } },
    required: ["story", "score"],
    additionalProperties: false,
  },
  readOnly: false,
  destructive: true,
  async run(input) {
    return { saw: Object.keys(input).sort() };
  },
};

/** The one shape a tool that takes nothing has, which the rule has to answer for too. */
const takesNothing: McpTool = {
  name: "pile_next",
  title: "What to take on next",
  description: "The Pile.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { pile: [] };
  },
};

const mounted = async () => [tool, takesNothing];

/** One `tools/call`, as a client sends it. */
function call(name: string, args: Record<string, unknown>) {
  return answer(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name, arguments: args },
    }),
    mounted
  );
}

describe("an argument the tool does not take", () => {
  it("refuses the call rather than dropping it", async () => {
    const said = await call("rating_set", { story: "s1", score: 10, reading: "p1" });

    expect(said?.error?.code).toBe(-32602);
    // Named, because the reader is a program that can retry: a refusal saying *bad arguments*
    // would leave an assistant guessing which of the three it sent was wrong.
    expect(said?.error?.message).toContain("`reading`");
  });

  // The half that makes it actionable in the same turn rather than in another conversation.
  it("says what the tool does take", async () => {
    const said = await call("rating_set", { story: "s1", score: 10, reading: "p1" });

    for (const argument of ["`pass`", "`score`", "`story`"]) {
      expect(said?.error?.message).toContain(argument);
    }
  });

  // The cause is almost always a stale photograph of the tool list, and saying so is what
  // turns a refusal into the one thing the client can actually do about it.
  it("says the list may be out of date", async () => {
    const said = await call("rating_set", { story: "s1", score: 10, reading: "p1" });

    expect(said?.error?.message).toMatch(/older list/i);
  });

  it("names every unknown argument and not only the first", async () => {
    const said = await call("rating_set", { story: "s1", score: 10, reading: "p1", medium: "pc" });

    expect(said?.error?.message).toContain("`reading`");
    expect(said?.error?.message).toContain("`medium`");
  });

  it("writes nothing, which is the whole point", async () => {
    const said = await call("rating_set", { story: "s1", score: 10, reading: "p1" });

    expect(said?.result).toBeUndefined();
  });

  it("refuses an argument sent to a tool that takes none", async () => {
    const said = await call("pile_next", { type: "videogame" });

    expect(said?.error?.code).toBe(-32602);
    expect(said?.error?.message).toContain("no arguments at all");
  });
});

describe("an argument the tool does take", () => {
  it("reaches it", async () => {
    const said = await call("rating_set", { story: "s1", score: 10, pass: "p1" });

    expect(said?.result).toEqual({
      content: [
        { type: "text", text: JSON.stringify({ saw: ["pass", "score", "story"] }, null, 2) },
      ],
    });
  });

  // Absent is not unknown. Everything on this door but `story` and `score` is optional, and a
  // rule that could not tell the two apart would refuse every ordinary call.
  it("lets an optional one be left out", async () => {
    const said = await call("rating_set", { story: "s1", score: 10 });

    expect(said?.error).toBeUndefined();
  });

  it("lets a tool that takes nothing be called with nothing", async () => {
    const said = await call("pile_next", {});

    expect(said?.error).toBeUndefined();
  });
});

describe("a tool that is not here", () => {
  // Unchanged by the rule above, and checked because the unknown-argument branch runs after
  // the tool is found: a call naming no tool must still say so rather than complaining about
  // arguments to something that does not exist.
  it("is still the thing that is said", async () => {
    const said = await call("reading_record", { story: "s1" });

    expect(said?.error?.message).toContain("no tool called");
  });
});
