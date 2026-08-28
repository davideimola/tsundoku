import { findStory, listReadStories, listStories } from "@/core/queries/story";
import { listTypes } from "@/core/queries/type";
import { type McpTool, stringArgument } from "../tool.ts";

// The Story area: what the owner has read, and what they thought of it.
//
// **This is the reason the app exists** (ADR-0002, user story 32). Everything else here
// helps an assistant answer *"what should I read next"*; this is the evidence it answers
// from.
//
// Three of these five exist for the **write** door rather than for recommendation, and they
// are here because a Story is one area and not two (`../README.md`, rule 1). A Reading and
// a Rating name a Story by id, so an assistant that cannot look one up cannot record
// anything — and the alternative to looking one up is guessing, which is what ADR-0005's
// boundary exists to stop. `stories_all` is the index, `stories_find` is one Story with its
// Readings, and `stories_types` is the vocabulary a proposal needs.

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

const allStories: McpTool = {
  name: "stories_all",
  title: "Every Story the library knows",
  description: `Every Story by title, with its Type, its state, how many Readings it has and the score
the owner set most recently. The index: it is how you find the id every other tool wants.

The state is derived from the Readings and stored nowhere — \`to-read\`, \`reading\`, \`read\`,
\`abandoned\` — so a Story with no Reading is one they mean to read and not a mistake. Unlike
\`stories_read\`, everything is here, which is what makes this the list to search before concluding
that something is missing: **look here before proposing a Story**, because the owner may have
recorded it under a title they said differently, and a duplicate is permanent.

A Story is the narrative unit they judged, at whatever granularity they chose for that one, so these
are not book titles and there is no volume number in them.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { stories: await listStories() };
  },
};

const oneStory: McpTool = {
  name: "stories_find",
  title: "One Story in full",
  description: `One Story with everything about it: its Credits, every Reading of it — the medium, the
days, whether it finished or was abandoned, and the Volume it went through if there was one — and
every Rating with its prose, its scale and its Provenance.

**This is where a Reading's id comes from**, which is what \`reading_finish\` and \`reading_abandon\`
need: a Reading with no outcome is one still in progress. It is also the honest answer to *"what did I
think of this?"*, because several Readings of one Story each keep the judgement they carried.`,
  inputSchema: {
    type: "object",
    properties: {
      story: { type: "string", description: "The Story's id, from `stories_all`." },
    },
    required: ["story"],
    additionalProperties: false,
  },
  readOnly: true,
  async run(input) {
    return { story: await findStory(stringArgument(input, "story") ?? "") };
  },
};

const types: McpTool = {
  name: "stories_types",
  title: "The Type vocabulary",
  description: `Every Type, with the id a Story carries and the name the owner reads.

A Type is an **attribute** of a Story and never a kind of thing: a novel and a tankōbon differ in
their attributes and never in their shape. It is stored as data and the list grows, so read it rather
than assuming the five you know — and pass an id from here when proposing a Story.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { types: await listTypes() };
  },
};

export default [readStories, allStories, oneStory, types];
