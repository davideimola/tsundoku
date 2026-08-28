import { FIRST_HAND, listProvenances } from "@/core/queries/provenance";
import {
  abandonReading,
  finishReading,
  type Medium,
  type Outcome,
  recordReading,
} from "@/core/verbs/reading";
import { type McpTool, stringArgument } from "../tool.ts";

// The Reading area, and the first of this door's write tools.
//
// A Reading is one act of reading a Story, and recording one is exactly the act ADR-0005
// says an assistant may perform directly: it names a Story that already exists, it is one
// row, and it is wrong in a way the owner spots the moment they look. **It is also the
// reason this app exists at all** — *"I finished volume 23, I'd give it an 8"*, said out
// loud, landing in the database without a form.
//
// What it cannot do is invent the Story. `story` is an id from `stories_all`, and a Story
// nobody has recorded is `inbox_propose_story`'s business.

// `FIRST_HAND` is the core's: the owner telling an assistant what they read is the same
// evidence as typing it themselves, and which Provenance that is is the model's business
// rather than this door's. Anything weaker is worth naming explicitly, which is what
// `reading_provenances` is for.

const PROVENANCE = {
  type: "string",
  description: `A Provenance id from \`reading_provenances\` — how this came to be known, and
therefore how far it can be trusted later. Leave it out when the owner is telling you now: that is
"${FIRST_HAND}", which is the strongest thing here. Name a weaker one when it is weaker:
reading an old export to them is not the same as them remembering it.`,
  default: FIRST_HAND,
};

const DAY = "A day, written 2024-03-11. Leave it out where the owner did not say one.";

const record: McpTool = {
  name: "reading_record",
  title: "Record a Reading of a Story",
  description: `Record that the owner read — or is reading — a **Story**: when, on paper or digitally,
through which Volume if there was one, and whether they finished it or gave up.

This is the tool for *"I finished Slam Dunk"* and *"I've started the Batman omnibus"*. Give
\`outcome\` when it is over and leave it out while they are still reading: a Reading with no outcome
is what makes the Story read as *reading*, and \`reading_finish\` closes it later.

**It never overwrites and never replaces.** Rereading is ordinary here, so a second Reading of the
same Story is a second row and the Rating the first carried survives beside it. If the owner is
correcting a Reading they just described, that is still a Reading — say so rather than expecting an
edit.

A Reading needs no Volume, and on \`digital\` it must not have one: an owned ebook is not something
this model has, so a digital Reading went through no object. On paper, pass the Volume from
\`collection_search\` when the owner named the object; leave it out when they named the story.

Returns the Reading's id. Pass it to \`rating_set\` as \`reading\` when the owner scores it in the
same breath — that is what ties the judgement to this act of reading rather than to the Story in
general, and it is what lets a reread carry a different score.`,
  inputSchema: {
    type: "object",
    properties: {
      story: {
        type: "string",
        description: `The Story's id, from \`stories_all\`. A Story the library does not have cannot
be read into existence — propose it with \`inbox_propose_story\` and wait for the owner.`,
      },
      medium: {
        type: "string",
        description: `"paper" or "digital", and nothing else. Digital covers an ebook, a reader app
and a scan; it is the only case where there is no object.`,
      },
      outcome: {
        type: "string",
        description: `"finished" or "abandoned". Leave it out for a Reading in progress — abandoning
is as much a fact as finishing, and neither is a failure to record.`,
      },
      started_on: { type: "string", description: DAY },
      ended_on: {
        type: "string",
        description: `${DAY} Only meaningful once the Reading has an outcome.`,
      },
      volume: {
        type: "string",
        description: `The Volume's id, from \`collection_search\`, where the owner read a particular
object. Absent is ordinary, and required on digital.`,
      },
      provenance: PROVENANCE,
    },
    required: ["story", "medium"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    return {
      // The verb refuses a medium or an outcome that is not one of its own — in prose the
      // owner reads — so nothing here checks them: a tool that filtered the vocabulary
      // would be a second place the model is written down (ADR-0002).
      reading: await recordReading({
        storyId: stringArgument(input, "story") ?? "",
        medium: (stringArgument(input, "medium") ?? "") as Medium,
        outcome: stringArgument(input, "outcome") as Outcome | undefined,
        startedOn: stringArgument(input, "started_on"),
        endedOn: stringArgument(input, "ended_on"),
        volumeId: stringArgument(input, "volume"),
        provenanceId: stringArgument(input, "provenance") ?? FIRST_HAND,
      }),
    };
  },
};

const finish: McpTool = {
  name: "reading_finish",
  title: "Close a Reading the owner finished",
  description: `Close a Reading that was in progress: the owner finished it, and the Story stops
reading as *reading*.

The Reading's id comes from \`stories_find\`, which lists every Reading of a Story with its state.
Refused on a Reading that has already ended — reading something again is a new Reading
(\`reading_record\`), never an edit of the old one, because the judgement the old one carried belongs
to that act of reading.`,
  inputSchema: {
    type: "object",
    properties: {
      reading: { type: "string", description: "The Reading's id, from `stories_find`." },
      ended_on: { type: "string", description: DAY },
    },
    required: ["reading"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    await finishReading(
      stringArgument(input, "reading") ?? "",
      stringArgument(input, "ended_on") ?? null
    );
    return { finished: true };
  },
};

const abandon: McpTool = {
  name: "reading_abandon",
  title: "Close a Reading the owner gave up on",
  description: `Close a Reading that was in progress: the owner gave up, and the Story reads
*abandoned* unless they finished it some other time.

Abandoning is a fact worth recording rather than an absence — it is evidence about taste, and a
recommender should weigh it. Refused on a Reading that has already ended.`,
  inputSchema: {
    type: "object",
    properties: {
      reading: { type: "string", description: "The Reading's id, from `stories_find`." },
      ended_on: { type: "string", description: DAY },
    },
    required: ["reading"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    await abandonReading(
      stringArgument(input, "reading") ?? "",
      stringArgument(input, "ended_on") ?? null
    );
    return { abandoned: true };
  },
};

const provenances: McpTool = {
  name: "reading_provenances",
  title: "The Provenance vocabulary",
  description: `Every Provenance, with the id a Reading or a Rating carries and the sentence saying
how far that kind of record can be trusted.

Read it rather than assuming: it is a vocabulary that grows, and it is the axis a recommender weighs
evidence on. It is **origin only** — how coarse a score is is a separate question, on the Rating's
own \`scale\`.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { provenances: await listProvenances() };
  },
};

export default [record, finish, abandon, provenances];
