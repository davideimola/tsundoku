import { listReadStories } from "@/core/queries/story";
import type { McpTool } from "../tool.ts";

// The Story area: what the owner has read, and what they thought of it.
//
// **This is the reason the app exists** (ADR-0002, user story 32). Everything else here
// helps an assistant answer *"what should I read next"*; this is the evidence it answers
// from.

const readStories: McpTool = {
  name: "stories_read",
  title: "What the owner has read",
  description: `Every Story the owner has finished, with every Reading of it and the Rating each one
carried: the score out of 10 in half points, the prose they wrote, the grain the score was given in,
and the Provenance of both.

A Story is the narrative unit they judged, at whatever granularity they chose for that one — a
single volume, an arc, or a whole series — so titles here are not book titles. A Story they are
reading right now, or abandoned, or have not started, is not in this list.

Read the prose and the Provenance before the score: "remembered" is the owner's own judgement, while
"goodreads-history" is weaker evidence of the same thing. A Rating's \`scale\` is a separate axis from
where it came from: "half-points" is a score given on this scale, and "coarse" is one the owner gave
out of 5 and doubled onto it — the judgement is theirs, the precision is not, so weigh a coarse 8
as "liked it" rather than as an 8. Start here for any question about taste.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { stories: await listReadStories() };
  },
};

export default [readStories];
